/**
 * Context Compaction Service
 *
 * Modeled after Claude Code's services/compact/:
 * - Summarizes long conversation/research histories to stay within token limits
 * - Preserves key findings while reducing noise
 * - Used by the coordinator when agent outputs get too large
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface CompactConfig {
  maxTokens: number; // Target token count after compaction
  minTextBlockMessages: number; // Minimum messages before compaction triggers
  preserveRecent: number; // Number of recent messages to keep verbatim
}

const DEFAULT_CONFIG: CompactConfig = {
  maxTokens: 40_000,
  minTextBlockMessages: 5,
  preserveRecent: 3,
};

/**
 * Estimate token count for a string (rough: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compact a research output by summarizing while preserving key data points.
 * Used when agent research exceeds reasonable context size.
 */
export async function compactResearchOutput(
  agentType: string,
  output: string,
  targetTokens: number = 2000,
): Promise<string> {
  const currentTokens = estimateTokens(output);
  if (currentTokens <= targetTokens) return output;

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: targetTokens,
    messages: [
      {
        role: "user",
        content: `Summarize this ${agentType} research output. Preserve all specific data points (numbers, names, scores, URLs) but remove redundancy and verbose explanations. Keep the summary under ${targetTokens} tokens.

Research output:
${output}

Produce a concise summary preserving all key findings and data.`,
      },
    ],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Compact deal research history. When a deal has been through multiple
 * rounds of research, compress earlier rounds into summaries.
 */
export async function compactDealHistory(
  dealId: string,
  taskOutputs: Array<{ type: string; output: string; timestamp: Date }>,
  config: CompactConfig = DEFAULT_CONFIG,
): Promise<{
  summary: string;
  recentOutputs: Array<{ type: string; output: string }>;
}> {
  if (taskOutputs.length <= config.preserveRecent) {
    return {
      summary: "",
      recentOutputs: taskOutputs.map(({ type, output }) => ({ type, output })),
    };
  }

  // Keep recent outputs verbatim, compact older ones
  const toCompact = taskOutputs.slice(0, -config.preserveRecent);
  const recent = taskOutputs.slice(-config.preserveRecent);

  const compactedText = toCompact
    .map((t) => `[${t.type}] ${t.output}`)
    .join("\n\n---\n\n");

  const summary = await compactResearchOutput(
    "deal_history",
    compactedText,
    config.maxTokens,
  );

  return {
    summary,
    recentOutputs: recent.map(({ type, output }) => ({ type, output })),
  };
}

/**
 * Auto-compact check — determines if compaction is needed based on total size.
 */
export function shouldCompact(
  totalTokenEstimate: number,
  threshold: number = 50_000,
): boolean {
  return totalTokenEstimate > threshold;
}
