import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { cronGuard } from "../_shared/cron-guard.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";
import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * auth.admin.listUsers() defaults to page 1 / 50 users per page. Called
 * without pagination, any org whose owner/admin/executive isn't among the
 * platform's first 50 signups silently never gets a brief -- the filter
 * on line ~92 (original) just never matches. Page through every user once,
 * up front, instead of once per org inside the loop.
 */
async function listAllUsers(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const emailByUserId = new Map<string, string>();
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) emailByUserId.set(u.id, u.email);
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return emailByUserId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  // Advisory lock — prevent overlapping cron runs
  const guard = await cronGuard("morning-brief");
  if (!guard.acquired) return guard.earlyResponse(corsHeaders);


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "alerts@quantivis.io";
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all organizations
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name");

    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch every user once, up front, instead of once per org.
    const emailByUserId = await listAllUsers(supabase);

    let totalSent = 0;
    let orgsProcessed = 0;
    const startedAt = Date.now();
    const deadline = makeDeadline(startedAt);
    // Deterministic daily rotation: if the org list ever grows too large to
    // fully process within one invocation's time budget, a fixed processing
    // order would let the same prefix of orgs win every single day while
    // the tail never gets a brief. Rotating the starting point once per
    // day spreads that shortfall across the whole org list over time.
    const rotatedOrgs = rotateForFairness(orgs, startedAt, DAY_MS);

    for (const org of rotatedOrgs) {
      if (deadline.expired()) break;
      orgsProcessed++;
      // Get pending decisions count
      const { count: pendingCount } = await supabase
        .from("decision_ledger")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("execution_status", "not_started");

      // Get critical advisories
      const { data: criticalAdvisories } = await supabase
        .from("advisory_instances")
        .select("id, title, priority")
        .eq("organization_id", org.id)
        .in("status", ["open"])
        .in("priority", ["critical", "high"])
        .limit(5);

      // Get critical insights (unread)
      const { count: signalCount } = await supabase
        .from("insights")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("is_read", false)
        .eq("severity", "high");

      // Get latest calibration
      const { data: calModels } = await supabase
        .from("calibration_models")
        .select("overall_calibration_score, model_version")
        .eq("organization_id", org.id)
        .order("computed_at", { ascending: false })
        .limit(1);

      const calibration = calModels?.[0];
      const decisionsAwaiting = pendingCount ?? 0;
      const criticalSignals = signalCount ?? 0;
      const advisoryCount = criticalAdvisories?.length ?? 0;

      // Skip if nothing to report
      if (decisionsAwaiting === 0 && criticalSignals === 0 && advisoryCount === 0) {
        continue;
      }

      // Get org members with email
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org.id)
        .in("role", ["owner", "admin", "executive"]);

      if (!members || members.length === 0) continue;

      // Resolve member emails from the pre-fetched map instead of an
      // admin API call per org.
      const userIds = members.map((m) => m.user_id);
      const orgUsers = userIds
        .map((id) => ({ id, email: emailByUserId.get(id) }))
        .filter((u): u is { id: string; email: string } => !!u.email);

      if (orgUsers.length === 0) continue;

      // Build urgency indicator
      const urgencyEmoji = criticalSignals > 0 ? "🔴" : advisoryCount > 0 ? "🟡" : "🟢";

      // Build email subject
      const subjectParts: string[] = [];
      if (decisionsAwaiting > 0) subjectParts.push(`${decisionsAwaiting} decisions awaiting`);
      if (criticalSignals > 0) subjectParts.push(`${criticalSignals} critical signal${criticalSignals > 1 ? "s" : ""}`);
      const subject = `${urgencyEmoji} Morning Brief: ${subjectParts.join(" · ") || "All clear"}`;

      // Build advisory list HTML
      const advisoryListHtml = criticalAdvisories?.map((a) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#1a1a1a;">
            <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;margin-right:8px;${
              a.priority === "critical" ? "background:#fee2e2;color:#dc2626;" : "background:#fef3c7;color:#d97706;"
            }">${a.priority}</span>
            ${a.title}
          </td>
        </tr>`
      ).join("") ?? "";

      // Build HTML email
      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 20px;">
  <tr><td>
    <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:16px;">Quantivis · Morning Brief</div>
    
    <!-- KPI Strip -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:16px;background:#f8f9fa;border-radius:12px;border:1px solid #e5e7eb;" width="33%">
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Decisions</div>
          <div style="font-size:28px;font-weight:700;color:#1a1a1a;margin-top:4px;">${decisionsAwaiting}</div>
          <div style="font-size:11px;color:#888;">awaiting you</div>
        </td>
        <td width="8"></td>
        <td style="padding:16px;background:#f8f9fa;border-radius:12px;border:1px solid #e5e7eb;" width="33%">
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Signals</div>
          <div style="font-size:28px;font-weight:700;color:${criticalSignals > 0 ? '#dc2626' : '#1a1a1a'};margin-top:4px;">${criticalSignals}</div>
          <div style="font-size:11px;color:#888;">critical</div>
        </td>
        <td width="8"></td>
        <td style="padding:16px;background:#f8f9fa;border-radius:12px;border:1px solid #e5e7eb;" width="33%">
          <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Calibration</div>
          <div style="font-size:28px;font-weight:700;color:#1a1a1a;margin-top:4px;">${calibration?.overall_calibration_score ?? "—"}%</div>
          <div style="font-size:11px;color:#888;">v${calibration?.model_version ?? "?"}</div>
        </td>
      </tr>
    </table>

    ${advisoryListHtml ? `
    <!-- Advisories -->
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Open Advisories</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
        ${advisoryListHtml}
      </table>
    </div>
    ` : ""}

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0;">
      <a href="https://quantisights-pro.lovable.app/dashboard" 
         style="display:inline-block;padding:12px 32px;background:#1a1a1a;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
        Open Decision Queue →
      </a>
    </div>

    <div style="font-size:11px;color:#aaa;text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #f0f0f0;">
      Quantivis Executive Intelligence · Sent automatically at 06:00 UTC
    </div>
  </td></tr>
</table>
</body>
</html>`;

      // Send to each user
      if (resendKey) {
        for (const user of orgUsers) {
          if (!user.email) continue;
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `Quantivis Intelligence <${fromEmail}>`,
                to: [user.email],
                subject,
                html,
              }),
            });
            totalSent++;
          } catch (e) {
            console.error(`Failed to send to ${user.email}:`, e);
          }
        }
      }
    }

    const truncated = orgsProcessed < rotatedOrgs.length;
    await guard.succeed({ sent: totalSent, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated });
    return new Response(
      JSON.stringify({ success: true, sent: totalSent, orgs_processed: orgsProcessed, orgs_total: rotatedOrgs.length, truncated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Morning brief error:", error);
    await guard.fail(error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
