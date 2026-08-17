import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const DELETE_WINDOW_SECONDS = 60 * 60;
const DELETE_MAX_ATTEMPTS = 3;

type MutationResult = {
  error: { message?: string } | null;
};

async function assertMutation(
  operation: string,
  request: PromiseLike<MutationResult>,
): Promise<void> {
  const { error } = await request;
  if (error) {
    throw new Error(`${operation}: ${error.message ?? "database mutation failed"}`);
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("delete-account missing required Supabase environment configuration");
      return jsonResponse({ error: "Account deletion unavailable" }, 503, corsHeaders);
    }

    // Authenticate before consuming the destructive-action rate-limit budget.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.slice("Bearer ".length);
    const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }

    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Account deletion is security-sensitive, so use the distributed database
    // rate-limit store instead of the process-local Edge Function limiter.
    // Fail closed if the limiter itself is unavailable.
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { data: deleteAttempts, error: rateLimitError } = await supabase.rpc(
      "increment_rate_limit",
      {
        _key: `account-delete:${userId}:${clientIp}`,
        _window_seconds: DELETE_WINDOW_SECONDS,
      },
    );
    if (rateLimitError || typeof deleteAttempts !== "number") {
      console.error("delete-account distributed rate limiter failed", rateLimitError);
      return jsonResponse({ error: "Account deletion unavailable" }, 503, corsHeaders);
    }
    if (deleteAttempts > DELETE_MAX_ATTEMPTS) {
      return jsonResponse(
        { error: "Too many account deletion attempts" },
        429,
        corsHeaders,
        { "Retry-After": String(DELETE_WINDOW_SECONDS) },
      );
    }

    // Resolve the user's organization. Reads are checked just as strictly as
    // writes because an incomplete identity lookup must never trigger deletion.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .single();
    if (profileError || !profile) {
      throw new Error(`Read account profile: ${profileError?.message ?? "profile missing"}`);
    }

    const orgId = profile.organization_id;
    let deleteOrg = false;
    if (orgId) {
      const { data: members, error: membersError } = await supabase
        .from("organization_members")
        .select("id, user_id")
        .eq("organization_id", orgId);
      if (membersError) {
        throw new Error(`Read organization members: ${membersError.message}`);
      }

      // Delete organization-owned data only when this user is its sole member.
      // Otherwise remove only this user's membership and identity data.
      deleteOrg = members?.length === 1 && members[0].user_id === userId;
    }

    // Every mandatory database mutation is checked. The auth identity is only
    // removed after all required database cleanup has succeeded, preventing a
    // partially failed cleanup from orphaning an undeletable account.
    if (orgId && deleteOrg) {
      const organizationTables = [
        "advisory_instances",
        "copilot_messages",
        "copilot_sessions",
        "notification_log",
        "notification_preferences",
        "executive_alerts",
        "executive_briefs",
        "executive_conflicts",
        "executive_convergence_index",
        "executive_modes",
        "executive_risk_index",
        "orchestration_runs",
        "intelligence_audit_trail",
        "scenario_results",
        "scenario_assumptions",
        "kpi_values",
        "kpi_targets",
        "data_quality_checks",
        "data_sync_jobs",
        "dataset_versions",
        "insights",
        "copilot_usage",
        "convergence_usage",
        "simulation_usage",
        "subscriptions",
        "team_invitations",
        "reports",
      ] as const;

      for (const table of organizationTables) {
        await assertMutation(
          `Delete organization data from ${table}`,
          supabase.from(table).delete().eq("organization_id", orgId),
        );
      }

      for (const table of ["metrics", "scenarios", "kpis", "datasets", "data_sources"] as const) {
        await assertMutation(
          `Delete organization data from ${table}`,
          supabase.from(table).delete().eq("organization_id", orgId),
        );
      }

      await assertMutation(
        "Anonymize organization audit log",
        supabase
          .from("audit_log")
          .update({
            actor_id: null,
            ip_address: null,
            payload: { redacted: true, reason: "account_deletion" },
          })
          .eq("organization_id", orgId),
      );

      await assertMutation(
        "Delete organization memberships",
        supabase.from("organization_members").delete().eq("organization_id", orgId),
      );
      await assertMutation(
        "Delete organization",
        supabase.from("organizations").delete().eq("id", orgId),
      );
    } else if (orgId) {
      await assertMutation(
        "Delete user organization membership",
        supabase
          .from("organization_members")
          .delete()
          .eq("user_id", userId)
          .eq("organization_id", orgId),
      );
    }

    await assertMutation(
      "Delete user profile",
      supabase.from("profiles").delete().eq("user_id", userId),
    );
    await assertMutation(
      "Delete user roles",
      supabase.from("user_roles").delete().eq("user_id", userId),
    );

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Delete auth user: ${deleteError.message}`);
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("delete-account failed:", message);
    return jsonResponse({ error: "Failed to delete account" }, 500, corsHeaders);
  }
});
