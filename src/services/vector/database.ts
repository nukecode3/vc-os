/**
 * PostgreSQL + pgvector database layer.
 *
 * Handles connection pooling, schema initialization, and raw vector operations.
 * All tables use pgvector's `vector` type for embedding storage.
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(databaseUrl?: string): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl || process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Initialize the full schema — idempotent, safe to call on every startup.
 */
export async function initializeSchema(databaseUrl?: string): Promise<void> {
  const db = getPool(databaseUrl);

  await db.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

  // -------------------------------------------------------------------
  // Companies table — stores all discovered companies
  // -------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      sector        TEXT,
      stage         TEXT,
      batch         TEXT,
      source        TEXT,
      description   TEXT,
      status        TEXT DEFAULT 'discovered',
      score         REAL,
      metadata      JSONB DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // -------------------------------------------------------------------
  // Founders table — linked to companies
  // -------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS founders (
      id                    TEXT PRIMARY KEY,
      company_id            TEXT REFERENCES companies(id),
      name                  TEXT NOT NULL,
      role                  TEXT,
      linkedin_url          TEXT,
      github_url            TEXT,
      twitter_url           TEXT,
      background            TEXT,
      education             JSONB DEFAULT '[]',
      prior_exits           JSONB DEFAULT '[]',
      domain_expertise_yrs  REAL DEFAULT 0,
      technical_depth       REAL DEFAULT 0,
      execution_velocity    REAL DEFAULT 0,
      network_score         REAL DEFAULT 0,
      profile_data          JSONB DEFAULT '{}',
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // -------------------------------------------------------------------
  // Embeddings table — generic vector store for all content types
  // Uses 1536 dimensions (text-embedding-3-small) or 3072 (text-embedding-3-large)
  // -------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id            TEXT PRIMARY KEY,
      content_type  TEXT NOT NULL,
      content_id    TEXT NOT NULL,
      chunk_index   INTEGER DEFAULT 0,
      text          TEXT NOT NULL,
      embedding     vector(1536),
      metadata      JSONB DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Index for fast vector similarity search
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  `);

  // Index for filtering by content type before vector search
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_embeddings_content_type
    ON embeddings (content_type);
  `);

  // -------------------------------------------------------------------
  // Success patterns — curated records of companies at investment stage
  // -------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS success_patterns (
      id              TEXT PRIMARY KEY,
      company_name    TEXT NOT NULL,
      outcome         TEXT,
      peak_valuation  TEXT,
      investment_stage TEXT,
      stage_snapshot  JSONB DEFAULT '{}',
      investors       JSONB DEFAULT '[]',
      sector          TEXT,
      batch           TEXT,
      embedding       vector(1536),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_success_patterns_vector
    ON success_patterns USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
  `);

  // -------------------------------------------------------------------
  // Founder archetypes — embedded founder profiles for similarity search
  // -------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS founder_archetypes (
      id                    TEXT PRIMARY KEY,
      founder_name          TEXT NOT NULL,
      company_name          TEXT NOT NULL,
      company_outcome       TEXT,
      role_at_founding      TEXT,
      background_summary    TEXT,
      technical_depth       REAL DEFAULT 0,
      domain_expertise_yrs  REAL DEFAULT 0,
      prior_exits           INTEGER DEFAULT 0,
      education_pedigree    TEXT,
      embedding             vector(1536),
      metadata              JSONB DEFAULT '{}',
      created_at            TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_founder_archetypes_vector
    ON founder_archetypes USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
  `);

  // -------------------------------------------------------------------
  // PG essays — Paul Graham essays with embeddings
  // -------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS pg_essays (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      url         TEXT,
      text        TEXT,
      embedding   vector(1536),
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_pg_essays_vector
    ON pg_essays USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 20);
  `);

  // -------------------------------------------------------------------
  // Tasks table — persistent task queue (mirrors disk-based tasks)
  // -------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      status      TEXT DEFAULT 'pending',
      description TEXT,
      agent_id    TEXT,
      deal_id     TEXT,
      output      TEXT,
      started_at  TIMESTAMPTZ,
      ended_at    TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("[db] Schema initialized");
}
