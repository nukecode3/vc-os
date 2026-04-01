/**
 * PG Essay Semantic Index
 *
 * Embeds all 200+ Paul Graham essays and enables queries like:
 * "This founder's background most closely resembles the pattern described
 *  in 'Do Things That Don't Scale' and 'Startups in 13 Sentences.'"
 *
 * No other VC tool does this.
 */

import { getPool } from "./database.js";
import { generateEmbedding, embedAndStore, semanticSearch } from "./embeddings.js";
import { v4 as uuidv4 } from "uuid";
import type { PGEssay } from "../../agents/ingestion/ycScraper.js";

// -------------------------------------------------------------------
// Storage
// -------------------------------------------------------------------

export async function storeEssay(
  essay: PGEssay,
  databaseUrl?: string,
): Promise<string> {
  const db = getPool(databaseUrl);
  const id = uuidv4();
  const embedding = await generateEmbedding(essay.text);

  await db.query(
    `INSERT INTO pg_essays (id, title, url, text, embedding)
     VALUES ($1, $2, $3, $4, $5::vector)
     ON CONFLICT (id) DO NOTHING`,
    [id, essay.title, essay.url, essay.text, `[${embedding.join(",")}]`],
  );

  // Also store chunks in the generic embeddings table for cross-type search
  await embedAndStore("pg_essay", id, essay.text, {
    title: essay.title,
    url: essay.url,
  }, databaseUrl);

  return id;
}

export async function storeEssays(
  essays: PGEssay[],
  databaseUrl?: string,
): Promise<number> {
  let count = 0;
  for (const essay of essays) {
    await storeEssay(essay, databaseUrl);
    count++;
    if (count % 10 === 0) {
      console.log(`[pg-essays] Stored ${count}/${essays.length}`);
    }
  }
  console.log(`[pg-essays] Stored ${count} essays total`);
  return count;
}

// -------------------------------------------------------------------
// PG Pattern Matching
// -------------------------------------------------------------------

export interface PGPatternMatch {
  essayTitle: string;
  essayUrl: string;
  similarity: number;
  relevantExcerpt: string;
  matchReason: string;
}

/**
 * Find which PG essays most closely match a founder/startup description.
 * Returns essay titles with similarity scores and relevant excerpts.
 */
export async function findPGPatterns(
  description: string,
  limit: number = 5,
  databaseUrl?: string,
): Promise<PGPatternMatch[]> {
  const db = getPool(databaseUrl);
  const queryEmbedding = await generateEmbedding(description);

  const result = await db.query(
    `SELECT id, title, url, text, 1 - (embedding <=> $1::vector) AS similarity
     FROM pg_essays
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [`[${queryEmbedding.join(",")}]`, limit],
  );

  return result.rows.map((row) => {
    const similarity = parseFloat(row.similarity);
    const excerpt = extractRelevantExcerpt(row.text, description);
    const reason = generateMatchReason(row.title, similarity);

    return {
      essayTitle: row.title,
      essayUrl: row.url || `http://paulgraham.com/${row.title.toLowerCase().replace(/\s+/g, "")}.html`,
      similarity,
      relevantExcerpt: excerpt,
      matchReason: reason,
    };
  });
}

/**
 * Generate a PG essay similarity report for a founder.
 * This is the unique artifact: "This founder's thinking most closely
 * resembles the patterns in 'Do Things That Don't Scale' and 'Mean People Fail.'"
 */
export async function generatePGReport(
  founderName: string,
  founderDescription: string,
  startupDescription: string,
  databaseUrl?: string,
): Promise<string> {
  const combinedQuery = `${founderDescription}\n\n${startupDescription}`;
  const matches = await findPGPatterns(combinedQuery, 5, databaseUrl);

  if (matches.length === 0) {
    return `No PG essay patterns found for ${founderName}.`;
  }

  const topMatch = matches[0];
  const secondMatch = matches[1];

  let report = `## PG Pattern Analysis for ${founderName}\n\n`;
  report += `This founder's background and approach most closely resembles the patterns described in `;
  report += `**"${topMatch.essayTitle}"** (${(topMatch.similarity * 100).toFixed(1)}% match)`;

  if (secondMatch && secondMatch.similarity > 0.6) {
    report += ` and **"${secondMatch.essayTitle}"** (${(secondMatch.similarity * 100).toFixed(1)}% match)`;
  }
  report += `.\n\n`;

  report += `### Key Essay Matches\n\n`;
  for (const match of matches) {
    if (match.similarity < 0.5) continue;
    report += `**${match.essayTitle}** — ${(match.similarity * 100).toFixed(1)}% similarity\n`;
    report += `> ${match.relevantExcerpt}\n\n`;
    report += `${match.matchReason}\n\n`;
  }

  return report;
}

// -------------------------------------------------------------------
// Well-Known PG Essay Categories (for matching even without full scrape)
// -------------------------------------------------------------------

export const PG_ESSAY_THEMES: Record<string, string[]> = {
  "founder_qualities": [
    "Do Things That Don't Scale",
    "Schlep Blindness",
    "Mean People Fail",
    "Relentlessly Resourceful",
    "The Hardest Lessons for Startups to Learn",
  ],
  "startup_strategy": [
    "Startups in 13 Sentences",
    "How to Start a Startup",
    "Be Good",
    "The 18 Mistakes That Kill Startups",
    "How Not to Die",
  ],
  "market_insight": [
    "How to Get Startup Ideas",
    "Frighteningly Ambitious Startup Ideas",
    "Black Swan Farming",
    "What I Worked On",
    "Organic Startup Ideas",
  ],
  "technical_founders": [
    "Hackers and Painters",
    "Great Hackers",
    "The Other Road Ahead",
    "Beating the Averages",
    "Programming Bottom-Up",
  ],
  "fundraising": [
    "How to Fund a Startup",
    "A Fundraising Survival Guide",
    "Investor Herd Dynamics",
    "The Equity Equation",
    "High Resolution Fundraising",
  ],
  "growth": [
    "Startup = Growth",
    "Do Things That Don't Scale",
    "The Launch Pad",
    "Want to Start a Startup?",
    "Before the Startup",
  ],
};

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function extractRelevantExcerpt(essayText: string, query: string): string {
  // Simple keyword-based excerpt extraction
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const sentences = essayText.split(/[.!?]+/).filter((s) => s.trim().length > 20);

  // Score each sentence by keyword overlap
  let bestSentence = sentences[0] || "";
  let bestScore = 0;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const score = queryWords.filter((w) => lower.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  return bestSentence.trim().slice(0, 300) + (bestSentence.length > 300 ? "..." : "");
}

function generateMatchReason(essayTitle: string, similarity: number): string {
  // Map essay titles to thematic explanations
  const themes: Record<string, string> = {
    "Do Things That Don't Scale":
      "This founder shows signs of hands-on, unscalable execution in early stages — a strong positive signal.",
    "Schlep Blindness":
      "This founder is tackling a problem others avoid because it looks tedious or unglamorous.",
    "Mean People Fail":
      "This founder's collaborative approach and empathy signal the kind of person who attracts talent.",
    "Relentlessly Resourceful":
      "This founder demonstrates the combination of determination and adaptability PG considers essential.",
    "How to Get Startup Ideas":
      "This startup appears to come from personal experience and organic need, not brainstorming.",
    "Startups in 13 Sentences":
      "Multiple elements of this startup align with PG's condensed wisdom on what makes startups work.",
    "Black Swan Farming":
      "This startup has the characteristics of a high-variance outcome — the kind VCs should fund.",
    "Startup = Growth":
      "This company shows early signs of the growth curve PG considers definitional for startups.",
    "Frighteningly Ambitious Startup Ideas":
      "The ambition level here matches what PG describes as the best startup ideas — scary in scope.",
  };

  if (themes[essayTitle]) return themes[essayTitle];

  if (similarity > 0.8) return `Strong thematic alignment with the core arguments in this essay.`;
  if (similarity > 0.65) return `Moderate thematic overlap with key concepts in this essay.`;
  return `Some thematic connection to this essay's arguments.`;
}
