// GA-1: Supplier Risk runtime ingestion path.
// Supplier-risk-shaped advisories/insights are routed through the RTS-1 / Agent
// Gateway / Runtime pipeline. Unknown monetary exposure or delivery delay is
// represented as 0 — never fabricated from priority labels. Source identity is
// persisted so concurrent/replayed runs cannot create duplicate decisions.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { runSupplierRiskRuntimePipeline } from "./_generated/supplier-risk-runtime-pipeline.mjs";

type SourceKind = "advisory" | "insight";

interface SupplierRiskSource {
  kind: SourceKind;
  id: string;
  title: string;
  action: string;
  category: string | null;
  priority: string;
  rationale: string | null;
  expected_impact: string | number | null;
  dataset_id: string | null;
  created_at: string | null;
}

type ServiceClient = ReturnType<typeof createClient<any>>;

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Supplier risk runtime unavailable" }, 503, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.id) return json({ error: "Unauthorized" }, 401, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : null;
    if (!organizationId) return json({ error: "organization_id required" }, 400, corsHeaders);

    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (membershipError) throw new Error(`Failed to verify organization membership: ${membershipError.message}`);
    if (!membership) return json({ error: "Forbidden" }, 403, corsHeaders);

    const service = createClient(supabaseUrl, serviceKey);
    const now = new Date().toISOString();

    const advisories = await fetchOpenAdvisories(service, organizationId);
    const insights = await fetchDecisionGradeInsights(service, organizationId);
    const allSources: SupplierRiskSource[] = [
      ...advisories.map(normalizeAdvisory),
      ...insights.map(normalizeInsight),
    ].filter(isSupplierRiskSource);

    if (allSources.length === 0) {
      return json({ message: "No supplier-risk-shaped advisories or insights to process", created: 0 }, 200, corsHeaders);
    }

    const existing = await fetchExistingDecisionSources(service, organizationId);
    const newSources = allSources.filter((source) => !hasExistingDecision(existing, source));
    if (newSources.length === 0) {
      return json({ message: "All supplier-risk sources already have decisions", created: 0 }, 200, corsHeaders);
    }

    const results: Array<{ source_id: string; source_kind: SourceKind; status: string; decision_id: string | null }> = [];
    const processedAdvisories: SupplierRiskSource[] = [];

    for (const source of newSources) {
      const pipelineResult = await runSupplierRiskPipelineForSource(service, organizationId, source, now, user.id);
      results.push({
        source_id: source.id,
        source_kind: source.kind,
        status: pipelineResult.status,
        decision_id: pipelineResult.decision_id,
      });
      if ((pipelineResult.status === "DECISION_LEDGER_READY" || pipelineResult.status === "ALREADY_EXISTS") && source.kind === "advisory") {
        processedAdvisories.push(source);
      }
    }

    if (processedAdvisories.length > 0) {
      const { error } = await service
        .from("advisory_instances")
        .update({ status: "in_progress" })
        .in("id", processedAdvisories.map((source) => source.id))
        .eq("organization_id", organizationId)
        .eq("status", "open");
      if (error) throw new Error(`Failed to mark supplier-risk advisories in progress: ${error.message}`);
    }

    const created = results.filter((result) => result.status === "DECISION_LEDGER_READY").length;
    const existingCount = results.filter((result) => result.status === "ALREADY_EXISTS").length;
    const { error: auditError } = await service.from("audit_log").insert({
      organization_id: organizationId,
      actor_id: user.id,
      actor_type: "system",
      action_type: "supplier_risk_runtime_decisions_created",
      resource_type: "decision_ledger",
      payload: {
        count: created,
        existing: existingCount,
        examined: newSources.length,
        results,
        source: "supplier_risk_runtime_ingest",
      },
    });
    if (auditError) throw new Error(`Failed to persist supplier-risk run audit: ${auditError.message}`);

    return json({ created, existing: existingCount, examined: newSources.length, results }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("supplier-risk-runtime-ingest error:", message);
    return json({ error: message }, 500, getCorsHeaders(req));
  }
});

async function runSupplierRiskPipelineForSource(
  service: ServiceClient,
  organizationId: string,
  source: SupplierRiskSource,
  now: string,
  userId: string,
): Promise<{ status: string; decision_id: string | null }> {
  const impactAmount = deriveImpactAmount(source);
  const deliveryDelayHours = deriveDeliveryDelayHours(source);
  const observedAt = normalizeObservedAt(source.created_at);
  const idempotencyKey = sourceKey(source);
  let persistedDecisionId: string | null = null;
  let reusedExisting = false;

  const result = await runSupplierRiskRuntimePipeline(
    {
      now,
      signal: {
        event_id: `${source.kind}-${source.id}`,
        source_system: source.kind === "advisory" ? "advisory-engine" : "insight-engine",
        connector_id: `supplier-risk-runtime-ingest:${source.kind}`,
        source_record_id: source.id,
        tenant_id: organizationId,
        organization_id: organizationId,
        supplier_id: source.id,
        delivery_delay_hours: deliveryDelayHours,
        impact_amount: impactAmount,
        description: source.rationale ?? source.title,
        observed_at: observedAt,
      },
    },
    {
      persistDecisionRecord: async (record: { decision_id: string; decision_class: string; status: string }) => {
        const { error } = await service.from("audit_log").insert({
          organization_id: organizationId,
          actor_id: userId,
          actor_type: "system",
          action_type: "agent_gateway.decision_recorded",
          resource_type: "decision_ledger",
          resource_id: persistedDecisionId ?? record.decision_id,
          payload: {
            decision_class: record.decision_class,
            approval_state: record.status,
            source_kind: source.kind,
            source_id: source.id,
            source_idempotency_key: idempotencyKey,
            reused_existing: reusedExisting,
          },
        });
        if (error) throw new Error(`decision record audit insert failed: ${error.message}`);
        return { decision_id: persistedDecisionId ?? record.decision_id };
      },
      writeAuditEvent: async (event: {
        organization_id: string;
        actor_id?: string | null;
        action_type: string;
        resource_type: string;
        resource_id?: string | null;
        payload: Record<string, unknown>;
      }) => {
        const { data, error } = await service
          .from("audit_log")
          .insert({
            organization_id: event.organization_id,
            actor_id: event.actor_id ?? userId,
            actor_type: event.actor_id ? "user" : "system",
            action_type: event.action_type,
            resource_type: event.resource_type,
            resource_id: event.resource_id,
            payload: { ...event.payload, source_idempotency_key: idempotencyKey },
          })
          .select("id")
          .single();
        if (error || !data?.id) throw new Error(`audit_log insert failed: ${error?.message ?? "missing id"}`);
        return { audit_id: data.id };
      },
      persistDecisionLedgerRow: async (row: Record<string, unknown>) => {
        const insertRow = {
          ...row,
          source_idempotency_key: idempotencyKey,
          advisory_instance_id: source.kind === "advisory" ? source.id : null,
        };
        const { data, error } = await service
          .from("decision_ledger")
          .insert(insertRow)
          .select("id")
          .single();

        if (error?.code === "23505") {
          const { data: existing, error: existingError } = await service
            .from("decision_ledger")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("source_idempotency_key", idempotencyKey)
            .maybeSingle();
          if (existingError || !existing?.id) {
            throw new Error(`decision replay lookup failed: ${existingError?.message ?? "missing existing decision"}`);
          }
          persistedDecisionId = existing.id;
          reusedExisting = true;
          return { decision_id: existing.id };
        }

        if (error || !data?.id) throw new Error(`decision_ledger insert failed: ${error?.message ?? "missing id"}`);
        persistedDecisionId = data.id;
        return { decision_id: data.id };
      },
    },
  );

  return {
    status: reusedExisting ? "ALREADY_EXISTS" : result.status,
    decision_id: persistedDecisionId,
  };
}

async function fetchOpenAdvisories(client: ServiceClient, organizationId: string) {
  const { data, error } = await client
    .from("advisory_instances")
    .select("id, title, action, category, priority, rationale, kpi_affected, expected_impact, dataset_id, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .in("priority", ["critical", "high", "medium"])
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(`Failed to fetch advisories: ${error.message}`);
  return data ?? [];
}

async function fetchDecisionGradeInsights(client: ServiceClient, organizationId: string) {
  const { data, error } = await client
    .from("insights")
    .select("id, message, severity, category, dataset_id, created_at")
    .eq("organization_id", organizationId)
    .in("severity", ["critical", "high"])
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(`Failed to fetch decision-grade insights: ${error.message}`);
  return data ?? [];
}

async function fetchExistingDecisionSources(client: ServiceClient, organizationId: string) {
  const { data, error } = await client
    .from("decision_ledger")
    .select("advisory_instance_id, explanation_metadata, source_idempotency_key")
    .eq("organization_id", organizationId)
    .limit(2000);
  if (error) throw new Error(`Failed to fetch existing decisions: ${error.message}`);
  return data ?? [];
}

function hasExistingDecision(existing: Array<Record<string, unknown>>, source: SupplierRiskSource) {
  const key = sourceKey(source);
  return existing.some((row) => {
    if (row.source_idempotency_key === key) return true;
    if (source.kind === "advisory" && row.advisory_instance_id === source.id) return true;
    const meta = isRecord(row.explanation_metadata) ? row.explanation_metadata : {};
    const sourceMeta = isRecord(meta.source) ? meta.source : {};
    return sourceMeta.kind === "insight" && sourceMeta.id === source.id;
  });
}

function normalizeAdvisory(advisory: Record<string, unknown>): SupplierRiskSource {
  return {
    kind: "advisory",
    id: String(advisory.id),
    title: typeof advisory.title === "string" ? advisory.title : "Advisory requires decision",
    action: typeof advisory.action === "string"
      ? advisory.action
      : typeof advisory.rationale === "string"
        ? advisory.rationale
        : "Review advisory and choose an executive response.",
    category: typeof advisory.category === "string"
      ? advisory.category
      : typeof advisory.kpi_affected === "string" ? advisory.kpi_affected : null,
    priority: normalizePriority(advisory.priority),
    rationale: typeof advisory.rationale === "string" ? advisory.rationale : null,
    expected_impact: typeof advisory.expected_impact === "string" || typeof advisory.expected_impact === "number" ? advisory.expected_impact : null,
    dataset_id: typeof advisory.dataset_id === "string" ? advisory.dataset_id : null,
    created_at: typeof advisory.created_at === "string" ? advisory.created_at : null,
  };
}

function normalizeInsight(insight: Record<string, unknown>): SupplierRiskSource {
  const message = typeof insight.message === "string" ? insight.message : null;
  return {
    kind: "insight",
    id: String(insight.id),
    title: message ? message.slice(0, 96) : "Supplier risk insight requires executive decision",
    action: "Review supplier risk insight and choose an executive response.",
    category: typeof insight.category === "string" ? insight.category : null,
    priority: normalizePriority(insight.severity),
    rationale: message,
    expected_impact: null,
    dataset_id: typeof insight.dataset_id === "string" ? insight.dataset_id : null,
    created_at: typeof insight.created_at === "string" ? insight.created_at : null,
  };
}

export function isSupplierRiskSource(source: Pick<SupplierRiskSource, "category" | "title" | "rationale">): boolean {
  const text = `${source.category ?? ""} ${source.title} ${source.rationale ?? ""}`.toLowerCase();
  return /supplier|vendor|delivery/.test(text);
}

function sourceKey(source: SupplierRiskSource): string {
  return `${source.kind}:${source.id}`;
}

function deriveImpactAmount(source: SupplierRiskSource): number {
  const parsed = parseImpactEstimate(source.expected_impact);
  return typeof parsed === "number" && parsed > 0 ? parsed : 0;
}

function deriveDeliveryDelayHours(source: SupplierRiskSource): number {
  const text = `${source.title} ${source.rationale ?? ""}`;
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hours) return Math.max(0, Number(hours[1]));
  const days = text.match(/(\d+(?:\.\d+)?)\s*days?\b/i);
  if (days) return Math.max(0, Number(days[1]) * 24);
  return 0;
}

function normalizeObservedAt(createdAt: string | null): string {
  if (!createdAt) return "1970-01-01T00:00:00.000Z";
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? "1970-01-01T00:00:00.000Z" : parsed.toISOString();
}

function parseImpactEstimate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value);
  const matches = text.match(/-?\d+(?:[,.]\d+)?/g);
  if (!matches?.length) return null;
  const nums = matches.map((match) => Number(match.replace(/,/g, ""))).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, number) => sum + number, 0) / nums.length;
}

function normalizePriority(value: unknown) {
  const normalized = String(value ?? "medium").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "low") return "low";
  return "medium";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(payload: unknown, status: number, corsHeaders: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
