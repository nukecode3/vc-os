/**
 * YC Portfolio Scraper Agent
 *
 * Scrapes ycombinator.com/companies, cross-references with Crunchbase funding data,
 * and pulls YC YouTube transcripts. Embeds PG essays for semantic matching.
 *
 * Modeled after Claude Code's agent pattern: has a type, tool allowlist, system prompt,
 * and runs within the task framework.
 */

import { AgentDefinition } from "../../types/agent.js";
import { TaskState, DealRecord, FounderProfile } from "../../types/tool.js";
import { webScraperTool } from "../../tools/webScraper.js";
import { apiClientTool } from "../../tools/apiClient.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";
import { v4 as uuidv4 } from "uuid";

// -------------------------------------------------------------------
// Agent Definition (declarative, like Claude Code's loadAgentsDir)
// -------------------------------------------------------------------

export const ycScraperAgent: AgentDefinition = {
  agentType: "yc_scraper",
  description: "Scrapes YC company directory and enriches with funding data",
  whenToUse: "When ingesting new YC batch data or refreshing the YC company database",
  tools: ["web_scraper", "api_client"],
  maxTurns: 50,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the YC Portfolio Scraper agent. Your job is to:
1. Scrape the YC company directory for companies matching the criteria
2. For each company, pull funding data from Crunchbase
3. Extract founder information
4. Store structured records for downstream analysis

Current task: ${task.description}
Task ID: ${task.id}

Output a JSON array of company records with: name, sector, batch, stage, founders, funding, description.`;
  },
};

// -------------------------------------------------------------------
// Scraping Logic
// -------------------------------------------------------------------

export interface YCCompany {
  name: string;
  url: string;
  batch: string;
  sector: string;
  description: string;
  status: string;
  teamSize?: number;
  location?: string;
  founders: FounderProfile[];
  funding?: {
    totalRaised: string;
    lastRound: string;
    lastRoundDate: string;
    investors: string[];
  };
}

const YC_BASE_URL = "https://www.ycombinator.com/companies";

export async function scrapeYCDirectory(
  filters?: { batch?: string; sector?: string; status?: string },
): Promise<YCCompany[]> {
  const url = new URL(YC_BASE_URL);
  if (filters?.batch) url.searchParams.set("batch", filters.batch);
  if (filters?.sector) url.searchParams.set("industry", filters.sector);
  if (filters?.status) url.searchParams.set("status", filters.status);

  const result = await webScraperTool.execute(
    {
      url: url.toString(),
      waitForJs: true,
      selectors: {
        companies: "a[class*='Company']",
        names: "span[class*='company-name'], .company-name",
        descriptions: "span[class*='description'], .company-description",
      },
    },
    {} as any,
  );

  if (result.error) {
    console.error(`[yc-scraper] Failed to scrape directory: ${result.error}`);
    return [];
  }

  // Parse the scraped HTML into structured records
  // The actual selectors depend on YC's current DOM structure
  const companies = parseYCListings(result.data.text, result.data.extracted);
  console.log(`[yc-scraper] Found ${companies.length} companies`);
  return companies;
}

function parseYCListings(
  text: string,
  extracted: Record<string, string[]>,
): YCCompany[] {
  const companies: YCCompany[] = [];
  const names = extracted["names"] || [];
  const descriptions = extracted["descriptions"] || [];

  for (let i = 0; i < names.length; i++) {
    companies.push({
      name: names[i],
      url: `${YC_BASE_URL}/${encodeURIComponent(names[i].toLowerCase().replace(/\s+/g, "-"))}`,
      batch: "",
      sector: "",
      description: descriptions[i] || "",
      status: "Active",
      founders: [],
    });
  }

  return companies;
}

export async function scrapeYCCompanyDetail(companyUrl: string): Promise<Partial<YCCompany>> {
  const result = await webScraperTool.execute(
    {
      url: companyUrl,
      waitForJs: true,
      selectors: {
        batch: ".badge, [class*='batch']",
        sector: "[class*='tag'], [class*='industry']",
        teamSize: "[class*='team-size']",
        founderNames: "[class*='founder'] [class*='name']",
        founderRoles: "[class*='founder'] [class*='role']",
        founderLinkedins: "[class*='founder'] a[href*='linkedin']",
      },
    },
    {} as any,
  );

  if (result.error) return {};

  const e = result.data.extracted;
  const founders: FounderProfile[] = (e["founderNames"] || []).map((name, i) => ({
    name,
    role: e["founderRoles"]?.[i] || "Co-founder",
    linkedinUrl: e["founderLinkedins"]?.[i],
    background: "",
  }));

  return {
    batch: e["batch"]?.[0] || "",
    sector: e["sector"]?.[0] || "",
    teamSize: parseInt(e["teamSize"]?.[0] || "0") || undefined,
    founders,
  };
}

// -------------------------------------------------------------------
// Paul Graham Essay Scraper
// -------------------------------------------------------------------

export interface PGEssay {
  title: string;
  url: string;
  text: string;
  date?: string;
}

const PG_ESSAYS_URL = "http://paulgraham.com/articles.html";

export async function scrapePGEssays(): Promise<PGEssay[]> {
  // First get the index page
  const indexResult = await webScraperTool.execute(
    {
      url: PG_ESSAYS_URL,
      selectors: {
        links: "table table a[href]",
      },
    },
    {} as any,
  );

  if (indexResult.error) {
    console.error(`[pg-essays] Failed to scrape index: ${indexResult.error}`);
    return [];
  }

  // Extract essay URLs from the page text
  const essayUrls = extractPGEssayUrls(indexResult.data.text, indexResult.data.extracted);
  console.log(`[pg-essays] Found ${essayUrls.length} essay URLs`);

  // Scrape each essay (with rate limiting)
  const essays: PGEssay[] = [];
  for (const { title, url } of essayUrls) {
    await delay(500); // Rate limit
    const essayResult = await webScraperTool.execute({ url }, {} as any);
    if (!essayResult.error) {
      essays.push({
        title,
        url,
        text: essayResult.data.text.slice(0, 20_000),
      });
    }
  }

  console.log(`[pg-essays] Scraped ${essays.length} essays`);
  return essays;
}

function extractPGEssayUrls(
  text: string,
  extracted: Record<string, string[]>,
): Array<{ title: string; url: string }> {
  // PG's site has a simple table of links
  const links = extracted["links"] || [];
  return links
    .filter((link) => link.length > 3)
    .map((title) => ({
      title,
      url: `http://paulgraham.com/${title.toLowerCase().replace(/\s+/g, "")}.html`,
    }))
    .slice(0, 250); // Cap at 250 essays
}

// -------------------------------------------------------------------
// YouTube Transcript Scraper (YC talks)
// -------------------------------------------------------------------

export interface YCTalk {
  videoId: string;
  title: string;
  transcript: string;
  speaker?: string;
  date?: string;
}

export async function scrapeYCYouTubeTranscripts(
  channelId: string = "UCcefcZRL2oaA_uBNeo5UOWg", // YC's channel
  maxVideos: number = 50,
): Promise<YCTalk[]> {
  // Use YouTube Data API to list videos
  const result = await apiClientTool.execute(
    {
      service: "youtube",
      endpoint: "/search",
      params: {
        channelId,
        part: "snippet",
        type: "video",
        maxResults: String(maxVideos),
        order: "date",
      },
    },
    {} as any,
  );

  if (result.error || result.data.status !== 200) {
    console.error(`[yt-scraper] Failed: ${result.error}`);
    return [];
  }

  const items = (result.data.data as any)?.items || [];
  const talks: YCTalk[] = [];

  for (const item of items) {
    const videoId = item.id?.videoId;
    const title = item.snippet?.title || "";
    if (!videoId) continue;

    // Get transcript via yt-dlp (auto-generated captions)
    const transcript = await getYouTubeTranscript(videoId);
    if (transcript) {
      talks.push({
        videoId,
        title,
        transcript,
        speaker: extractSpeakerFromTitle(title),
        date: item.snippet?.publishedAt,
      });
    }
  }

  console.log(`[yt-scraper] Got ${talks.length} transcripts`);
  return talks;
}

async function getYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // Use yt-dlp to download auto-generated subtitles
    const { stdout } = await execAsync(
      `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt ` +
        `-o "/tmp/yc_%(id)s" "https://youtube.com/watch?v=${videoId}" 2>/dev/null && ` +
        `cat /tmp/yc_${videoId}.en.vtt 2>/dev/null || echo ""`,
      { timeout: 30_000 },
    );

    if (!stdout.trim()) return null;

    // Strip VTT formatting, keep only text
    return stdout
      .split("\n")
      .filter((line) => !line.match(/^(WEBVTT|\d|-->|\s*$)/))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30_000);
  } catch {
    return null;
  }
}

function extractSpeakerFromTitle(title: string): string {
  // Common YC talk formats: "Speaker Name - Topic" or "Topic by Speaker Name"
  const dashMatch = title.match(/^(.+?)\s*[-–—]\s*/);
  if (dashMatch) return dashMatch[1].trim();

  const byMatch = title.match(/\bby\s+(.+?)(?:\s*[|]|$)/i);
  if (byMatch) return byMatch[1].trim();

  return "";
}

// -------------------------------------------------------------------
// Orchestration: Run full YC ingestion pipeline
// -------------------------------------------------------------------

export async function runYCIngestion(
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
  options?: { batch?: string; scrapePGEssays?: boolean; scrapeYouTube?: boolean },
): Promise<{
  companies: YCCompany[];
  essays: PGEssay[];
  talks: YCTalk[];
}> {
  const task = registerTask("ingest_yc", `Ingest YC companies${options?.batch ? ` (batch ${options.batch})` : ""}`, getState, setState);
  updateTaskState(task.id, { status: "running" }, getState, setState);

  let companies: YCCompany[] = [];
  let essays: PGEssay[] = [];
  let talks: YCTalk[] = [];

  try {
    // Phase 1: Scrape YC directory
    console.log("[yc-ingestion] Phase 1: Scraping YC directory...");
    companies = await scrapeYCDirectory({ batch: options?.batch });

    // Phase 2: Enrich each company with detail page
    console.log("[yc-ingestion] Phase 2: Enriching company details...");
    for (let i = 0; i < companies.length; i++) {
      await delay(300);
      const detail = await scrapeYCCompanyDetail(companies[i].url);
      companies[i] = { ...companies[i], ...detail };
    }

    // Phase 3 (optional): PG essays
    if (options?.scrapePGEssays) {
      console.log("[yc-ingestion] Phase 3: Scraping PG essays...");
      essays = await scrapePGEssays();
    }

    // Phase 4 (optional): YC YouTube transcripts
    if (options?.scrapeYouTube) {
      console.log("[yc-ingestion] Phase 4: Scraping YC YouTube...");
      talks = await scrapeYCYouTubeTranscripts();
    }

    // Convert to deal records and store in state
    for (const company of companies) {
      const deal: DealRecord = {
        id: uuidv4(),
        companyName: company.name,
        sector: company.sector,
        stage: company.funding?.lastRound || "Pre-seed",
        status: "discovered",
        founders: company.founders,
        metadata: {
          batch: company.batch,
          ycUrl: company.url,
          teamSize: company.teamSize,
          description: company.description,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setState((prev: any) => {
        const deals = new Map(prev.deals);
        deals.set(deal.id, deal);
        return { ...prev, deals };
      });
    }

    updateTaskState(
      task.id,
      {
        status: "completed",
        output: JSON.stringify({
          companiesCount: companies.length,
          essaysCount: essays.length,
          talksCount: talks.length,
        }),
      },
      getState,
      setState,
    );

    console.log(`[yc-ingestion] Done: ${companies.length} companies, ${essays.length} essays, ${talks.length} talks`);
  } catch (error) {
    updateTaskState(
      task.id,
      { status: "failed", output: String(error) },
      getState,
      setState,
    );
    throw error;
  }

  return { companies, essays, talks };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
