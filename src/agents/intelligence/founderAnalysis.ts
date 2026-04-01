/**
 * Founder Analysis Agent
 *
 * Pulls the founder's structured profile, queries the founder archetype vector store,
 * and generates:
 * - Skill gap analysis
 * - Domain expertise score (0-10)
 * - Execution velocity signals
 * - "PG pattern match" — which Paul Graham essay archetypes fit this founder
 *
 * Runs in parallel with Market Research agent per deal.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentDefinition } from "../../types/agent.js";
import { TaskState, DealRecord, FounderProfile } from "../../types/tool.js";
import { findSimilarFounders } from "../../services/vector/founderArchetypes.js";
import { generatePGReport } from "../../services/vector/pgEssayIndex.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";

export const founderAnalysisAgent: AgentDefinition = {
  agentType: "founder_analysis",
  description: "Deep analysis of founder profiles with archetype matching and PG essay patterns",
  whenToUse: "When scoring a deal — runs in parallel with market research",
  tools: ["api_client"],
  maxTurns: 10,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the Founder Analysis agent. Analyze founders by:
1. Matching against successful founder archetypes
2. Identifying skill gaps and strengths
3. Scoring domain expertise, technical depth, execution velocity
4. Finding PG essay pattern matches
Task: ${task.description}`;
  },
};

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface FounderAnalysisResult {
  dealId: string;
  founders: FounderAssessment[];
  teamScore: number; // 0-10
  teamStrengths: string[];
  teamWeaknesses: string[];
  archetypeMatches: ArchetypeMatch[];
  pgPatternReport: string;
  summary: string;
}

export interface FounderAssessment {
  name: string;
  role: string;
  domainExpertiseScore: number; // 0-10
  technicalDepthScore: number; // 0-10
  executionVelocityScore: number; // 0-10
  leadershipScore: number; // 0-10
  overallScore: number; // 0-10
  strengths: string[];
  weaknesses: string[];
  redFlags: string[];
}

export interface ArchetypeMatch {
  founderName: string;
  matchedArchetype: string;
  matchedCompany: string;
  similarity: number;
  narrative: string;
}

// -------------------------------------------------------------------
// Analysis Logic
// -------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function runFounderAnalysis(
  deal: DealRecord,
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
): Promise<FounderAnalysisResult> {
  const task = registerTask(
    "research_founder",
    `Founder analysis: ${deal.companyName} (${deal.founders.map((f) => f.name).join(", ")})`,
    getState,
    setState,
    deal.id,
  );
  updateTaskState(task.id, { status: "running" }, getState, setState);

  try {
    // Step 1: Query founder archetype store for each founder
    const archetypeMatches: ArchetypeMatch[] = [];
    for (const founder of deal.founders) {
      const description = buildFounderDescription(founder);
      const matches = await findSimilarFounders(description, 3);

      for (const match of matches) {
        archetypeMatches.push({
          founderName: founder.name,
          matchedArchetype: match.archetype.founderName,
          matchedCompany: match.archetype.companyName,
          similarity: match.similarity,
          narrative: match.narrative,
        });
      }
    }

    // Step 2: Generate PG essay pattern report
    const founderDescriptions = deal.founders.map((f) => buildFounderDescription(f)).join("\n\n");
    const startupDescription = `${deal.companyName}: ${(deal.metadata as any)?.description || deal.sector}`;
    const pgReport = await generatePGReport(
      deal.founders[0]?.name || "Unknown",
      founderDescriptions,
      startupDescription,
    );

    // Step 3: Use Claude to synthesize the full analysis
    const analysisPrompt = `Analyze this founding team for a VC investment decision:

Company: ${deal.companyName}
Sector: ${deal.sector}
Stage: ${deal.stage}

Founders:
${deal.founders.map((f) => `- ${f.name} (${f.role}): ${f.background || "No background data"}`).join("\n")}

Archetype matches from our database:
${archetypeMatches.map((m) => `- ${m.founderName} resembles ${m.matchedArchetype} (${m.matchedCompany}) — ${(m.similarity * 100).toFixed(1)}% similarity`).join("\n")}

PG Essay Pattern Report:
${pgReport}

Produce a JSON analysis:
{
  "founders": [{
    "name": "...",
    "role": "...",
    "domainExpertiseScore": 0-10,
    "technicalDepthScore": 0-10,
    "executionVelocityScore": 0-10,
    "leadershipScore": 0-10,
    "overallScore": 0-10,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "redFlags": ["..."]
  }],
  "teamScore": 0-10,
  "teamStrengths": ["..."],
  "teamWeaknesses": ["..."],
  "summary": "2-3 sentence team assessment"
}

Be honest and specific. Score relative to successful startup founders. Output ONLY valid JSON.`;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse founder analysis as JSON");

    const analysis = JSON.parse(jsonMatch[0]);

    const result: FounderAnalysisResult = {
      dealId: deal.id,
      founders: analysis.founders || [],
      teamScore: analysis.teamScore || 5,
      teamStrengths: analysis.teamStrengths || [],
      teamWeaknesses: analysis.teamWeaknesses || [],
      archetypeMatches,
      pgPatternReport: pgReport,
      summary: analysis.summary || "",
    };

    updateTaskState(
      task.id,
      { status: "completed", output: JSON.stringify(result) },
      getState,
      setState,
    );

    return result;
  } catch (error) {
    updateTaskState(task.id, { status: "failed", output: String(error) }, getState, setState);
    throw error;
  }
}

function buildFounderDescription(founder: FounderProfile): string {
  const parts = [`${founder.name}, ${founder.role}`];
  if (founder.background) parts.push(`Background: ${founder.background}`);
  if (founder.education?.length) parts.push(`Education: ${founder.education.join(", ")}`);
  if (founder.priorExits?.length) parts.push(`Prior exits: ${founder.priorExits.join(", ")}`);
  if (founder.domainExpertiseYears) parts.push(`Domain expertise: ${founder.domainExpertiseYears} years`);
  return parts.join(". ");
}
