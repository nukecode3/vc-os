/**
 * Agent definition — modeled after Claude Code's AgentDefinition from loadAgentsDir.ts
 *
 * Each agent has a type, tool allowlist, max turns, and system prompt.
 * The coordinator spawns agents by type, passing them a task and context.
 */

import { Tool, ToolUseContext, TaskState } from "./tool.js";

export interface AgentDefinition {
  agentType: string;
  description: string;
  whenToUse: string;
  tools: string[] | ["*"];
  maxTurns: number;
  model: string | "inherit";
  getSystemPrompt: (task: TaskState) => string;
  source: "built-in" | "plugin" | "user";
}

export interface AgentRunOptions {
  definition: AgentDefinition;
  task: TaskState;
  context: ToolUseContext;
  parentMessages?: Message[];
  onProgress?: (progress: AgentProgress) => void;
}

export interface AgentProgress {
  agentId: string;
  turnCount: number;
  tokenCount: number;
  recentActivity: string;
  status: "running" | "completed" | "failed";
}

export interface AgentResult {
  agentId: string;
  taskId: string;
  output: string;
  structuredData?: Record<string, unknown>;
  tokenUsage: TokenUsage;
  turns: number;
  status: "completed" | "failed";
  error?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string | MessageContent[];
  id?: string;
  timestamp?: Date;
}

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

/**
 * Task notification — sent from worker agents back to the coordinator.
 * Modeled after Claude Code's XML task-notification pattern.
 */
export interface TaskNotification {
  taskId: string;
  agentId: string;
  status: "completed" | "failed";
  summary: string;
  structuredData?: Record<string, unknown>;
}
