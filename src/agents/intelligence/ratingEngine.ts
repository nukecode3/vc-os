/**
 * Startup Rating Engine
 *
 * Synthesizes all signals into a weighted composite score:
 *   Score = 0.35 × team + 0.30 × market + 0.20 × traction + 0.15 × deck_quality
 *
 * Each sub-score is 0-10 with explicit reasoning.
 * Produces the score AND a one-paragraph bull case and bear case.
 *
 * This is the coordinator-level synthesis agent — it consumes output
 * from the market research and founder analysis agents.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentDefinition } from "../../types/agent.js";
import { TaskState, DealRecord } from "../../types/tool.js";
import { findSimilarSuccesses } from "../../services/vector/successPatterns.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";
import type { MarketResearchResult } from "./marketResearch.js";
import type { FounderAnalysisResult } from "./founderAnalysis.js";

export const ratingEngineAgent: AgentDefinition = {
  agentType: "rating_engine",
  description: "Synthesizes all research into a weighted deal score with bull/bear cases",
  whenToUse: "After market research and founder analysis are complete for a deal",
  tools: [],
  maxTurns: 5,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the Startup Rating Engine. Synthesize all research signals into a final
deal score and investment recommendation with bull and bear cases.
Task: ${task.description}`;
  },
};

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface DealScore {
  dealId: string;
  companyName: string;
  sector: string;
  stage: string;

  // Component scores (0-10)
  teamScore: number;
  marketScore: number;
  tractionScore: number;
  deckQualityScore: number;

  // Weighted composite
  compositeScore: number;

  // Score breakdown with reasoning
  scoreBreakdown: ScoreBreakdown;

  // Investment thesis
  bullCase: string;
  bearCase: string;
  recommendation: "strong_pass" | "pass" | "maybe" | "interested" | "strong_interest";

  // Comparable companies
  comparables: ComparableCompany[];

  // Generated summary
  oneLiner: string;
  fullSummary: string;

  scoredAt: Date;
}

export interface ScoreBreakdown {
  team: { score: number; weight: number; reasoning: string };
  market: { score: number; weight: number; reasoning: string };
  traction: { score: number; weight: number; reasoning: string };
  deckQuality: { score: number; weight: number; reasoning: string };
}

export interface ComparableCompany {
  name: string;
  outcome: string;
  similarity: number;
  stageAtInvestment: string;
  keyParallel: string;
}

// -------------------------------------------------------------------
// Weights (configurable per investment thesis)
// -------------------------------------------------------------------

export interface ScoringWeights {
  team: number;
  market: number;
  traction: number;
  deckQuality: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  team: 0.35,
  market: 0.30,
  traction: 0.20,
  deckQuality: 0.15,
};

function calculateComposite(
  scores: { team: number; market: number; traction: number; deckQuality: number },
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): number {
  const raw =
    scores.team * weights.team +
    scores.market * weights.market +
    scores.traction * weights.traction +
    scores.deckQuality * weights.deckQuality;
  return Math.round(raw * 100) / 100;
}

function getRecommendation(
  composite: number,
): DealScore["recommendation"] {
  if (composite >= 8.0) return "strong_interest";
  if (composite >= 6.5) return "interested";
  if (composite >= 5.0) return "maybe";
  if (composite >= 3.5) return "pass";
  return "strong_pass";
}

// -------------------------------------------------------------------
// Scoring Logic
// -------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function scoreDeal(
  deal: DealRecord,
  marketResearch: MarketResearchResult,
  founderAnalysis: FounderAnalysisResult,
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
  weights?: ScoringWeights,
): Promise<DealScore> {
  const task = registerTask(
    "score_startup",
    `Score deal: ${deal.companyName}`,
    getState,
    setState,
    deal.id,
  );
  updateTaskState(task.id, { status: "running" }, getState, setState);

  try {
    // Step 1: Find comparable successful companies
    const startupDescription = [
      `Company: ${deal.companyName}`,
      `Sector: ${deal.sector}`,
      `Stage: ${deal.stage}`,
      `Description: ${(deal.metadata as any)?.description || "N/A"}`,
      `Founders: ${deal.founders.map((f) => `${f.name} (${f.role})`).join(", ")}`,
      `Market: TAM ${marketResearch.tam.tam}, growing ${marketResearch.tam.growthRate}`,
    ].join("\n");

    const similarCompanies = await findSimilarSuccesses(startupDescription, 5);

    const comparables: ComparableCompany[] = similarCompanies.map((sc) => ({
      name: sc.pattern.companyName,
      outcome: sc.pattern.outcome,
      similarity: sc.similarity,
      stageAtInvestment: sc.pattern.investmentStage,
      keyParallel: `${sc.pattern.stageSnapshot.founderBackground.split(".")[0]}. Market: ${sc.pattern.stageSnapshot.marketNarrative.split(".")[0]}.`,
    }));

    // Step 2: Use Claude to generate the full scoring with reasoning
    const scoringPrompt = `You are a VC analyst scoring a startup deal. Produce a detailed scoring with explicit reasoning.

DEAL:
Company: ${deal.companyName}
Sector: ${deal.sector}
Stage: ${deal.stage}
Description: ${(deal.metadata as any)?.description || "N/A"}

MARKET RESEARCH:
- TAM: ${marketResearch.tam.tam} (${marketResearch.tam.confidence} confidence)
- SAM: ${marketResearch.tam.sam}
- Growth: ${marketResearch.tam.growthRate}
- Competitors: ${marketResearch.competitors.map((c) => `${c.name} (${c.funding}, ${c.threat} threat)`).join(", ")}
- Trend: investor interest is ${marketResearch.trendVelocity.investorInterest}
- Regulatory risks: ${marketResearch.regulatoryRisks.map((r) => `${r.area} (${r.severity})`).join(", ") || "None identified"}
- Market score from research: ${marketResearch.marketScore}/10

FOUNDER ANALYSIS:
- Team score: ${founderAnalysis.teamScore}/10
- Strengths: ${founderAnalysis.teamStrengths.join(", ")}
- Weaknesses: ${founderAnalysis.teamWeaknesses.join(", ")}
- Top archetype match: ${founderAnalysis.archetypeMatches[0]?.narrative || "None"}
${founderAnalysis.founders.map((f) => `- ${f.name}: domain ${f.domainExpertiseScore}/10, technical ${f.technicalDepthScore}/10, execution ${f.executionVelocityScore}/10`).join("\n")}

COMPARABLE COMPANIES:
${comparables.map((c) => `- ${c.name} (${c.outcome}) — ${(c.similarity * 100).toFixed(1)}% similar. ${c.keyParallel}`).join("\n")}

Score on these dimensions (0-10 each):
1. Team (weight: ${(weights || DEFAULT_WEIGHTS).team * 100}%)
2. Market (weight: ${(weights || DEFAULT_WEIGHTS).market * 100}%)
3. Traction (weight: ${(weights || DEFAULT_WEIGHTS).traction * 100}%)
4. Deck quality (weight: ${(weights || DEFAULT_WEIGHTS).deckQuality * 100}%)

Output JSON:
{
  "teamScore": 0-10,
  "marketScore": 0-10,
  "tractionScore": 0-10,
  "deckQualityScore": 0-10,
  "scoreBreakdown": {
    "team": { "score": N, "reasoning": "..." },
    "market": { "score": N, "reasoning": "..." },
    "traction": { "score": N, "reasoning": "..." },
    "deckQuality": { "score": N, "reasoning": "..." }
  },
  "bullCase": "One paragraph: the strongest case for investing",
  "bearCase": "One paragraph: the strongest case against investing",
  "oneLiner": "One sentence pitch for this deal",
  "fullSummary": "3-5 sentence investment thesis summary"
}

Be rigorous. Score relative to the best startups you've seen at this stage. Output ONLY valid JSON.`;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: scoringPrompt }],
    });

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse rating engine response as JSON");

    const analysis = JSON.parse(jsonMatch[0]);
    const w = weights || DEFAULT_WEIGHTS;

    const scores = {
      team: analysis.teamScore || founderAnalysis.teamScore,
      market: analysis.marketScore || marketResearch.marketScore,
      traction: analysis.tractionScore || 5,
      deckQuality: analysis.deckQualityScore || 5,
    };

    const composite = calculateComposite(scores, w);

    const result: DealScore = {
      dealId: deal.id,
      companyName: deal.companyName,
      sector: deal.sector,
      stage: deal.stage,
      teamScore: scores.team,
      marketScore: scores.market,
      tractionScore: scores.traction,
      deckQualityScore: scores.deckQuality,
      compositeScore: composite,
      scoreBreakdown: {
        team: { score: scores.team, weight: w.team, reasoning: analysis.scoreBreakdown?.team?.reasoning || "" },
        market: { score: scores.market, weight: w.market, reasoning: analysis.scoreBreakdown?.market?.reasoning || "" },
        traction: { score: scores.traction, weight: w.traction, reasoning: analysis.scoreBreakdown?.traction?.reasoning || "" },
        deckQuality: { score: scores.deckQuality, weight: w.deckQuality, reasoning: analysis.scoreBreakdown?.deckQuality?.reasoning || "" },
      },
      bullCase: analysis.bullCase || "",
      bearCase: analysis.bearCase || "",
      recommendation: getRecommendation(composite),
      comparables,
      oneLiner: analysis.oneLiner || "",
      fullSummary: analysis.fullSummary || "",
      scoredAt: new Date(),
    };

    // Update deal record with score
    setState((prev: any) => {
      const deals = new Map(prev.deals);
      const existing = deals.get(deal.id);
      if (existing) {
        deals.set(deal.id, {
          ...existing,
          score: composite,
          status: composite >= 6.5 ? "scored" : "passed",
          updatedAt: new Date(),
        });
      }
      return { ...prev, deals };
    });

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

/**
 * Run the full intelligence pipeline for a deal:
 * Market research + Founder analysis in PARALLEL, then Rating engine.
 *
 * This mirrors Claude Code's coordinator pattern of spawning
 * independent workers in parallel, then synthesizing.
 */
export async function runIntelligencePipeline(
  deal: DealRecord,
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
  weights?: ScoringWeights,
): Promise<{
  marketResearch: MarketResearchResult;
  founderAnalysis: FounderAnalysisResult;
  dealScore: DealScore;
}> {
  console.log(`[intelligence] Starting pipeline for ${deal.companyName}`);

  // Import dynamically to avoid circular deps (same pattern as Claude Code's lazy loading)
  const { runMarketResearch } = await import("./marketResearch.js");
  const { runFounderAnalysis } = await import("./founderAnalysis.js");

  // Phase 1: Run market research and founder analysis IN PARALLEL
  console.log(`[intelligence] Phase 1: Market research + Founder analysis (parallel)`);
  const [marketResearch, founderAnalysis] = await Promise.all([
    runMarketResearch(deal, getState, setState),
    runFounderAnalysis(deal, getState, setState),
  ]);

  // Phase 2: Synthesize with rating engine (depends on Phase 1)
  console.log(`[intelligence] Phase 2: Rating engine (synthesis)`);
  const dealScore = await scoreDeal(deal, marketResearch, founderAnalysis, getState, setState, weights);

  console.log(
    `[intelligence] ${deal.companyName}: ${dealScore.compositeScore}/10 → ${dealScore.recommendation}`,
  );

  return { marketResearch, founderAnalysis, dealScore };
}
