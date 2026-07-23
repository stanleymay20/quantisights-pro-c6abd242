import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const weekStart = getWeekStart(new Date());
    const weekKey = weekStart.toISOString().split("T")[0]; // e.g. "2026-03-02"

    // Get all organizations with weekly digest enabled
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("organization_id, email_recipients, email_enabled")
      .eq("weekly_brief_enabled", true)
      .eq("email_enabled", true);

    if (!prefs || prefs.length === 0) {
      return new Response(JSON.stringify({ message: "No orgs with weekly digest enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const pref of prefs) {
      const orgId = pref.organization_id;
      const runStart = Date.now();

      // Recover stale locks (running > 15 min = presumed dead)
      await supabase
        .from("notification_log")
        .update({ status: "failed", error_message: "stale_lock_timeout" })
        .eq("organization_id", orgId)
        .eq("subject", "Weekly Calibration Digest")
        .eq("week_start", weekKey)
        .eq("status", "running")
        .lt("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

      // Attempt to acquire lock via unique constraint (organization_id, subject, week_start)
      const { data: lockRow, error: lockError } = await supabase
        .from("notification_log")
        .insert({
          organization_id: orgId,
          channel: "email",
          role_type: "all",
          subject: "Weekly Calibration Digest",
          recipients: [],
          metadata: { weekKey },
          status: "running",
          week_start: weekKey,
        })
        .select("id")
        .single();

      if (lockError) {
        if (lockError.code === "23505") {
          results.push({ orgId, status: "skipped_duplicate", weekKey });
        } else {
          console.error("Lock insert error:", lockError);
          results.push({ orgId, status: "failed", error: lockError.message, weekKey });
        }
        continue;
      }

      const lockId = lockRow.id;

      // 1. Calibration trend: latest 2 assessments
      const { data: assessments } = await supabase
        .from("calibration_assessments")
        .select("brier_score, calibration_profile, completed_at")
        .eq("organization_id", orgId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(2);

      let calibrationLine = "Calibration: No assessments yet";
      if (assessments && assessments.length >= 2) {
        const latest = Math.round((1 - Number(assessments[0].brier_score)) * 100);
        const prev = Math.round((1 - Number(assessments[1].brier_score)) * 100);
        const delta = latest - prev;
        calibrationLine = `Calibration: ${latest}% ${delta >= 0 ? `→ +${delta}%` : `→ ${delta}%`} this period`;
      } else if (assessments && assessments.length === 1) {
        const latest = Math.round((1 - Number(assessments[0].brier_score)) * 100);
        calibrationLine = `Calibration: ${latest}% (${assessments[0].calibration_profile})`;
      }

      // 2. Pending decisions >7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: stalePending } = await supabase
        .from("decision_ledger")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("decision_status", "pending")
        .lt("created_at", sevenDaysAgo);

      const pendingLine = stalePending && stalePending > 0
        ? `${stalePending} decision${stalePending > 1 ? "s" : ""} pending >7 days`
        : "No stale decisions";

      // 3. Latest bias detection
      const { data: biases } = await supabase
        .from("cognitive_bias_detections")
        .select("bias_name, confidence")
        .eq("organization_id", orgId)
        .is("dismissed_at", null)
        .order("detected_at", { ascending: false })
        .limit(1);

      let biasLine = "No active bias alerts";
      if (biases && biases.length > 0) {
        biasLine = `Bias detected: ${biases[0].bias_name} (${Math.round(Number(biases[0].confidence || 0) * 100)}% confidence)`;
      }

      const digest = `${calibrationLine}\n${pendingLine}\n${biasLine}`;

      // Determine recipients
      const recipients = pref.email_recipients;
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        await supabase
          .from("notification_log")
          .update({
            recipients: [],
            metadata: { digest, weekKey, reason: "no_recipients", duration_ms: Date.now() - runStart },
            status: "skipped",
          })
          .eq("id", lockId);

        results.push({ orgId, status: "skipped", reason: "no_recipients" });
        continue;
      }

      // Send via Resend if configured
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Quantivis <alerts@quantivis.io>";
      let emailStatus = "skipped";
      let errorMessage: string | null = null;

      if (resendKey) {
        try {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: recipients,
              subject: "Quantivis Weekly Digest",
              html: `<div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px">
                <h2 style="font-size:16px;color:#333;margin-bottom:16px">Weekly Calibration Digest</h2>
                <div style="background:#f8f9fa;border-radius:8px;padding:16px;font-size:14px;line-height:1.8">
                  <div>${calibrationLine}</div>
                  <div>${pendingLine}</div>
                  <div>${biasLine}</div>
                </div>
                <p style="font-size:12px;color:#888;margin-top:16px">— Quantivis Intelligence</p>
              </div>`,
            }),
          });

          if (emailRes.ok) {
            emailStatus = "sent";
          } else {
            const errBody = await emailRes.text();
            emailStatus = "failed";
            errorMessage = `HTTP ${emailRes.status}: ${errBody.substring(0, 200)}`;
            console.error("Email send failed:", errorMessage);
          }
        } catch (emailErr) {
          emailStatus = "failed";
          errorMessage = emailErr instanceof Error ? emailErr.message : String(emailErr);
          console.error("Email send error:", emailErr);
        }
      } else {
        emailStatus = "skipped";
        errorMessage = "RESEND_API_KEY not configured";
      }

      // Update lock row by id (safer than triple match)
      await supabase
        .from("notification_log")
        .update({
          recipients,
          metadata: {
            digest,
            calibrationLine,
            pendingLine,
            biasLine,
            weekKey,
            duration_ms: Date.now() - runStart,
            ...(errorMessage ? { error: errorMessage } : {}),
          },
          status: emailStatus,
          ...(errorMessage ? { error_message: errorMessage } : {}),
        })
        .eq("id", lockId);

      results.push({ orgId, status: emailStatus, digest });
    }

    return new Response(JSON.stringify({ success: true, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("weekly-calibration-digest error:", err);
    return new Response(JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
