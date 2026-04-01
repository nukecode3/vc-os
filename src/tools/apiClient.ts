/**
 * API client tool — wrapper for REST API calls to external services.
 * Used by ingestion agents for Crunchbase, Proxycurl, GitHub, etc.
 */

import { Tool, ToolResult, ToolUseContext } from "../types/tool.js";

interface ApiClientInput {
  service: "crunchbase" | "proxycurl" | "github" | "youtube";
  endpoint: string;
  method?: "GET" | "POST";
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface ApiClientOutput {
  status: number;
  data: unknown;
}

const SERVICE_BASE_URLS: Record<string, string> = {
  crunchbase: "https://api.crunchbase.com/api/v4",
  proxycurl: "https://nubela.co/proxycurl/api/v2",
  github: "https://api.github.com",
  youtube: "https://www.googleapis.com/youtube/v3",
};

export const apiClientTool: Tool<ApiClientInput, ApiClientOutput> = {
  name: "api_client",
  description: "Make authenticated API calls to external data services",
  inputSchema: {
    type: "object",
    properties: {
      service: {
        type: "string",
        enum: ["crunchbase", "proxycurl", "github", "youtube"],
      },
      endpoint: { type: "string", description: "API endpoint path" },
      method: { type: "string", enum: ["GET", "POST"] },
      params: { type: "object", description: "Query parameters" },
      body: { type: "object", description: "Request body for POST" },
    },
    required: ["service", "endpoint"],
  },

  async execute(input, context): Promise<ToolResult<ApiClientOutput>> {
    const baseUrl = SERVICE_BASE_URLS[input.service];
    if (!baseUrl) {
      return { data: { status: 0, data: null }, error: `Unknown service: ${input.service}` };
    }

    const url = new URL(`${baseUrl}${input.endpoint}`);

    // Add auth headers per service
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const config = context.config;
    switch (input.service) {
      case "crunchbase":
        url.searchParams.set("user_key", config.crunchbaseApiKey || "");
        break;
      case "proxycurl":
        headers["Authorization"] = `Bearer ${config.proxycurlApiKey || ""}`;
        break;
      case "github":
        headers["Accept"] = "application/vnd.github.v3+json";
        break;
      case "youtube":
        url.searchParams.set("key", config.anthropicApiKey); // reuse or add dedicated key
        break;
    }

    // Add query params
    if (input.params) {
      for (const [key, val] of Object.entries(input.params)) {
        url.searchParams.set(key, val);
      }
    }

    try {
      const response = await fetch(url.toString(), {
        method: input.method || "GET",
        headers,
        body: input.body ? JSON.stringify(input.body) : undefined,
      });

      const data = await response.json();
      return { data: { status: response.status, data } };
    } catch (error) {
      return {
        data: { status: 0, data: null },
        error: `API call failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  getActivityDescription(input) {
    return `Calling ${input.service} API: ${input.endpoint}`;
  },
};
