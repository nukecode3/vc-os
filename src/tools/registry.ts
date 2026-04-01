/**
 * Tool registry — modeled after Claude Code's tools.ts
 *
 * Flat registry of all available tools. Agents receive a tool allowlist
 * and can only use tools in their list (or all tools with ['*']).
 */

import { Tool } from "../types/tool.js";

const toolRegistry = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  if (toolRegistry.has(tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered`);
  }
  toolRegistry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values());
}

export function resolveTools(allowlist: string[] | ["*"]): Tool[] {
  if (allowlist[0] === "*") {
    return getAllTools();
  }
  return allowlist
    .map((name) => toolRegistry.get(name))
    .filter((t): t is Tool => t !== undefined);
}

export function getToolSchemas(tools: Tool[]): Array<{
  name: string;
  description: string;
  input_schema: unknown;
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
