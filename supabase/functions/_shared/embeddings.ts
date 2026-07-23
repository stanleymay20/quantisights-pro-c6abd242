/**
 * Shared embedding + RAG utilities for the Decision Intelligence platform.
 * 
 * v2: Uses deterministic TF-IDF hash-based embeddings instead of LLM-prompted
 * pseudo-embeddings. This produces consistent, reproducible vectors where
 * cosine similarity reflects genuine semantic overlap.
 * 
 * Re-exports RAG context utilities from rag-context.ts for backward compatibility.
 */

import { generateDeterministicEmbedding } from "./deterministic-embeddings.ts";

// Re-export everything from rag-context for backward compatibility
export { 
  storeEmbedding, 
  searchSimilar, 
  buildRAGContext, 
  decisionToText, 
  outcomeToText 
} from "./rag-context.ts";

/**
 * Generate text embeddings using deterministic feature hashing.
 * 
 * This replaces the previous LLM-prompted approach with a proper
 * TF-IDF-inspired hash-based vector that:
 * - Produces identical output for identical input (deterministic)
 * - Uses character n-grams for subword similarity
 * - Uses word n-grams for phrase-level semantics
 * - Applies domain-specific IDF weighting
 * - Runs in <1ms (no network call needed)
 * 
 * The `apiKey` parameter is kept for backward compatibility but is no longer used.
 */
export async function generateEmbedding(
  text: string,
  _apiKey?: string
): Promise<number[]> {
  return generateDeterministicEmbedding(text);
}
