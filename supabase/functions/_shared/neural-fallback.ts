/**
 * Neural Embedding Fallback — generates real semantic embeddings via Lovable AI
 * when deterministic hash-based retrieval produces weak results.
 * 
 * Uses Gemini to produce a 768-dim embedding approximation via structured extraction,
 * then falls back to cosine similarity against stored deterministic vectors.
 * 
 * This is ONLY invoked when deterministic retrieval_quality is "low" or "none".
 */

const EMBEDDING_DIM = 768;

/**
 * Generate a neural-grade embedding by asking an LLM to extract semantic features
 * and mapping them to the same 768-dim space used by deterministic embeddings.
 * 
 * Strategy: Extract key concepts via LLM, then hash them into the same vector space.
 * This gives us semantic understanding (LLM) + compatibility (same hash space).
 */
export async function generateNeuralEmbedding(
  text: string,
  apiKey: string,
): Promise<{ embedding: number[]; concepts: string[] }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: `You are a semantic analysis engine. Extract the core business concepts, actions, and domains from the given text. Return ONLY a JSON object with a "concepts" array of 10-20 short phrases (2-4 words each) capturing the semantic meaning. Focus on: business domain, action type, stakeholders, metrics, risk factors, strategic intent.`,
        },
        { role: "user", content: text },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_concepts",
            description: "Extract semantic concepts from business text",
            parameters: {
              type: "object",
              properties: {
                concepts: {
                  type: "array",
                  items: { type: "string" },
                  description: "10-20 short semantic concept phrases",
                },
              },
              required: ["concepts"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_concepts" } },
    }),
  });

  if (!response.ok) {
    console.error("Neural embedding failed:", response.status);
    return { embedding: [], concepts: [] };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return { embedding: [], concepts: [] };

  let concepts: string[];
  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    concepts = parsed.concepts || [];
  } catch {
    return { embedding: [], concepts: [] };
  }

  // Convert concepts to a vector in the same hash space as deterministic embeddings
  const embedding = conceptsToVector(concepts);
  return { embedding, concepts };
}

/**
 * Hash concept phrases into the same 768-dim vector space used by deterministic embeddings.
 * This ensures neural embeddings are comparable via cosine similarity with stored vectors.
 */
function conceptsToVector(concepts: string[]): number[] {
  const vector = new Float64Array(EMBEDDING_DIM);

  for (const concept of concepts) {
    const normalized = concept.toLowerCase().replace(/[^\w\s]/g, " ").trim();
    const words = normalized.split(/\s+/).filter(w => w.length > 0);

    // Hash each word with domain boost
    for (const word of words) {
      const { index, sign } = hashToBucket(`word:${word}`);
      vector[index] += sign * 1.5; // Boost because these are LLM-selected key terms
    }

    // Hash word pairs
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]}_${words[i + 1]}`;
      const { index, sign } = hashToBucket(`wng:${bigram}`);
      vector[index] += sign * 1.8;
    }

    // Character n-grams for subword matching
    for (const word of words) {
      const padded = `<${word}>`;
      for (let n = 2; n <= 4; n++) {
        for (let i = 0; i <= padded.length - n; i++) {
          const gram = padded.substring(i, i + n);
          const { index, sign } = hashToBucket(`char:${gram}`);
          vector[index] += sign * 0.3;
        }
      }
    }
  }

  // L2 normalize
  let magnitude = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) magnitude += vector[i] * vector[i];
  magnitude = Math.sqrt(magnitude);
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) vector[i] /= magnitude;
  }

  return Array.from(vector);
}

// Same FNV-1a hash as deterministic-embeddings.ts for vector space compatibility
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

function hashToBucket(feature: string): { index: number; sign: number } {
  const h1 = fnv1a(feature);
  const h2 = fnv1a(feature + "_sign");
  return {
    index: h1 % EMBEDDING_DIM,
    sign: (h2 % 2 === 0) ? 1 : -1,
  };
}
