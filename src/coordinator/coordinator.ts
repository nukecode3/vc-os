/**
 * Coordinator — the orchestrator layer.
 *
 * Modeled directly after Claude Code's coordinatorMode.ts:
 * - Maintains a persistent task queue (survives restarts)
 * - Spawns sub-agents per deal with fresh context
 * - Runs independent agents in parallel, synthesizes results
 * - Alerts via Slack when a deal crosses score threshold
 * - Auto-ingests new YC batches on schedule
 *
 * This is the "brain" that ties all five layers together.
 */

import { AppState, AppConfig, DealRecord, TaskState } from "../types/tool.js";
import { AgentDefinition, AgentResult, TaskNotification } from "../types/agent.js";
import { loadPersistedTasks, registerTask, updateTaskState, getTasksByStatus } from "../tasks/framework.js";
import { initializeSchema } from "../services/vector/database.js";

// -------------------------------------------------------------------
// Agent Registry (like Claude Code's tools.ts for agents)
// -------------------------------------------------------------------

import { ycScraperAgent } from "../agents/ingestion/ycScraper.js";
import { vcPortfolioAgent } from "../agents/ingestion/vcPortfolio.js";
import { founderProfileAgent } from "../agents/ingestion/founderProfile.js";
import { marketResearchAgent } from "../agents/intelligence/marketResearch.js";
import { founderAnalysisAgent } from "../agents/intelligence/founderAnalysis.js";
import { ratingEngineAgent } from "../agents/intelligence/ratingEngine.js";
import { emailOutreachAgent } from "../agents/outreach/emailOutreach.js";
import { dealMemoAgent } from "../agents/outreach/dealMemo.js";

const AGENT_REGISTRY: Map<string, AgentDefinition> = new Map([
  ["yc_scraper", ycScraperAgent],
  ["vc_portfolio", vcPortfolioAgent],
  ["founder_profile", founderProfileAgent],
  ["market_research", marketResearchAgent],
  ["founder_analysis", founderAnalysisAgent],
  ["rating_engine", ratingEngineAgent],
  ["email_outreach", emailOutreachAgent],
  ["deal_memo", dealMemoAgent],
]);

// -------------------------------------------------------------------
// Coordinator State
// -------------------------------------------------------------------

export interface CoordinatorConfig {
  appConfig: AppConfig;
  scoreThreshold: number; // Deals above this score trigger outreach
  autoIngest: boolean; // Auto-ingest new batches
  autoOutreach: boolean; // Auto-generate outreach for scored deals
  senderName: string;
  senderFirm: string;
  slackWebhookUrl?: string;
  pollIntervalMs: number; // How often to check for new work
}

const DEFAULT_COORDINATOR_CONFIG: Partial<CoordinatorConfig> = {
  scoreThreshold: 6.5,
  autoIngest: true,
  autoOutreach: false, // Require manual approval for outreach
  pollIntervalMs: 60_000, // 1 minute
};

export class Coordinator {
  private state: AppState;
  private config: CoordinatorConfig;
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private taskNotifications: TaskNotification[] = [];

  constructor(config: CoordinatorConfig) {
    this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config } as CoordinatorConfig;

    // Initialize state with persisted tasks
    const persistedTasks = loadPersistedTasks();

    this.state = {
      tasks: persistedTasks,
      deals: new Map(),
      agents: new Map(),
      config: config.appConfig,
    };
  }

  // -------------------------------------------------------------------
  // State accessors (passed to agents as context)
  // -------------------------------------------------------------------

  getState = (): AppState => this.state;

  setState = (fn: (prev: AppState) => AppState): void => {
    this.state = fn(this.state);
  };

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  async initialize(): Promise<void> {
    console.log("[coordinator] Initializing...");
    await initializeSchema(this.config.appConfig.databaseUrl);
    console.log("[coordinator] Database schema ready");

    // Seed vector stores if empty
    const { seedSuccessPatterns } = await import("../services/vector/successPatterns.js");
    const { seedFounderArchetypes } = await import("../services/vector/founderArchetypes.js");

    await Promise.all([
      seedSuccessPatterns(this.config.appConfig.databaseUrl),
      seedFounderArchetypes(this.config.appConfig.databaseUrl),
    ]);

    console.log("[coordinator] Vector stores seeded");
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.initialize();
    console.log("[coordinator] Started — polling every ${this.config.pollIntervalMs}ms");

    // Main loop — like Claude Code's KAIROS tick-based operation
    this.pollTimer = setInterval(() => this.tick(), this.config.pollIntervalMs);

    // Run first tick immediately
    await this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log("[coordinator] Stopped");
  }

  // -------------------------------------------------------------------
  // Main tick — the coordinator's heartbeat
  // -------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (!this.running) return;

    try {
      // Process any pending task notifications from workers
      await this.processNotifications();

      // Check for deals that need scoring
      await this.processUnscoredDeals();

      // Check for scored deals above threshold that need outreach
      if (this.config.autoOutreach) {
        await this.processOutreachQueue();
      }

      // Garbage collect completed tasks
      const { evictTerminalTasks } = await import("../tasks/framework.js");
      evictTerminalTasks(this.setState);
    } catch (error) {
      console.error(`[coordinator] Tick error: ${error}`);
    }
  }

  // -------------------------------------------------------------------
  // Deal Processing Pipeline
  // -------------------------------------------------------------------

  /**
   * Ingest a new batch of companies. This is the entry point for new data.
   * Equivalent to Claude Code's coordinator receiving a user message.
   */
  async ingestYCBatch(batch?: string): Promise<void> {
    console.log(`[coordinator] Ingesting YC batch: ${batch || "latest"}`);
    const { runYCIngestion } = await import("../agents/ingestion/ycScraper.js");

    await runYCIngestion(this.getState, this.setState, {
      batch,
      scrapePGEssays: true,
      scrapeYouTube: false, // Skip YouTube for speed
    });
  }

  async ingestVCPortfolios(firms?: string[]): Promise<void> {
    console.log(`[coordinator] Ingesting VC portfolios: ${firms?.join(", ") || "all"}`);
    const { runVCPortfolioIngestion } = await import("../agents/ingestion/vcPortfolio.js");

    await runVCPortfolioIngestion(this.getState, this.setState, {
      firms,
      enrichWithCrunchbase: true,
    });
  }

  /**
   * Score a specific deal — runs the full intelligence pipeline.
   * Spawns market research + founder analysis in PARALLEL (Claude Code pattern),
   * then synthesizes with the rating engine.
   */
  async scoreDeal(dealId: string): Promise<void> {
    const deal = this.state.deals.get(dealId);
    if (!deal) {
      console.error(`[coordinator] Deal not found: ${dealId}`);
      return;
    }

    console.log(`[coordinator] Scoring deal: ${deal.companyName}`);
    const { runIntelligencePipeline } = await import("../agents/intelligence/ratingEngine.js");

    const result = await runIntelligencePipeline(deal, this.getState, this.setState);

    // Send notification
    this.taskNotifications.push({
      taskId: `score_${dealId}`,
      agentId: "rating_engine",
      status: "completed",
      summary: `${deal.companyName}: ${result.dealScore.compositeScore}/10 — ${result.dealScore.recommendation}`,
      structuredData: result,
    });

    // Alert if above threshold
    if (result.dealScore.compositeScore >= this.config.scoreThreshold) {
      await this.sendAlert(
        `Deal Alert: ${deal.companyName}`,
        `Score: ${result.dealScore.compositeScore}/10\n` +
        `Recommendation: ${result.dealScore.recommendation}\n` +
        `Bull case: ${result.dealScore.bullCase}\n` +
        `One-liner: ${result.dealScore.oneLiner}`,
      );
    }
  }

  /**
   * Generate outreach for a scored deal.
   */
  async generateOutreach(dealId: string): Promise<void> {
    const deal = this.state.deals.get(dealId);
    if (!deal) return;

    const { generateOutreachCampaign } = await import("../agents/outreach/emailOutreach.js");
    const { generateDealMemo } = await import("../agents/outreach/dealMemo.js");

    // Get the deal score from task output
    const scoreTasks = Array.from(this.state.tasks.values())
      .filter((t) => t.dealId === dealId && t.type === "score_startup" && t.status === "completed");
    const latestScore = scoreTasks.length > 0 ? JSON.parse(scoreTasks[scoreTasks.length - 1].output || "{}") : null;

    if (!latestScore) {
      console.error(`[coordinator] No score found for deal ${dealId}`);
      return;
    }

    // Get research data
    const marketTasks = Array.from(this.state.tasks.values())
      .filter((t) => t.dealId === dealId && t.type === "research_market" && t.status === "completed");
    const founderTasks = Array.from(this.state.tasks.values())
      .filter((t) => t.dealId === dealId && t.type === "research_founder" && t.status === "completed");

    const marketResearch = marketTasks.length > 0 ? JSON.parse(marketTasks[marketTasks.length - 1].output || "{}") : null;
    const founderAnalysis = founderTasks.length > 0 ? JSON.parse(founderTasks[founderTasks.length - 1].output || "{}") : null;

    // Run outreach and memo generation in parallel
    await Promise.all([
      generateOutreachCampaign(
        deal,
        latestScore,
        this.config.senderName,
        this.config.senderFirm,
        this.getState,
        this.setState,
      ),
      marketResearch && founderAnalysis
        ? generateDealMemo(deal, latestScore, marketResearch, founderAnalysis, this.getState, this.setState)
        : Promise.resolve(null),
    ]);
  }

  // -------------------------------------------------------------------
  // Automatic Processing
  // -------------------------------------------------------------------

  private async processUnscoredDeals(): Promise<void> {
    const unscored = Array.from(this.state.deals.values())
      .filter((d) => d.status === "discovered" || d.status === "researching");

    for (const deal of unscored.slice(0, 5)) { // Process max 5 per tick
      // Check if already being scored
      const activeTasks = Array.from(this.state.tasks.values())
        .filter((t) => t.dealId === deal.id && t.status === "running");

      if (activeTasks.length === 0) {
        await this.scoreDeal(deal.id);
      }
    }
  }

  private async processOutreachQueue(): Promise<void> {
    const readyForOutreach = Array.from(this.state.deals.values())
      .filter((d) => d.status === "scored" && (d.score || 0) >= this.config.scoreThreshold);

    for (const deal of readyForOutreach.slice(0, 3)) { // Max 3 per tick
      await this.generateOutreach(deal.id);
    }
  }

  private async processNotifications(): Promise<void> {
    while (this.taskNotifications.length > 0) {
      const notification = this.taskNotifications.shift()!;
      console.log(
        `[coordinator] Task notification: ${notification.agentId} — ${notification.status}: ${notification.summary}`,
      );
    }
  }

  // -------------------------------------------------------------------
  // Alerting
  // -------------------------------------------------------------------

  private async sendAlert(title: string, message: string): Promise<void> {
    console.log(`\n${"=".repeat(60)}\n[ALERT] ${title}\n${message}\n${"=".repeat(60)}\n`);

    const webhookUrl = this.config.slackWebhookUrl || this.config.appConfig.slackWebhookUrl;
    if (!webhookUrl) return;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `*${title}*\n${message}`,
        }),
      });
    } catch (error) {
      console.error(`[coordinator] Slack alert failed: ${error}`);
    }
  }

  // -------------------------------------------------------------------
  // Status & Inspection
  // -------------------------------------------------------------------

  getStatus(): {
    running: boolean;
    deals: { total: number; byStatus: Record<string, number> };
    tasks: { total: number; byStatus: Record<string, number> };
    agents: { total: number; active: number };
  } {
    const dealsByStatus: Record<string, number> = {};
    for (const deal of this.state.deals.values()) {
      dealsByStatus[deal.status] = (dealsByStatus[deal.status] || 0) + 1;
    }

    const tasksByStatus: Record<string, number> = {};
    for (const task of this.state.tasks.values()) {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    }

    const activeAgents = Array.from(this.state.agents.values())
      .filter((a) => a.status === "running").length;

    return {
      running: this.running,
      deals: { total: this.state.deals.size, byStatus: dealsByStatus },
      tasks: { total: this.state.tasks.size, byStatus: tasksByStatus },
      agents: { total: this.state.agents.size, active: activeAgents },
    };
  }

  getDeals(): DealRecord[] {
    return Array.from(this.state.deals.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  getDeal(dealId: string): DealRecord | undefined {
    return this.state.deals.get(dealId);
  }
}
