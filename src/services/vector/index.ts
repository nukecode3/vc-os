/**
 * Vector service barrel export — single entry point for all vector operations.
 */

export { getPool, closePool, initializeSchema } from "./database.js";
export {
  generateEmbedding,
  generateEmbeddings,
  chunkText,
  embedAndStore,
  semanticSearch,
  deleteEmbeddings,
  type ContentType,
  type TextChunk,
} from "./embeddings.js";
export {
  seedSuccessPatterns,
  addSuccessPattern,
  findSimilarSuccesses,
  type SuccessPattern,
  type StageSnapshot,
} from "./successPatterns.js";
export {
  seedFounderArchetypes,
  addFounderArchetype,
  findSimilarFounders,
  type FounderArchetype,
} from "./founderArchetypes.js";
export {
  storeEssay,
  storeEssays,
  findPGPatterns,
  generatePGReport,
  PG_ESSAY_THEMES,
  type PGPatternMatch,
} from "./pgEssayIndex.js";
