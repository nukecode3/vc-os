/**
 * Success Pattern Index
 *
 * Stores embedded snapshots of successful companies AT THE TIME of their seed/Series A.
 * When a new startup comes in, finds nearest neighbors to answer:
 * "Which successful companies did this most resemble at the same stage?"
 *
 * This is the temporal pattern matching — comparing to what unicorns
 * looked like at seed, not what they look like now.
 */

import { getPool } from "./database.js";
import { generateEmbedding, semanticSearch, embedAndStore } from "./embeddings.js";
import { v4 as uuidv4 } from "uuid";

export interface SuccessPattern {
  id: string;
  companyName: string;
  outcome: string; // "unicorn", "decacorn", "acquired_1B+", "IPO"
  peakValuation?: string;
  investmentStage: string; // Stage at which this snapshot was taken
  stageSnapshot: StageSnapshot;
  investors: string[];
  sector: string;
  batch?: string; // YC batch if applicable
}

/**
 * What the company looked like at the investment stage.
 * This is the key insight — we compare NEW startups to what
 * successful companies looked like BEFORE they were successful.
 */
export interface StageSnapshot {
  revenue?: string; // e.g. "$200/week", "$50k MRR"
  teamSize?: number;
  productStage?: string; // "MVP", "beta", "launched", "scaling"
  monthsSinceFounding?: number;
  founderBackground: string;
  founderPedigree?: string; // e.g. "ex-Google, Stanford CS"
  marketNarrative: string; // What the market thesis was at the time
  competitors?: string;
  traction?: string;
  uniqueInsight?: string; // What the founders saw that others didn't
}

// -------------------------------------------------------------------
// Curated Success Patterns (seed data)
// -------------------------------------------------------------------

const CURATED_PATTERNS: Omit<SuccessPattern, "id">[] = [
  {
    companyName: "Airbnb",
    outcome: "decacorn",
    peakValuation: "$100B+",
    investmentStage: "Seed",
    stageSnapshot: {
      revenue: "$200/week",
      teamSize: 3,
      productStage: "launched",
      monthsSinceFounding: 12,
      founderBackground: "Design school graduates, one previous failed startup. Domain outsiders to travel.",
      founderPedigree: "RISD, no prior tech exits",
      marketNarrative: "People will rent out their homes to strangers. Hotels are overpriced for many use cases.",
      competitors: "Craigslist, couchsurfing.com, VRBO",
      traction: "Growing in specific event-based markets (conferences, inaugurations)",
      uniqueInsight: "Trust between strangers can be manufactured through design and reviews",
    },
    investors: ["Y Combinator", "Sequoia Capital"],
    sector: "Travel / Marketplace",
    batch: "W09",
  },
  {
    companyName: "Stripe",
    outcome: "decacorn",
    peakValuation: "$95B",
    investmentStage: "Seed",
    stageSnapshot: {
      revenue: "Minimal — developer beta",
      teamSize: 2,
      productStage: "beta",
      monthsSinceFounding: 6,
      founderBackground: "Two brothers, teenage entrepreneurs, dropped out of MIT/Harvard. Built and sold previous projects.",
      founderPedigree: "MIT, Harvard (dropped out), prior teen entrepreneurship",
      marketNarrative: "Developer experience for payments is terrible. 7 lines of code to accept payments.",
      competitors: "PayPal, Braintree, Authorize.net",
      traction: "Early developer enthusiasm, word of mouth in YC network",
      uniqueInsight: "Payments is a developer experience problem, not a financial services problem",
    },
    investors: ["Y Combinator", "Peter Thiel", "Sequoia Capital"],
    sector: "Fintech / Payments",
    batch: "S09",
  },
  {
    companyName: "Dropbox",
    outcome: "unicorn",
    peakValuation: "$12B (IPO)",
    investmentStage: "Seed",
    stageSnapshot: {
      revenue: "None — waitlist only",
      teamSize: 2,
      productStage: "MVP",
      monthsSinceFounding: 6,
      founderBackground: "MIT CS grad, previously built SAT prep company. Deep technical skills.",
      founderPedigree: "MIT CS",
      marketNarrative: "File syncing should just work. Current solutions (USB drives, email attachments) are broken.",
      competitors: "Box, Microsoft SharePoint, USB drives",
      traction: "75,000 waitlist signups from HN demo video",
      uniqueInsight: "The demo video proved demand before writing serious code. Simple UX beats feature checklists.",
    },
    investors: ["Y Combinator", "Sequoia Capital"],
    sector: "Cloud Storage / Productivity",
    batch: "S07",
  },
  {
    companyName: "Coinbase",
    outcome: "decacorn",
    peakValuation: "$85B (IPO peak)",
    investmentStage: "Seed",
    stageSnapshot: {
      revenue: "Transaction fees, small",
      teamSize: 3,
      productStage: "launched",
      monthsSinceFounding: 8,
      founderBackground: "Airbnb engineer, Goldman Sachs. Built crypto wallet as side project.",
      founderPedigree: "Rice University, ex-Airbnb, ex-Goldman",
      marketNarrative: "Buying Bitcoin should be as easy as buying stocks. Current crypto UX is unusable for normals.",
      competitors: "Mt. Gox, Bitstamp, LocalBitcoins",
      traction: "Growing user signups correlated with Bitcoin price",
      uniqueInsight: "Regulation-first approach to crypto — work with regulators, not against them",
    },
    investors: ["Y Combinator", "a16z"],
    sector: "Crypto / Fintech",
    batch: "S12",
  },
  {
    companyName: "DoorDash",
    outcome: "decacorn",
    peakValuation: "$72B (IPO peak)",
    investmentStage: "Seed",
    stageSnapshot: {
      revenue: "~$0 — manually delivering food themselves",
      teamSize: 4,
      productStage: "MVP",
      monthsSinceFounding: 3,
      founderBackground: "Stanford MBA students. Built PaloAltoDelivery.com landing page to test demand.",
      founderPedigree: "Stanford MBA",
      marketNarrative: "Suburban restaurants can't afford delivery drivers. 85% of restaurants don't deliver.",
      competitors: "GrubHub, Seamless, Eat24, Postmates",
      traction: "Suburban market growing fast — competitors focused on urban",
      uniqueInsight: "Suburbs are underserved. Logistics is the moat, not the marketplace.",
    },
    investors: ["Y Combinator", "Khosla Ventures"],
    sector: "Food Delivery / Logistics",
    batch: "S13",
  },
  {
    companyName: "Figma",
    outcome: "unicorn",
    peakValuation: "$20B (Adobe acquisition offer)",
    investmentStage: "Seed",
    stageSnapshot: {
      revenue: "None — still building",
      teamSize: 4,
      productStage: "pre-launch",
      monthsSinceFounding: 12,
      founderBackground: "Brown University CS dropout, Thiel Fellow. Obsessed with WebGL and browser performance.",
      founderPedigree: "Thiel Fellowship, Brown University",
      marketNarrative: "Design tools should be collaborative and browser-native. Sketch is desktop-only and single-player.",
      competitors: "Sketch, Adobe Illustrator, InVision",
      traction: "None — purely vision-driven at seed",
      uniqueInsight: "Multiplayer design in the browser will unlock a workflow revolution, just like Google Docs did for documents",
    },
    investors: ["Thiel Fellowship", "Greylock"],
    sector: "Design Tools / SaaS",
  },
  {
    companyName: "Notion",
    outcome: "unicorn",
    peakValuation: "$10B",
    investmentStage: "Seed",
    stageSnapshot: {
      revenue: "~$0",
      teamSize: 4,
      productStage: "rebuilding (pivoted from v1 failure)",
      monthsSinceFounding: 36,
      founderBackground: "Previously failed at this exact idea. Moved to Kyoto to rebuild from scratch with tiny team.",
      founderPedigree: "UBC, no pedigree signal — pure craft-driven",
      marketNarrative: "All-in-one workspace replacing docs, wikis, project management. Tools are too fragmented.",
      competitors: "Evernote, Confluence, Google Docs, Trello",
      traction: "Small passionate user base, strong word of mouth in design community",
      uniqueInsight: "Blocks-based editor that's both simple enough for individuals and powerful enough for teams",
    },
    investors: ["First Round Capital"],
    sector: "Productivity / SaaS",
  },
];

// -------------------------------------------------------------------
// Operations
// -------------------------------------------------------------------

/**
 * Build the text representation of a success pattern for embedding.
 * This is what gets vectorized and compared against new startups.
 */
function patternToEmbeddingText(pattern: Omit<SuccessPattern, "id">): string {
  const s = pattern.stageSnapshot;
  return [
    `Company: ${pattern.companyName}`,
    `Sector: ${pattern.sector}`,
    `Stage: ${pattern.investmentStage}`,
    `Outcome: ${pattern.outcome} (${pattern.peakValuation || "N/A"})`,
    `Revenue at investment: ${s.revenue || "N/A"}`,
    `Team size: ${s.teamSize || "N/A"}`,
    `Product stage: ${s.productStage || "N/A"}`,
    `Founder background: ${s.founderBackground}`,
    `Founder pedigree: ${s.founderPedigree || "N/A"}`,
    `Market thesis: ${s.marketNarrative}`,
    `Competitors: ${s.competitors || "N/A"}`,
    `Traction: ${s.traction || "N/A"}`,
    `Unique insight: ${s.uniqueInsight || "N/A"}`,
    `Investors: ${pattern.investors.join(", ")}`,
  ].join("\n");
}

/**
 * Seed the success pattern index with curated data.
 */
export async function seedSuccessPatterns(databaseUrl?: string): Promise<number> {
  const db = getPool(databaseUrl);
  let count = 0;

  for (const pattern of CURATED_PATTERNS) {
    const id = uuidv4();
    const text = patternToEmbeddingText(pattern);
    const embedding = await generateEmbedding(text);

    await db.query(
      `INSERT INTO success_patterns (id, company_name, outcome, peak_valuation, investment_stage, stage_snapshot, investors, sector, batch, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        pattern.companyName,
        pattern.outcome,
        pattern.peakValuation,
        pattern.investmentStage,
        JSON.stringify(pattern.stageSnapshot),
        JSON.stringify(pattern.investors),
        pattern.sector,
        pattern.batch,
        `[${embedding.join(",")}]`,
      ],
    );

    // Also store in generic embeddings table for cross-type search
    await embedAndStore("success_pattern", id, text, {
      companyName: pattern.companyName,
      outcome: pattern.outcome,
      sector: pattern.sector,
    }, databaseUrl);

    count++;
  }

  console.log(`[success-patterns] Seeded ${count} patterns`);
  return count;
}

/**
 * Add a new success pattern from external data.
 */
export async function addSuccessPattern(
  pattern: Omit<SuccessPattern, "id">,
  databaseUrl?: string,
): Promise<string> {
  const db = getPool(databaseUrl);
  const id = uuidv4();
  const text = patternToEmbeddingText(pattern);
  const embedding = await generateEmbedding(text);

  await db.query(
    `INSERT INTO success_patterns (id, company_name, outcome, peak_valuation, investment_stage, stage_snapshot, investors, sector, batch, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)`,
    [
      id,
      pattern.companyName,
      pattern.outcome,
      pattern.peakValuation,
      pattern.investmentStage,
      JSON.stringify(pattern.stageSnapshot),
      JSON.stringify(pattern.investors),
      pattern.sector,
      pattern.batch,
      `[${embedding.join(",")}]`,
    ],
  );

  return id;
}

/**
 * Find companies that most resemble a given startup description at the same stage.
 * This is the core temporal pattern matching query.
 */
export async function findSimilarSuccesses(
  startupDescription: string,
  limit: number = 5,
  databaseUrl?: string,
): Promise<Array<{
  pattern: SuccessPattern;
  similarity: number;
}>> {
  const db = getPool(databaseUrl);
  const queryEmbedding = await generateEmbedding(startupDescription);

  const result = await db.query(
    `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
     FROM success_patterns
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [`[${queryEmbedding.join(",")}]`, limit],
  );

  return result.rows.map((row) => ({
    pattern: {
      id: row.id,
      companyName: row.company_name,
      outcome: row.outcome,
      peakValuation: row.peak_valuation,
      investmentStage: row.investment_stage,
      stageSnapshot: row.stage_snapshot,
      investors: row.investors,
      sector: row.sector,
      batch: row.batch,
    },
    similarity: parseFloat(row.similarity),
  }));
}
