// Shared helper: server-side feature access enforcement.
// Use in any edge function that gates a tier-restricted capability.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

export interface FeatureAccessResult {
  allowed: boolean;
  reason?: string;
  tier?: string;
  message?: string;
  in_grace_period?: boolean;
  quota_limit?: number | null;
}

/**
 * Server-side gate. Returns 402 Payment Required on denial.
 * Demo users (auth metadata is_demo=true) always pass.
 */
export async function requireFeatureAccess(
  supabaseUrl: string,
  serviceRoleKey: string,
  authHeader: string | null,
  featureKey: string,
): Promise<{ ok: true; userId: string; orgId: string; tier: string } | { ok: false; status: number; body: Record<string, unknown> }> {
  if (!authHeader) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return { ok: false, status: 401, body: { error: "Invalid auth token" } };
  }
  const user = userData.user;

  // Demo bypass
  if (user.user_metadata?.is_demo) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return {
      ok: true,
      userId: user.id,
      orgId: profile?.organization_id ?? "",
      tier: "demo",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return { ok: false, status: 403, body: { error: "No organization" } };
  }

  const { data: access, error } = await supabase.rpc("check_feature_access", {
    _org_id: profile.organization_id,
    _feature_key: featureKey,
  });

  if (error) {
    return { ok: false, status: 500, body: { error: "Feature check failed", detail: error.message } };
  }

  const result = access as FeatureAccessResult;
  if (!result?.allowed) {
    return {
      ok: false,
      status: 402,
      body: {
        error: "Payment Required",
        feature: featureKey,
        reason: result?.reason ?? "denied",
        message: result?.message ?? "Your subscription tier does not include this feature.",
        upgrade_url: "/pricing",
      },
    };
  }

  return {
    ok: true,
    userId: user.id,
    orgId: profile.organization_id,
    tier: result.tier ?? "unknown",
  };
}
