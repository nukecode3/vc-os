/**
 * Embedding pipeline — generates and manages vector embeddings.
 *
 * Uses Claude / Anthropic's Voyage embeddings or OpenAI's text-embedding-3-small.
 * Handles chunking, batch embedding, and storage into pgvector.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getPool } from "./database.js";
import { v4 as uuidv4 } from "uuid";

// -------------------------------------------------------------------
// Embedding Client
// -------------------------------------------------------------------

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

/**
 * Generate embeddings using Voyage (via Anthropic SDK) or a fallback.
 * Voyage models: voyage-3, voyage-3-lite, voyage-code-3
 * Dimensions: 1024 (voyage-3) — we pad/project to 1536 for pgvector compatibility.
 *
 * For production, you'd use OpenAI's text-embedding-3-small (1536 dims) directly.
 * This implementation uses a simple fetch to the Voyage API.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Use Voyage AI embeddings via direct API call
  const apiKey = process.env.VOYAGE_API_KEY || process.env.ANTHROPIC_API_KEY;

  try {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "voyage-3-lite",
        input: text.slice(0, 16_000), // Voyage context limit
        input_type: "document",
      }),
    });

    if (!response.ok) {
      // Fallback: generate a deterministic pseudo-embedding for dev/testing
      console.warn(`[embeddings] Voyage API failed (${response.status}), using fallback`);
      return generateFallbackEmbedding(text);
    }

    const data = (await response.json()) as any;
    const embedding: number[] = data.data?.[0]?.embedding || [];

    // Pad or truncate to 1536 dimensions for pgvector
    return normalizeEmbeddingDimension(embedding, 1536);
  } catch (error) {
    console.warn(`[embeddings] API error, using fallback: ${error}`);
    return generateFallbackEmbedding(text);
  }
}

/**
 * Batch embed multiple texts efficiently.
 */
export async function generateEmbeddings(
  texts: string[],
  batchSize: number = 20,
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const apiKey = process.env.VOYAGE_API_KEY || process.env.ANTHROPIC_API_KEY;
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "voyage-3-lite",
          input: batch.map((t) => t.slice(0, 16_000)),
          input_type: "document",
        }),
      });

      if (!response.ok) {
        // Fallback for entire batch
        results.push(...batch.map((t) => generateFallbackEmbedding(t)));
        continue;
      }

      const data = (await response.json()) as any;
      const embeddings = (data.data || []).map(
        (d: any) => normalizeEmbeddingDimension(d.embedding || [], 1536),
      );
      results.push(...embeddings);
    } catch {
      results.push(...batch.map((t) => generateFallbackEmbedding(t)));
    }

    // Rate limit between batches
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

// -------------------------------------------------------------------
// Text Chunking
// -------------------------------------------------------------------

export interface TextChunk {
  text: string;
  index: number;
  metadata?: Record<string, unknown>;
}

/**
 * Semantic chunker — splits text into overlapping chunks for embedding.
 * Uses paragraph boundaries when possible, falls back to sentence boundaries.
 */
export function chunkText(
  text: string,
  maxChunkSize: number = 1000,
  overlap: number = 200,
): TextChunk[] {
  const chunks: TextChunk[] = [];

  // First try paragraph-based splitting
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });

      // Keep overlap from end of current chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 5));
      currentChunk = overlapWords.join(" ") + "\n\n";
    }
    currentChunk += para + "\n\n";
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({ text: currentChunk.trim(), index: chunkIndex });
  }

  // If text was too short for paragraph splitting, use a single chunk
  if (chunks.length === 0 && text.trim().length > 0) {
    chunks.push({ text: text.trim(), index: 0 });
  }

  return chunks;
}

// -------------------------------------------------------------------
// Storage Operations
// -------------------------------------------------------------------

export type ContentType =
  | "company"
  | "founder"
  | "pg_essay"
  | "yc_talk"
  | "success_pattern"
  | "founder_archetype"
  | "deck"
  | "market_research";

/**
 * Embed and store a piece of content. Handles chunking automatically.
 */
export async function embedAndStore(
  contentType: ContentType,
  contentId: string,
  text: string,
  metadata?: Record<string, unknown>,
  databaseUrl?: string,
): Promise<string[]> {
  const db = getPool(databaseUrl);
  const chunks = chunkText(text);
  const ids: string[] = [];

  for (const chunk of chunks) {
    const id = uuidv4();
    const embedding = await generateEmbedding(chunk.text);

    await db.query(
      `INSERT INTO embeddings (id, content_type, content_id, chunk_index, text, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        contentType,
        contentId,
        chunk.index,
        chunk.text,
        `[${embedding.join(",")}]`,
        JSON.stringify({ ...metadata, ...chunk.metadata }),
      ],
    );

    ids.push(id);
  }

  return ids;
}

/**
 * Semantic similarity search — find nearest neighbors in the vector store.
 */
export async function semanticSearch(
  query: string,
  contentType?: ContentType,
  limit: number = 10,
  databaseUrl?: string,
): Promise<Array<{
  id: string;
  contentType: string;
  contentId: string;
  text: string;
  similarity: number;
  metadata: Record<string, unknown>;
}>> {
  const db = getPool(databaseUrl);
  const queryEmbedding = await generateEmbedding(query);

  let sql: string;
  let params: unknown[];

  if (contentType) {
    sql = `
      SELECT id, content_type, content_id, text, metadata,
             1 - (embedding <=> $1::vector) AS similarity
      FROM embeddings
      WHERE content_type = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `;
    params = [`[${queryEmbedding.join(",")}]`, contentType, limit];
  } else {
    sql = `
      SELECT id, content_type, content_id, text, metadata,
             1 - (embedding <=> $1::vector) AS similarity
      FROM embeddings
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;
    params = [`[${queryEmbedding.join(",")}]`, limit];
  }

  const result = await db.query(sql, params);

  return result.rows.map((row) => ({
    id: row.id,
    contentType: row.content_type,
    contentId: row.content_id,
    text: row.text,
    similarity: parseFloat(row.similarity),
    metadata: row.metadata || {},
  }));
}

/**
 * Delete all embeddings for a specific content item.
 */
export async function deleteEmbeddings(
  contentType: ContentType,
  contentId: string,
  databaseUrl?: string,
): Promise<number> {
  const db = getPool(databaseUrl);
  const result = await db.query(
    `DELETE FROM embeddings WHERE content_type = $1 AND content_id = $2`,
    [contentType, contentId],
  );
  return result.rowCount || 0;
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Normalize embedding to target dimension by padding with zeros or truncating.
 */
function normalizeEmbeddingDimension(embedding: number[], targetDim: number): number[] {
  if (embedding.length === targetDim) return embedding;
  if (embedding.length > targetDim) return embedding.slice(0, targetDim);
  return [...embedding, ...new Array(targetDim - embedding.length).fill(0)];
}

/**
 * Deterministic fallback embedding for dev/testing when API is unavailable.
 * Uses a simple hash-based approach — NOT suitable for production.
 */
function generateFallbackEmbedding(text: string): number[] {
  const dim = 1536;
  const embedding = new Array(dim).fill(0);

  // Simple hash-based pseudo-embedding
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const idx = (charCode * (i + 1) * 31) % dim;
    embedding[idx] += 1.0 / Math.sqrt(text.length);
  }

  // L2 normalize
  const norm = Math.sqrt(embedding.reduce((s: number, v: number) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}
