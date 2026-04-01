/**
 * Founder Archetype Store
 *
 * Embeds successful founder profiles and enables nearest-neighbor lookup.
 * When a new founder comes in, finds the most similar successful founders
 * and generates: "This founder most resembles Brian Chesky at pre-seed Airbnb."
 */

import { getPool } from "./database.js";
import { generateEmbedding, embedAndStore } from "./embeddings.js";
import { v4 as uuidv4 } from "uuid";

export interface FounderArchetype {
  id: string;
  founderName: string;
  companyName: string;
  companyOutcome: string;
  roleAtFounding: string;
  backgroundSummary: string;
  technicalDepth: number;
  domainExpertiseYears: number;
  priorExits: number;
  educationPedigree?: string;
  metadata?: Record<string, unknown>;
}

// -------------------------------------------------------------------
// Curated Founder Archetypes (seed data)
// -------------------------------------------------------------------

const CURATED_ARCHETYPES: Omit<FounderArchetype, "id">[] = [
  {
    founderName: "Brian Chesky",
    companyName: "Airbnb",
    companyOutcome: "decacorn ($100B+ IPO)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "RISD industrial design grad. No engineering background. Previous failed startup (air mattress business that became Airbnb). Design-first thinker who learned business by doing. Domain outsider to travel/hospitality.",
    technicalDepth: 2,
    domainExpertiseYears: 0,
    priorExits: 0,
    educationPedigree: "RISD (Rhode Island School of Design)",
  },
  {
    founderName: "Patrick Collison",
    companyName: "Stripe",
    companyOutcome: "decacorn ($95B)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "Irish prodigy. Won Young Scientist award at 16. Started MIT, dropped out. Previously co-founded Auctomatic (acquired by Live Current Media for ~$5M at age 19). Deep technical skill combined with business instinct.",
    technicalDepth: 9,
    domainExpertiseYears: 0,
    priorExits: 1,
    educationPedigree: "MIT (dropped out), Thiel-adjacent",
  },
  {
    founderName: "Drew Houston",
    companyName: "Dropbox",
    companyOutcome: "unicorn ($12B IPO)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "MIT CS grad. Built SAT prep company Accolade as undergrad. Strong engineer who kept forgetting his USB drive — built Dropbox out of personal frustration. Solo founder initially, recruited Arash Ferdowsi.",
    technicalDepth: 8,
    domainExpertiseYears: 0,
    priorExits: 0,
    educationPedigree: "MIT Computer Science",
  },
  {
    founderName: "Brian Armstrong",
    companyName: "Coinbase",
    companyOutcome: "decacorn ($85B IPO peak)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "Rice University CS + Economics. Worked at Deloitte consulting, then Airbnb as software engineer. Built Bitcoin wallet as side project. Unusual combo of enterprise/consulting background with startup engineering experience.",
    technicalDepth: 7,
    domainExpertiseYears: 2,
    priorExits: 0,
    educationPedigree: "Rice University",
  },
  {
    founderName: "Tony Xu",
    companyName: "DoorDash",
    companyOutcome: "decacorn ($72B IPO peak)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "Immigrant from China at age 5, worked in restaurants growing up. Stanford MBA. Previously at McKinsey and Square. Built PaloAltoDelivery.com landing page to validate demand. Deep empathy for small business owners from personal experience.",
    technicalDepth: 4,
    domainExpertiseYears: 10,
    priorExits: 0,
    educationPedigree: "Stanford MBA, UC Berkeley undergrad",
  },
  {
    founderName: "Dylan Field",
    companyName: "Figma",
    companyOutcome: "unicorn ($20B acquisition offer)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "Brown University CS, dropped out for Thiel Fellowship. Obsessed with making things in the browser. Previously interned at Flipboard and O'Reilly Media. Deep technical conviction about WebGL and browser-native tools before anyone else believed in it.",
    technicalDepth: 8,
    domainExpertiseYears: 0,
    priorExits: 0,
    educationPedigree: "Thiel Fellow, Brown University (dropped out)",
  },
  {
    founderName: "Ivan Zhao",
    companyName: "Notion",
    companyOutcome: "unicorn ($10B)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "UBC cognitive science grad. Photographer and designer. First version of Notion failed — moved to Kyoto with 4-person team to rebuild from scratch. Craft-obsessed, design-driven. No pedigree signal — succeeded on taste and persistence alone.",
    technicalDepth: 6,
    domainExpertiseYears: 3,
    priorExits: 0,
    educationPedigree: "UBC (University of British Columbia)",
  },
  {
    founderName: "Vitalik Buterin",
    companyName: "Ethereum",
    companyOutcome: "decacorn ($500B+ market cap peak)",
    roleAtFounding: "Creator / Co-founder",
    backgroundSummary: "Russian-Canadian. Thiel Fellow. University of Waterloo dropout. Co-founded Bitcoin Magazine at 17. Published Ethereum whitepaper at 19. Extraordinary technical mind — proposed the concept of a programmable blockchain when most people didn't understand Bitcoin.",
    technicalDepth: 10,
    domainExpertiseYears: 2,
    priorExits: 0,
    educationPedigree: "Thiel Fellow, Waterloo (dropped out)",
  },
  {
    founderName: "Whitney Wolfe Herd",
    companyName: "Bumble",
    companyOutcome: "unicorn ($8.5B IPO)",
    roleAtFounding: "CEO / Founder",
    backgroundSummary: "SMU grad. Co-founded Tinder, departed. Founded Bumble with clear thesis: women-first dating app. Non-technical founder who recruited Andrey Andreev (Badoo) as technical partner and investor. Deep domain expertise from Tinder experience.",
    technicalDepth: 1,
    domainExpertiseYears: 3,
    priorExits: 0,
    educationPedigree: "Southern Methodist University",
  },
  {
    founderName: "Alexandr Wang",
    companyName: "Scale AI",
    companyOutcome: "unicorn ($7.3B)",
    roleAtFounding: "CEO / Co-founder",
    backgroundSummary: "MIT dropout at 19. Previously worked at Quora (full-time engineer while in high school). Founded Scale AI to solve data labeling for ML — saw the bottleneck before most AI companies existed. Youngest self-made billionaire.",
    technicalDepth: 9,
    domainExpertiseYears: 2,
    priorExits: 0,
    educationPedigree: "MIT (dropped out), worked at Quora in high school",
  },
];

// -------------------------------------------------------------------
// Operations
// -------------------------------------------------------------------

function archetypeToEmbeddingText(archetype: Omit<FounderArchetype, "id">): string {
  return [
    `Founder: ${archetype.founderName}`,
    `Company: ${archetype.companyName} (${archetype.companyOutcome})`,
    `Role: ${archetype.roleAtFounding}`,
    `Background: ${archetype.backgroundSummary}`,
    `Technical depth: ${archetype.technicalDepth}/10`,
    `Domain expertise: ${archetype.domainExpertiseYears} years`,
    `Prior exits: ${archetype.priorExits}`,
    `Education: ${archetype.educationPedigree || "N/A"}`,
  ].join("\n");
}

export async function seedFounderArchetypes(databaseUrl?: string): Promise<number> {
  const db = getPool(databaseUrl);
  let count = 0;

  for (const archetype of CURATED_ARCHETYPES) {
    const id = uuidv4();
    const text = archetypeToEmbeddingText(archetype);
    const embedding = await generateEmbedding(text);

    await db.query(
      `INSERT INTO founder_archetypes (id, founder_name, company_name, company_outcome, role_at_founding, background_summary, technical_depth, domain_expertise_yrs, prior_exits, education_pedigree, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        archetype.founderName,
        archetype.companyName,
        archetype.companyOutcome,
        archetype.roleAtFounding,
        archetype.backgroundSummary,
        archetype.technicalDepth,
        archetype.domainExpertiseYears,
        archetype.priorExits,
        archetype.educationPedigree,
        `[${embedding.join(",")}]`,
        JSON.stringify(archetype.metadata || {}),
      ],
    );

    // Also store in generic embeddings table
    await embedAndStore("founder_archetype", id, text, {
      founderName: archetype.founderName,
      companyName: archetype.companyName,
    }, databaseUrl);

    count++;
  }

  console.log(`[founder-archetypes] Seeded ${count} archetypes`);
  return count;
}

export async function addFounderArchetype(
  archetype: Omit<FounderArchetype, "id">,
  databaseUrl?: string,
): Promise<string> {
  const db = getPool(databaseUrl);
  const id = uuidv4();
  const text = archetypeToEmbeddingText(archetype);
  const embedding = await generateEmbedding(text);

  await db.query(
    `INSERT INTO founder_archetypes (id, founder_name, company_name, company_outcome, role_at_founding, background_summary, technical_depth, domain_expertise_yrs, prior_exits, education_pedigree, embedding, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12)`,
    [
      id,
      archetype.founderName,
      archetype.companyName,
      archetype.companyOutcome,
      archetype.roleAtFounding,
      archetype.backgroundSummary,
      archetype.technicalDepth,
      archetype.domainExpertiseYears,
      archetype.priorExits,
      archetype.educationPedigree,
      `[${embedding.join(",")}]`,
      JSON.stringify(archetype.metadata || {}),
    ],
  );

  return id;
}

/**
 * Find the most similar successful founders to a given founder profile.
 * Returns matches with similarity scores and narrative descriptions.
 */
export async function findSimilarFounders(
  founderDescription: string,
  limit: number = 5,
  databaseUrl?: string,
): Promise<Array<{
  archetype: FounderArchetype;
  similarity: number;
  narrative: string;
}>> {
  const db = getPool(databaseUrl);
  const queryEmbedding = await generateEmbedding(founderDescription);

  const result = await db.query(
    `SELECT *, 1 - (embedding <=> $1::vector) AS similarity
     FROM founder_archetypes
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [`[${queryEmbedding.join(",")}]`, limit],
  );

  return result.rows.map((row) => {
    const archetype: FounderArchetype = {
      id: row.id,
      founderName: row.founder_name,
      companyName: row.company_name,
      companyOutcome: row.company_outcome,
      roleAtFounding: row.role_at_founding,
      backgroundSummary: row.background_summary,
      technicalDepth: row.technical_depth,
      domainExpertiseYears: row.domain_expertise_yrs,
      priorExits: row.prior_exits,
      educationPedigree: row.education_pedigree,
      metadata: row.metadata,
    };

    const sim = parseFloat(row.similarity);
    const narrative = generateArchetypeNarrative(archetype, sim);

    return { archetype, similarity: sim, narrative };
  });
}

function generateArchetypeNarrative(archetype: FounderArchetype, similarity: number): string {
  const strength = similarity > 0.85 ? "strongly" : similarity > 0.7 ? "moderately" : "loosely";
  return `This founder ${strength} resembles ${archetype.founderName} at pre-${archetype.companyName === "Ethereum" ? "launch" : "seed"} ${archetype.companyName} — ${archetype.backgroundSummary.split(".")[0]}.`;
}
