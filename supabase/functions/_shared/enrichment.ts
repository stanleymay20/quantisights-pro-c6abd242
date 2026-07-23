/**
 * Shared enrichment helper.
 *
 * Calls the `enrich-decision-context` edge function and returns a normalized
 * shape ready to be persisted on `advisory_instances` or merged into
 * `decision_ledger.explanation_metadata`.
 *
 * Doctrine:
 * - Client evidence is the anchor (Layer A).
 * - Internal/external reference data adds context only (Layer B).
 * - This helper never mutates client values — it only produces summaries +
 *   confidence adjustment metadata.
 */

export interface EnrichmentInput {
  organization_id: string;
  advisory_id?: string | null;
  decision_id?: string | null;
  region?: string | null;
  industry?: string | null;
  metric_focus?: string | null;
  client_confidence?: number;
}

export interface EnrichmentOutput {
  enrichment_id: string | null;
  client_confidence: number;
  enriched_confidence: number;
  confidence_delta: number;
  blending_rule: string;
  client_evidence_summary: string;
  internal_context_summary: string;
  combined_interpretation: string;
  internal_context_count: number;
  internal_context: unknown[];
  ok: boolean;
  error?: string;
}

const EMPTY: EnrichmentOutput = {
  enrichment_id: null,
  client_confidence: 0,
  enriched_confidence: 0,
  confidence_delta: 0,
  blending_rule: "no_context",
  client_evidence_summary: "",
  internal_context_summary: "",
  combined_interpretation: "",
  internal_context_count: 0,
  internal_context: [],
  ok: false,
};

export async function enrichWithContext(
  input: EnrichmentInput,
): Promise<EnrichmentOutput> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const resp = await fetch(`${supabaseUrl}/functions/v1/enrich-decision-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        organization_id: input.organization_id,
        advisory_id: input.advisory_id ?? null,
        decision_id: input.decision_id ?? null,
        region: input.region ?? null,
        industry: input.industry ?? null,
        metric_focus: input.metric_focus ?? null,
        client_confidence: Math.round(input.client_confidence ?? 50),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn("[enrichment] enrich-decision-context failed:", resp.status, text);
      return { ...EMPTY, error: `enrich call failed: ${resp.status}` };
    }

    const body = await resp.json();
    const internal = Array.isArray(body.internal_context) ? body.internal_context : [];

    const headwinds = internal
      .filter((r: any) => ["worsening", "tightening", "rising", "slowing"].includes(String(r?.signal ?? "")))
      .slice(0, 3);
    const tailwinds = internal
      .filter((r: any) => ["improving", "accelerating", "declining"].includes(String(r?.signal ?? "")))
      .slice(0, 3);

    const internal_context_summary = internal.length === 0
      ? "No relevant external/internal context found"
      : [
          headwinds.length ? `Headwinds: ${headwinds.map((h: any) => `${h.metric} (${h.value}${h.unit ?? ""})`).join(", ")}` : "",
          tailwinds.length ? `Tailwinds: ${tailwinds.map((h: any) => `${h.metric} (${h.value}${h.unit ?? ""})`).join(", ")}` : "",
          headwinds.length === 0 && tailwinds.length === 0 ? `${internal.length} reference signals reviewed (neutral)` : "",
        ].filter(Boolean).join(" | ");

    const client_evidence_summary = input.metric_focus
      ? `Client metric: ${input.metric_focus} (confidence ${input.client_confidence ?? 50}%)`
      : `Client data analyzed (confidence ${input.client_confidence ?? 50}%)`;

    return {
      enrichment_id: body.enrichment_id ?? null,
      client_confidence: Number(body.client_confidence ?? input.client_confidence ?? 0),
      enriched_confidence: Number(body.enriched_confidence ?? input.client_confidence ?? 0),
      confidence_delta: Number(body.confidence_delta ?? 0),
      blending_rule: String(body.blending_rule ?? "no_context"),
      client_evidence_summary,
      internal_context_summary,
      combined_interpretation: String(body.combined_interpretation ?? ""),
      internal_context_count: Number(body.internal_context_count ?? internal.length),
      internal_context: internal,
      ok: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.warn("[enrichment] error:", msg);
    return { ...EMPTY, error: msg };
  }
}

/**
 * Look up org region/industry once and cache for the request.
 */
export async function getOrgContext(
  organization_id: string,
): Promise<{ region: string | null; industry: string | null }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${organization_id}&select=industry`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!resp.ok) return { region: null, industry: null };
    const rows = await resp.json();
    return { region: null, industry: rows?.[0]?.industry ?? null };
  } catch {
    return { region: null, industry: null };
  }
}
