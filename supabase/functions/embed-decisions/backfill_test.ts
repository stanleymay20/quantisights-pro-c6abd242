/**
 * Backfill test — populates decision_embeddings for all existing records.
 * Also verifies retrieval quality.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateDeterministicEmbedding, cosineSimilarity } from "../_shared/deterministic-embeddings.ts";
import { decisionToText, outcomeToText, storeEmbedding } from "../_shared/rag-context.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.test("Backfill: embed all decisions", async () => {
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  // Fetch all decisions
  const { data: decisions } = await svc
    .from("decision_ledger")
    .select("id, organization_id, recommended_action, chosen_action, decision_type, notes, capped_confidence, predicted_net_impact, decision_status")
    .limit(500);

  console.log(`Found ${decisions?.length ?? 0} decisions to embed`);
  let embedded = 0;

  for (const d of (decisions || [])) {
    const text = decisionToText(d);
    const embedding = generateDeterministicEmbedding(text);
    await storeEmbedding(SUPABASE_URL, SERVICE_KEY, d.organization_id, "decision", d.id, text, embedding, {
      decision_type: d.decision_type,
      confidence: d.capped_confidence,
      status: d.decision_status,
    });
    embedded++;
  }
  console.log(`Embedded ${embedded} decisions`);
  assertEquals(embedded > 0, true);
});

Deno.test("Backfill: embed all outcomes", async () => {
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: outcomes } = await svc
    .from("decision_ledger")
    .select("id, organization_id, recommended_action, outcome_delta, prediction_accuracy_score, calibration_error, decision_status, execution_status")
    .eq("execution_status", "completed")
    .not("outcome_delta", "is", null)
    .limit(500);

  console.log(`Found ${outcomes?.length ?? 0} outcomes to embed`);
  let embedded = 0;

  for (const d of (outcomes || [])) {
    const text = outcomeToText(d);
    const embedding = generateDeterministicEmbedding(text);
    await storeEmbedding(SUPABASE_URL, SERVICE_KEY, d.organization_id, "outcome", d.id, text, embedding, {
      outcome_delta: d.outcome_delta,
      accuracy_score: d.prediction_accuracy_score,
      calibration_error: d.calibration_error,
    });
    embedded++;
  }
  console.log(`Embedded ${embedded} outcomes`);
});

Deno.test("Backfill: embed all insights", async () => {
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: insights } = await svc
    .from("insights")
    .select("id, organization_id, message, category, severity, confidence")
    .order("created_at", { ascending: false })
    .limit(500);

  console.log(`Found ${insights?.length ?? 0} insights to embed`);
  let embedded = 0;

  for (const i of (insights || [])) {
    const text = `[${i.severity}] ${i.category}: ${i.message}`;
    const embedding = generateDeterministicEmbedding(text);
    await storeEmbedding(SUPABASE_URL, SERVICE_KEY, i.organization_id, "insight", i.id, text, embedding, {
      category: i.category,
      severity: i.severity,
      confidence: i.confidence,
    });
    embedded++;
  }
  console.log(`Embedded ${embedded} insights`);
});

Deno.test("Backfill: embed all advisories", async () => {
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: advisories } = await svc
    .from("advisory_instances")
    .select("id, organization_id, title, action, category, priority, confidence")
    .order("created_at", { ascending: false })
    .limit(500);

  console.log(`Found ${advisories?.length ?? 0} advisories to embed`);
  let embedded = 0;

  for (const a of (advisories || [])) {
    const text = `[${a.priority}] ${a.category}: ${a.title}. Action: ${a.action}`;
    const embedding = generateDeterministicEmbedding(text);
    await storeEmbedding(SUPABASE_URL, SERVICE_KEY, a.organization_id, "advisory", a.id, text, embedding, {
      category: a.category,
      priority: a.priority,
      confidence: a.confidence,
    });
    embedded++;
  }
  console.log(`Embedded ${advisories?.length ?? 0} advisories`);
});

Deno.test("Verify: embedding counts by entity type", async () => {
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  
  const { data } = await svc
    .from("decision_embeddings")
    .select("entity_type")
    .limit(1000);

  const counts: Record<string, number> = {};
  for (const row of (data || [])) {
    counts[row.entity_type] = (counts[row.entity_type] || 0) + 1;
  }
  console.log("Embedding counts by entity type:", JSON.stringify(counts));
  
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  assertEquals(total > 0, true, "Should have embeddings after backfill");
});

Deno.test("Verify: semantic retrieval quality", async () => {
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);

  // Get a sample decision
  const { data: sample } = await svc
    .from("decision_embeddings")
    .select("content_text, embedding, organization_id")
    .eq("entity_type", "decision")
    .limit(1);

  if (!sample?.length) {
    console.log("No embeddings to test retrieval");
    return;
  }

  const orgId = sample[0].organization_id;
  const queryText = sample[0].content_text;
  const queryEmbedding = generateDeterministicEmbedding(queryText);

  // Search for similar
  const { data: results, error } = await svc.rpc("match_decision_embeddings" as any, {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_threshold: 0.2,
    match_count: 5,
    filter_org_id: orgId,
    filter_entity_types: ["decision", "outcome", "insight", "advisory"],
  });

  console.log(`Retrieval test: query="${queryText.slice(0, 80)}..."`);
  console.log(`Results: ${(results || []).length} matches`);
  for (const r of (results || []).slice(0, 3)) {
    const sim = 1 - (r.distance || 0);
    console.log(`  [${r.entity_type}] sim=${sim.toFixed(3)}: ${r.content_text.slice(0, 100)}`);
  }

  // The exact same text should return similarity ~1.0
  if (results?.length > 0) {
    const topSim = 1 - (results[0].distance || 0);
    assertEquals(topSim > 0.9, true, "Exact match should have >0.9 similarity");
  }
});
