/**
 * Web scraper tool — general-purpose HTML scraping via Cheerio.
 * Modeled after Claude Code's WebSearchTool pattern.
 */

import { Tool, ToolResult, ToolUseContext } from "../types/tool.js";
import * as cheerio from "cheerio";

interface WebScraperInput {
  url: string;
  selectors?: Record<string, string>;
  waitForJs?: boolean;
}

interface WebScraperOutput {
  url: string;
  title: string;
  text: string;
  extracted: Record<string, string[]>;
  html?: string;
}

export const webScraperTool: Tool<WebScraperInput, WebScraperOutput> = {
  name: "web_scraper",
  description: "Scrape a web page and extract structured data using CSS selectors",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to scrape" },
      selectors: {
        type: "object",
        description: "Map of field names to CSS selectors for targeted extraction",
      },
      waitForJs: {
        type: "boolean",
        description: "Whether to use Playwright for JS-rendered pages",
      },
    },
    required: ["url"],
  },

  async execute(input, _context): Promise<ToolResult<WebScraperOutput>> {
    try {
      let html: string;

      if (input.waitForJs) {
        html = await scrapeWithPlaywright(input.url);
      } else {
        const response = await fetch(input.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });
        html = await response.text();
      }

      const $ = cheerio.load(html);

      // Remove script and style tags for clean text
      $("script, style, noscript").remove();

      const title = $("title").text().trim();
      const text = $("body").text().replace(/\s+/g, " ").trim();

      // Extract fields using provided selectors
      const extracted: Record<string, string[]> = {};
      if (input.selectors) {
        for (const [field, selector] of Object.entries(input.selectors)) {
          extracted[field] = [];
          $(selector).each((_, el) => {
            const val = $(el).text().trim();
            if (val) extracted[field].push(val);
          });
        }
      }

      return {
        data: { url: input.url, title, text: text.slice(0, 10_000), extracted },
      };
    } catch (error) {
      return {
        data: { url: input.url, title: "", text: "", extracted: {} },
        error: `Scrape failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  getActivityDescription(input) {
    return `Scraping ${input.url}`;
  },
};

async function scrapeWithPlaywright(url: string): Promise<string> {
  // Dynamic import to avoid loading Playwright when not needed
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    return await page.content();
  } finally {
    await browser.close();
  }
}
