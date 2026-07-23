/**
 * Phase 6A — Apply Context Pack
 *
 * Initializes (not locks) configuration from a system context pack:
 *   - Upserts threshold defaults into governance_thresholds (source='pack')
 *   - Optionally seeds governance_profile defaults (only if no override exists)
 *   - Marks organization_context_packs row with derived_from_pack
 *
 * After activation, the organization OWNS the configuration. Re-applying
 * the pack does not overwrite org-level overrides.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { isValidUUID, isValidString } from "../_shared/input-validation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  let body: { organization_id?: string; pack_key?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { organization_id, pack_key } = body;
  if (!isValidUUID(organization_id as string)) return json({ error: "invalid organization_id" }, 400);
  if (!isValidString(pack_key as string, 64)) return json({ error: "invalid pack_key" }, 400);

  if (!(await verifyOrgMembership(auth.userId, organization_id!))) {
    return json({ error: "not a member" }, 403);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Role check: only owner/admin can activate packs
  const { data: roleRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id!)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!roleRow || !["owner", "admin"].includes(roleRow.role)) {
    return json({ error: "owner or admin required" }, 403);
  }

  const { data: pack, error: packErr } = await supabase
    .from("context_packs")
    .select("pack_key, threshold_defaults, governance_defaults, kpi_templates")
    .eq("pack_key", pack_key!)
    .maybeSingle();
  if (packErr || !pack) return json({ error: "pack not found" }, 404);

  // 1. Activate pack (idempotent)
  await supabase.from("organization_context_packs").upsert({
    organization_id: organization_id!,
    pack_key: pack_key!,
    derived_from_pack: pack_key!,
    is_locked: false,
    enabled_by: auth.userId,
  }, { onConflict: "organization_id,pack_key" });

  // 2. Seed thresholds (only those not already set as org_override)
  const thresholds = pack.threshold_defaults as Record<string, number> | null;
  const thresholdRows: Array<Record<string, unknown>> = [];
  if (thresholds && typeof thresholds === "object") {
    const { data: existing } = await supabase
      .from("governance_thresholds")
      .select("threshold_key, source")
      .eq("organization_id", organization_id!)
      .is("effective_to", null);
    const existingKeys = new Set((existing ?? []).filter(r => r.source === "org_override").map(r => r.threshold_key));

    for (const [key, value] of Object.entries(thresholds)) {
      if (existingKeys.has(key)) continue; // org override wins
      thresholdRows.push({
        organization_id: organization_id!,
        threshold_key: key,
        threshold_value: value,
        source: "pack",
        source_ref: pack_key!,
        updated_by: auth.userId,
      });
    }
    if (thresholdRows.length > 0) {
      // Expire previous pack-derived rows for these keys
      const keys = thresholdRows.map(r => r.threshold_key as string);
      await supabase
        .from("governance_thresholds")
        .update({ effective_to: new Date().toISOString() })
        .eq("organization_id", organization_id!)
        .in("threshold_key", keys)
        .is("effective_to", null)
        .eq("source", "pack");
      await supabase.from("governance_thresholds").insert(thresholdRows);
    }
  }

  return json({
    ok: true,
    pack_key: pack_key!,
    thresholds_seeded: thresholdRows.length,
    notice: "Context pack activated as configuration overlay. Organization owns config; re-applying preserves overrides.",
  });
});
