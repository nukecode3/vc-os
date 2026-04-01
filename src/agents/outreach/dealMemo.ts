/**
 * Deal Memo Generator
 *
 * Pulls all research into a structured IC (Investment Committee) memo.
 * Sections: executive summary, market thesis, team analysis,
 * competitive landscape, risks, comparable exits, recommendation.
 *
 * Outputs Markdown (convertible to PDF or Notion).
 */

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { AgentDefinition } from "../../types/agent.js";
import { TaskState, DealRecord } from "../../types/tool.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";
import type { MarketResearchResult } from "../intelligence/marketResearch.js";
import type { FounderAnalysisResult } from "../intelligence/founderAnalysis.js";
import type { DealScore } from "../intelligence/ratingEngine.js";

export const dealMemoAgent: AgentDefinition = {
  agentType: "deal_memo",
  description: "Generates structured IC deal memos from research data",
  whenToUse: "When a deal is being moved forward for investment committee review",
  tools: [],
  maxTurns: 5,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the Deal Memo Generator. Produce professional IC-quality investment memos.
Task: ${task.description}`;
  },
};

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface DealMemo {
  dealId: string;
  companyName: string;
  markdown: string;
  filePath: string;
  generatedAt: Date;
}

// -------------------------------------------------------------------
// Generation
// -------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function generateDealMemo(
  deal: DealRecord,
  dealScore: DealScore,
  marketResearch: MarketResearchResult,
  founderAnalysis: FounderAnalysisResult,
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
): Promise<DealMemo> {
  const task = registerTask(
    "generate_memo",
    `Generate IC memo: ${deal.companyName}`,
    getState,
    setState,
    deal.id,
  );
  updateTaskState(task.id, { status: "running" }, getState, setState);

  try {
    const memoPrompt = `Generate a professional VC Investment Committee memo in Markdown format.

DEAL DATA:
Company: ${deal.companyName}
Sector: ${deal.sector}
Stage: ${deal.stage}
Description: ${(deal.metadata as any)?.description || "N/A"}

DEAL SCORE: ${dealScore.compositeScore}/10
- Team: ${dealScore.teamScore}/10 — ${dealScore.scoreBreakdown.team.reasoning}
- Market: ${dealScore.marketScore}/10 — ${dealScore.scoreBreakdown.market.reasoning}
- Traction: ${dealScore.tractionScore}/10 — ${dealScore.scoreBreakdown.traction.reasoning}
- Deck: ${dealScore.deckQualityScore}/10 — ${dealScore.scoreBreakdown.deckQuality.reasoning}

RECOMMENDATION: ${dealScore.recommendation}
Bull case: ${dealScore.bullCase}
Bear case: ${dealScore.bearCase}

MARKET:
TAM: ${marketResearch.tam.tam} | SAM: ${marketResearch.tam.sam} | SOM: ${marketResearch.tam.som}
Growth: ${marketResearch.tam.growthRate}
Competitors: ${marketResearch.competitors.map((c) => `${c.name} (${c.funding})`).join(", ")}
Regulatory risks: ${marketResearch.regulatoryRisks.map((r) => `${r.area}: ${r.description}`).join("; ") || "None"}

TEAM:
${founderAnalysis.founders.map((f) => `${f.name} (${f.role}): Overall ${f.overallScore}/10. Strengths: ${f.strengths.join(", ")}. Weaknesses: ${f.weaknesses.join(", ")}`).join("\n")}
Archetype matches: ${founderAnalysis.archetypeMatches.slice(0, 3).map((m) => m.narrative).join(" ")}

PG PATTERN:
${founderAnalysis.pgPatternReport.slice(0, 500)}

COMPARABLES:
${dealScore.comparables?.map((c) => `${c.name} (${c.outcome}): ${c.keyParallel}`).join("\n") || "None"}

Format the memo with these sections:
# [Company Name] — Investment Memo
## Executive Summary
## Market Thesis
## Team Analysis
## Competitive Landscape
## Comparable Companies & Pattern Analysis
## Risk Assessment
## Financial Considerations
## Recommendation
## Appendix: PG Essay Pattern Analysis

Make it professional, data-driven, and concise. Each section should be 2-4 paragraphs max.
Include the deal score prominently. Output ONLY the Markdown memo.`;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: memoPrompt }],
    });

    const markdown = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Save to disk
    const memoDir = join(process.cwd(), "data", "memos");
    if (!existsSync(memoDir)) mkdirSync(memoDir, { recursive: true });

    const slug = deal.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const date = new Date().toISOString().slice(0, 10);
    const filePath = join(memoDir, `${date}_${slug}_memo.md`);
    writeFileSync(filePath, markdown);

    const memo: DealMemo = {
      dealId: deal.id,
      companyName: deal.companyName,
      markdown,
      filePath,
      generatedAt: new Date(),
    };

    updateTaskState(
      task.id,
      { status: "completed", output: JSON.stringify({ filePath }) },
      getState,
      setState,
    );

    console.log(`[deal-memo] Generated: ${filePath}`);
    return memo;
  } catch (error) {
    updateTaskState(task.id, { status: "failed", output: String(error) }, getState, setState);
    throw error;
  }
}
