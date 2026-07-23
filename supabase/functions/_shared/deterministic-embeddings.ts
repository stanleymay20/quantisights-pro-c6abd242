/**
 * Deterministic Text Embedding Engine
 * 
 * Replaces LLM-prompted pseudo-embeddings with a proper TF-IDF-inspired
 * hash-based vector generation system that produces:
 * 1. Consistent vectors for the same input (deterministic)
 * 2. Semantically meaningful cosine similarity (n-gram overlap)
 * 3. Fixed-dimension output (768) without LLM calls
 * 
 * Approach: Character + word n-gram hashing with positional encoding
 * and IDF-weighted feature hashing (random indexing).
 */

const EMBEDDING_DIMENSION = 768;
const CHAR_NGRAM_MIN = 2;
const CHAR_NGRAM_MAX = 4;
const WORD_NGRAM_MAX = 3;

// ═══════════════════════════════════════════════════════
// CORE: Deterministic hash function (FNV-1a 32-bit)
// ═══════════════════════════════════════════════════════

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/** Hash to a bucket index and sign (+1/-1) for random indexing */
function hashToBucket(feature: string): { index: number; sign: number } {
  const h1 = fnv1a(feature);
  const h2 = fnv1a(feature + "_sign");
  return {
    index: h1 % EMBEDDING_DIMENSION,
    sign: (h2 % 2 === 0) ? 1 : -1,
  };
}

// ═══════════════════════════════════════════════════════
// TEXT PREPROCESSING
// ═══════════════════════════════════════════════════════

/** Normalize text: lowercase, strip punctuation, collapse whitespace */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize into words */
function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(w => w.length > 0);
}

/** Extract character n-grams from a word */
function charNgrams(word: string): string[] {
  const grams: string[] = [];
  const padded = `<${word}>`;
  for (let n = CHAR_NGRAM_MIN; n <= CHAR_NGRAM_MAX; n++) {
    for (let i = 0; i <= padded.length - n; i++) {
      grams.push(padded.substring(i, i + n));
    }
  }
  return grams;
}

/** Extract word n-grams from token list */
function wordNgrams(tokens: string[], maxN: number = WORD_NGRAM_MAX): string[] {
  const grams: string[] = [];
  for (let n = 1; n <= Math.min(maxN, tokens.length); n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      grams.push(tokens.slice(i, i + n).join("_"));
    }
  }
  return grams;
}

// ═══════════════════════════════════════════════════════
// IDF APPROXIMATION (domain-specific stop words)
// ═══════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "because", "but", "and", "or", "if", "while", "this", "that", "these",
  "those", "it", "its", "i", "me", "my", "we", "our", "you", "your",
  "he", "him", "his", "she", "her", "they", "them", "their", "what",
  "which", "who", "whom",
]);

/** Domain-specific boosted terms for decision intelligence */
const DOMAIN_BOOST: Record<string, number> = {
  // Financial
  revenue: 2.0, cost: 1.8, margin: 1.8, profit: 2.0, ebitda: 2.5,
  churn: 2.0, retention: 1.8, growth: 1.5, decline: 1.8, loss: 1.8,
  // Risk
  risk: 2.0, threat: 1.8, vulnerability: 1.8, exposure: 1.8, compliance: 2.0,
  // Strategy
  strategy: 1.5, decision: 2.0, recommendation: 1.8, action: 1.5,
  investment: 2.0, acquisition: 2.0, expansion: 1.8, pivot: 2.0,
  // Performance
  kpi: 2.0, metric: 1.5, benchmark: 1.8, target: 1.5, forecast: 1.8,
  anomaly: 2.0, outlier: 1.8, trend: 1.5, pattern: 1.5,
  // Severity
  critical: 2.5, urgent: 2.0, warning: 1.8, escalation: 2.0,
  // Outcome
  success: 1.8, failure: 1.8, outcome: 2.0, impact: 1.8, result: 1.5,
  accuracy: 2.0, calibration: 2.5, confidence: 2.0, prediction: 2.0,
};

/** Get IDF-like weight for a token */
function tokenWeight(token: string): number {
  if (STOP_WORDS.has(token)) return 0.1;
  if (DOMAIN_BOOST[token]) return DOMAIN_BOOST[token];
  // Default: moderate weight, longer words tend to be more specific
  return Math.min(1.0 + token.length * 0.05, 1.5);
}

// ═══════════════════════════════════════════════════════
// VECTOR GENERATION
// ═══════════════════════════════════════════════════════

/**
 * Generate a deterministic embedding vector for text.
 * Uses random indexing (feature hashing) with:
 * - Character n-grams (captures subword/morphological similarity)
 * - Word n-grams (captures phrase-level semantics)
 * - Positional encoding (captures text structure)
 * - IDF weighting (domain-specific term importance)
 */
export function generateDeterministicEmbedding(text: string): number[] {
  const vector = new Float64Array(EMBEDDING_DIMENSION);
  const tokens = tokenize(text);
  
  if (tokens.length === 0) {
    // Return zero vector for empty text
    return Array.from(vector);
  }

  // 1. Character n-gram features (subword semantics)
  for (const token of tokens) {
    const weight = tokenWeight(token);
    const grams = charNgrams(token);
    for (const gram of grams) {
      const { index, sign } = hashToBucket(`char:${gram}`);
      vector[index] += sign * weight * 0.5;
    }
  }

  // 2. Word unigram features (bag of words)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const weight = tokenWeight(token);
    const { index, sign } = hashToBucket(`word:${token}`);
    vector[index] += sign * weight;
    
    // Positional encoding: boost early tokens slightly
    const posWeight = 1.0 + 0.3 * Math.exp(-i / Math.max(tokens.length, 1));
    vector[index] += sign * weight * (posWeight - 1.0) * 0.2;
  }

  // 3. Word n-gram features (phrase semantics)
  const wNgrams = wordNgrams(tokens, WORD_NGRAM_MAX);
  for (const gram of wNgrams) {
    const parts = gram.split("_");
    // Higher n-grams are rarer → higher weight
    const ngramWeight = 0.8 + parts.length * 0.3;
    const { index, sign } = hashToBucket(`wng:${gram}`);
    vector[index] += sign * ngramWeight;
  }

  // 4. Global text features (length, density)
  const lengthBucket = Math.min(Math.floor(tokens.length / 10), 20);
  const { index: lIdx, sign: lSign } = hashToBucket(`meta:len:${lengthBucket}`);
  vector[lIdx] += lSign * 0.5;

  // Unique word ratio (lexical diversity)
  const uniqueRatio = new Set(tokens).size / tokens.length;
  const { index: dIdx, sign: dSign } = hashToBucket(`meta:diversity`);
  vector[dIdx] += dSign * uniqueRatio;

  // 5. Normalize to unit vector for cosine similarity
  let magnitude = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);
  
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      vector[i] /= magnitude;
    }
  }

  return Array.from(vector);
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

export const DETERMINISTIC_EMBEDDING_DIMENSION = EMBEDDING_DIMENSION;
