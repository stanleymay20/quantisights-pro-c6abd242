import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mapping from retention data_category to the table(s) that should be cleaned
const CATEGORY_TABLE_MAP: Record<string, { table: string; dateColumn: string }[]> = {
  datasets: [{ table: "datasets", dateColumn: "created_at" }],
  decisions: [{ table: "decision_ledger", dateColumn: "created_at" }],
  advisories: [{ table: "advisory_instances", dateColumn: "created_at" }],
  copilot_messages: [
    { table: "copilot_messages", dateColumn: "created_at" },
    { table: "copilot_sessions", dateColumn: "updated_at" },
  ],
  // audit_logs: intentionally excluded — immutable
  session_data: [],
};

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return corsPreflightResponse(req);

  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  // Advisory lock — prevent overlapping cron runs
  const guard = await cronGuard("retention-cleanup");
  if (!guard.acquired) return guard.earlyResponse(corsHeaders);


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all policies with auto_cleanup enabled
    const { data: policies, error: polErr } = await supabase
      .from("data_retention_policies")
      .select("*")
      .eq("auto_cleanup", true);

    if (polErr) throw polErr;
    if (!policies || policies.length === 0) {
      return new Response(
        JSON.stringify({ message: "No auto-cleanup policies found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Keyed by data_category only (not per-org): with multiple orgs sharing
    // the same category (the common case -- most orgs have a "datasets"
    // policy), a plain last-write-wins assignment here would silently
    // overwrite every earlier org's numbers with whichever org happened to
    // be processed last. Accumulate across orgs instead so the summary is
    // an accurate total, not a random single org's result.
    const results: Record<string, { deleted: number; errors: number; last_error?: string }> = {};

    // Bound the policy loop with a time budget so a large org count can't
    // get killed mid-run by the invocation's wall-clock ceiling, and rotate
    // the starting point daily so a sustained overload doesn't permanently
    // starve whichever policies sort last -- safe to re-run since every
    // delete here is a plain WHERE-scoped delete, not order-dependent.
    const startedAt = Date.now();
    const deadline = makeDeadline(startedAt);
    const rotatedPolicies = rotateForFairness(policies, startedAt, DAY_MS);
    let policiesProcessed = 0;

    for (const policy of rotatedPolicies) {
      if (deadline.expired()) break;
      policiesProcessed++;
      const targets = CATEGORY_TABLE_MAP[policy.data_category];
      if (!targets || targets.length === 0) continue;
      // Skip audit_logs — immutable by design
      if (policy.data_category === "audit_logs") continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);
      const cutoffISO = cutoffDate.toISOString();

      let totalDeleted = 0;
      let lastError: string | undefined;

      for (const target of targets) {
        const { data: deleted, error: delErr } = await supabase
          .from(target.table)
          .delete()
          .eq("organization_id", policy.organization_id)
          .lt(target.dateColumn, cutoffISO)
          .select("id");

        if (delErr) {
          lastError = delErr.message;
        } else {
          totalDeleted += deleted?.length ?? 0;
        }
      }

      const categoryResult = results[policy.data_category] ?? { deleted: 0, errors: 0 };
      categoryResult.deleted += totalDeleted;
      if (lastError) {
        categoryResult.errors += 1;
        categoryResult.last_error = lastError;
      }
      results[policy.data_category] = categoryResult;

      // Update enforcement status
      await supabase
        .from("data_retention_policies")
        .update({
          enforcement_status: "enforced",
          last_cleanup_at: new Date().toISOString(),
          next_scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        } as any)
        .eq("id", policy.id);
    }

    // Also update policies with auto_cleanup=true that haven't been run yet to 'scheduled'
    await supabase
      .from("data_retention_policies")
      .update({ enforcement_status: "scheduled" } as any)
      .eq("auto_cleanup", true)
      .is("last_cleanup_at", null);

    // Sweep stuck datasets — anything in `processing` for >24h is treated as an abandoned worker
    // and marked failed so it stops showing as "still ingesting" in the UI.
    const stuckCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stuckDatasets, error: stuckErr } = await supabase
      .from("datasets")
      .update({
        status: "failed",
        provenance: { auto_failed_reason: "Ingestion worker abandoned; auto-failed after >24h in processing" },
      } as any)
      .eq("status", "processing")
      .lt("created_at", stuckCutoff)
      .select("id");
    if (!stuckErr) {
      results["stuck_datasets"] = { deleted: stuckDatasets?.length ?? 0, errors: 0 };
    }

    const truncated = policiesProcessed < rotatedPolicies.length;
    await guard.succeed({ results, policies_processed: policiesProcessed, policies_total: rotatedPolicies.length, truncated });
    return new Response(
      JSON.stringify({ success: true, results, policies_processed: policiesProcessed, policies_total: rotatedPolicies.length, truncated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    await guard.fail(err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
