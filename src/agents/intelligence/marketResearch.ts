/**
 * Market Research Agent
 *
 * Given a startup's sector, produces:
 * - TAM estimate with sources
 * - Top 5 competitors with funding history
 * - Trend velocity (news volume, Google Trends signal)
 * - Regulatory risk flags
 *
 * Modeled after Claude Code's sub-agent pattern: receives a task from the coordinator,
 * uses tools (web_scraper, api_client, semantic_search), and returns structured output.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AgentDefinition } from "../../types/agent.js";
import { TaskState, DealRecord } from "../../types/tool.js";
import { webScraperTool } from "../../tools/webScraper.js";
import { semanticSearch } from "../../services/vector/embeddings.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";

export const marketResearchAgent: AgentDefinition = {
  agentType: "market_research",
  description: "Researches market size, competitors, trends, and regulatory risks for a startup",
  whenToUse: "When scoring a deal — runs in parallel with founder analysis and rating engine",
  tools: ["web_scraper", "api_client"],
  maxTurns: 15,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the Market Research agent for a VC operating system.
Given a startup description, produce a structured market analysis:
1. TAM/SAM/SOM estimate with reasoning
2. Top 5 competitors with funding data
3. Trend velocity assessment
4. Regulatory risk flags

Be specific, cite sources, and quantify where possible.
Task: ${task.description}`;
  },
};

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export interface MarketResearchResult {
  dealId: string;
  sector: string;
  tam: TAMEstimate;
  competitors: Competitor[];
  trendVelocity: TrendVelocity;
  regulatoryRisks: RegulatoryRisk[];
  marketScore: number; // 0-10
  summary: string;
}

export interface TAMEstimate {
  tam: string; // e.g. "$50B"
  sam: string;
  som: string;
  growthRate: string; // e.g. "15% CAGR"
  sources: string[];
  confidence: "high" | "medium" | "low";
}

export interface Competitor {
  name: string;
  funding: string;
  stage: string;
  description: string;
  differentiator: string;
  threat: "high" | "medium" | "low";
}

export interface TrendVelocity {
  newsVolume: "increasing" | "stable" | "decreasing";
  searchTrend: "increasing" | "stable" | "decreasing";
  investorInterest: "hot" | "warm" | "cool" | "cold";
  recentSignals: string[];
  score: number; // 0-10
}

export interface RegulatoryRisk {
  area: string;
  description: string;
  severity: "critical" | "moderate" | "low";
  jurisdictions: string[];
}

// -------------------------------------------------------------------
// Claude-powered Research
// -------------------------------------------------------------------

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function runMarketResearch(
  deal: DealRecord,
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
): Promise<MarketResearchResult> {
  const task = registerTask(
    "research_market",
    `Market research: ${deal.companyName} (${deal.sector})`,
    getState,
    setState,
    deal.id,
  );
  updateTaskState(task.id, { status: "running" }, getState, setState);

  try {
    // Step 1: Gather context from vector store
    const vectorContext = await semanticSearch(
      `${deal.sector} market size competitors funding`,
      "company",
      5,
    );

    const relatedCompanies = vectorContext
      .map((r) => `- ${r.metadata?.companyName || "Unknown"}: ${r.text.slice(0, 200)}`)
      .join("\n");

    // Step 2: Ask Claude to analyze the market
    const analysisPrompt = `Analyze the market for this startup:

Company: ${deal.companyName}
Sector: ${deal.sector}
Stage: ${deal.stage}
Description: ${(deal.metadata as any)?.description || "N/A"}

Related companies in our database:
${relatedCompanies || "None found"}

Produce a structured JSON analysis with these exact fields:
{
  "tam": { "tam": "$XB", "sam": "$XB", "som": "$XM", "growthRate": "X% CAGR", "sources": ["..."], "confidence": "high|medium|low" },
  "competitors": [{ "name": "...", "funding": "$XM", "stage": "Series X", "description": "...", "differentiator": "...", "threat": "high|medium|low" }],
  "trendVelocity": { "newsVolume": "increasing|stable|decreasing", "searchTrend": "increasing|stable|decreasing", "investorInterest": "hot|warm|cool|cold", "recentSignals": ["..."], "score": 0-10 },
  "regulatoryRisks": [{ "area": "...", "description": "...", "severity": "critical|moderate|low", "jurisdictions": ["..."] }],
  "marketScore": 0-10,
  "summary": "2-3 sentence summary"
}

Be specific and realistic. Base TAM on real market data where possible. Output ONLY valid JSON.`;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse market research response as JSON");
    }

    const analysis = JSON.parse(jsonMatch[0]);

    const result: MarketResearchResult = {
      dealId: deal.id,
      sector: deal.sector,
      tam: analysis.tam || { tam: "Unknown", sam: "Unknown", som: "Unknown", growthRate: "Unknown", sources: [], confidence: "low" },
      competitors: analysis.competitors || [],
      trendVelocity: analysis.trendVelocity || { newsVolume: "stable", searchTrend: "stable", investorInterest: "warm", recentSignals: [], score: 5 },
      regulatoryRisks: analysis.regulatoryRisks || [],
      marketScore: analysis.marketScore || 5,
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
