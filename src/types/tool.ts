/**
 * Tool interface — modeled after Claude Code's Tool.ts
 *
 * Each tool has a name, schema, and execute function.
 * Tools are registered in a flat registry and resolved by name.
 * Sub-agents receive a tool allowlist (string[] or ['*'] for all).
 */

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolResult<T = unknown> {
  data: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolUseContext {
  agentId: string;
  abortSignal?: AbortSignal;
  config: AppConfig;
  getState: () => AppState;
  setState: (fn: (prev: AppState) => AppState) => void;
}

export interface Tool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  execute(input: TInput, context: ToolUseContext): Promise<ToolResult<TOutput>>;
  getActivityDescription?(input: TInput): string;
}

export interface AppConfig {
  anthropicApiKey: string;
  databaseUrl: string;
  proxycurlApiKey?: string;
  crunchbaseApiKey?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
  sendgridApiKey?: string;
  slackWebhookUrl?: string;
}

export interface AppState {
  tasks: Map<string, TaskState>;
  deals: Map<string, DealRecord>;
  agents: Map<string, AgentState>;
  config: AppConfig;
}

export interface DealRecord {
  id: string;
  companyName: string;
  sector: string;
  stage: string;
  score?: number;
  status: "discovered" | "researching" | "scored" | "outreach" | "passed" | "pursuing";
  founders: FounderProfile[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FounderProfile {
  name: string;
  linkedinUrl?: string;
  githubUrl?: string;
  twitterUrl?: string;
  role: string;
  background: string;
  education?: string[];
  priorExits?: string[];
  domainExpertiseYears?: number;
  archetypeMatch?: string;
}

export interface AgentState {
  id: string;
  type: string;
  status: "idle" | "running" | "completed" | "failed";
  currentTask?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface TaskState {
  id: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  agentId?: string;
  dealId?: string;
  output?: string;
  outputFile?: string;
  startTime?: Date;
  endTime?: Date;
  notified: boolean;
}

export type TaskType =
  | "ingest_yc"
  | "ingest_portfolio"
  | "ingest_founder"
  | "ingest_deck"
  | "research_market"
  | "research_founder"
  | "score_startup"
  | "outreach_email"
  | "generate_memo";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "killed";
