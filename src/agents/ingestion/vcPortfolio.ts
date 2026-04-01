/**
 * VC Portfolio Scraper Agent
 *
 * Scrapes a16z, Sequoia, and other top VC firm portfolio pages.
 * Cross-references with Crunchbase for funding history.
 * Pulls podcast transcripts from a16z and Sequoia Arc.
 */

import { AgentDefinition } from "../../types/agent.js";
import { TaskState, DealRecord } from "../../types/tool.js";
import { webScraperTool } from "../../tools/webScraper.js";
import { apiClientTool } from "../../tools/apiClient.js";
import { registerTask, updateTaskState } from "../../tasks/framework.js";
import { v4 as uuidv4 } from "uuid";

export const vcPortfolioAgent: AgentDefinition = {
  agentType: "vc_portfolio",
  description: "Scrapes top VC firm portfolios and enriches with funding data",
  whenToUse: "When refreshing the database of VC-backed companies from top firms",
  tools: ["web_scraper", "api_client"],
  maxTurns: 100,
  model: "inherit",
  source: "built-in",

  getSystemPrompt(task: TaskState): string {
    return `You are the VC Portfolio Scraper agent. Scrape portfolio pages for top VC firms,
extract company records, and cross-reference with Crunchbase for funding data.
Task: ${task.description}`;
  },
};

// -------------------------------------------------------------------
// VC Firm Configurations
// -------------------------------------------------------------------

export interface VCFirm {
  name: string;
  portfolioUrl: string;
  selectors: Record<string, string>;
  podcastUrl?: string;
}

const VC_FIRMS: VCFirm[] = [
  {
    name: "a16z",
    portfolioUrl: "https://a16z.com/portfolio/",
    selectors: {
      companies: "[class*='portfolio'] a, .portfolio-company",
      names: "[class*='company-name'], h3, h4",
      sectors: "[class*='category'], [class*='sector']",
    },
    podcastUrl: "https://a16z.com/podcasts/",
  },
  {
    name: "Sequoia",
    portfolioUrl: "https://www.sequoiacap.com/our-companies/",
    selectors: {
      companies: "[class*='company'], .portfolio-item",
      names: "[class*='name'], h3",
      sectors: "[class*='sector'], [class*='stage']",
    },
  },
  {
    name: "Founders Fund",
    portfolioUrl: "https://foundersfund.com/portfolio/",
    selectors: {
      companies: "[class*='portfolio'] a",
      names: "h3, [class*='title']",
      sectors: "[class*='industry']",
    },
  },
  {
    name: "Benchmark",
    portfolioUrl: "https://www.benchmark.com/portfolio",
    selectors: {
      companies: "[class*='portfolio'] a",
      names: "h3, [class*='name']",
      sectors: "[class*='sector']",
    },
  },
  {
    name: "Accel",
    portfolioUrl: "https://www.accel.com/portfolio",
    selectors: {
      companies: "[class*='portfolio'] a",
      names: "h3, [class*='company']",
      sectors: "[class*='category']",
    },
  },
];

export interface PortfolioCompany {
  name: string;
  firm: string;
  url?: string;
  sector?: string;
  stage?: string;
  description?: string;
  fundingHistory?: FundingRound[];
}

export interface FundingRound {
  roundType: string;
  amount?: string;
  date?: string;
  leadInvestor?: string;
  investors: string[];
  valuation?: string;
}

// -------------------------------------------------------------------
// Scraping Logic
// -------------------------------------------------------------------

async function scrapeFirmPortfolio(firm: VCFirm): Promise<PortfolioCompany[]> {
  console.log(`[vc-portfolio] Scraping ${firm.name}...`);

  const result = await webScraperTool.execute(
    {
      url: firm.portfolioUrl,
      waitForJs: true,
      selectors: firm.selectors,
    },
    {} as any,
  );

  if (result.error) {
    console.error(`[vc-portfolio] Failed to scrape ${firm.name}: ${result.error}`);
    return [];
  }

  const names = result.data.extracted["names"] || [];
  const sectors = result.data.extracted["sectors"] || [];

  return names.map((name, i) => ({
    name: name.trim(),
    firm: firm.name,
    sector: sectors[i]?.trim(),
  }));
}

async function enrichWithCrunchbase(
  company: PortfolioCompany,
  config: { crunchbaseApiKey?: string },
): Promise<PortfolioCompany> {
  if (!config.crunchbaseApiKey) return company;

  const slug = company.name.toLowerCase().replace(/\s+/g, "-");

  const result = await apiClientTool.execute(
    {
      service: "crunchbase",
      endpoint: `/entities/organizations/${slug}`,
      params: {
        field_ids: "short_description,funding_total,last_funding_type,num_funding_rounds,categories",
      },
    },
    { config } as any,
  );

  if (result.error || result.data.status !== 200) return company;

  const data = (result.data.data as any)?.properties;
  if (!data) return company;

  return {
    ...company,
    description: data.short_description || company.description,
    stage: data.last_funding_type || company.stage,
    fundingHistory: data.funding_rounds?.map((r: any) => ({
      roundType: r.funding_type || "",
      amount: r.money_raised?.value_usd ? `$${r.money_raised.value_usd}` : undefined,
      date: r.announced_on,
      investors: r.investor_identifiers?.map((i: any) => i.value) || [],
    })),
  };
}

// -------------------------------------------------------------------
// Orchestration
// -------------------------------------------------------------------

export async function runVCPortfolioIngestion(
  getState: () => any,
  setState: (fn: (prev: any) => any) => void,
  options?: { firms?: string[]; enrichWithCrunchbase?: boolean },
): Promise<PortfolioCompany[]> {
  const task = registerTask(
    "ingest_portfolio",
    `Ingest VC portfolios: ${options?.firms?.join(", ") || "all firms"}`,
    getState,
    setState,
  );
  updateTaskState(task.id, { status: "running" }, getState, setState);

  const allCompanies: PortfolioCompany[] = [];

  try {
    const firmsToScrape = options?.firms
      ? VC_FIRMS.filter((f) => options.firms!.includes(f.name))
      : VC_FIRMS;

    for (const firm of firmsToScrape) {
      const companies = await scrapeFirmPortfolio(firm);
      console.log(`[vc-portfolio] ${firm.name}: ${companies.length} companies`);

      // Optionally enrich with Crunchbase
      if (options?.enrichWithCrunchbase) {
        for (let i = 0; i < companies.length; i++) {
          await delay(200);
          companies[i] = await enrichWithCrunchbase(companies[i], getState().config);
        }
      }

      allCompanies.push(...companies);
      await delay(1000); // Rate limit between firms
    }

    // Store as deal records
    for (const company of allCompanies) {
      const deal: DealRecord = {
        id: uuidv4(),
        companyName: company.name,
        sector: company.sector || "Unknown",
        stage: company.stage || "Unknown",
        status: "discovered",
        founders: [],
        metadata: {
          vcFirm: company.firm,
          description: company.description,
          fundingHistory: company.fundingHistory,
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
      { status: "completed", output: JSON.stringify({ count: allCompanies.length }) },
      getState,
      setState,
    );

    console.log(`[vc-portfolio] Total: ${allCompanies.length} companies from ${firmsToScrape.length} firms`);
  } catch (error) {
    updateTaskState(task.id, { status: "failed", output: String(error) }, getState, setState);
    throw error;
  }

  return allCompanies;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
