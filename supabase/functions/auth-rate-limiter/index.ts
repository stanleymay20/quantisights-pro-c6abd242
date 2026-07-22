// @ts-nocheck
/**
 * auth-rate-limiter
 *
 * Brute-force protection for the Supabase auth endpoints.
 * Deploy as a Supabase Edge Function and call it from the Login.tsx
 * BEFORE delegating to supabase.auth.signInWithPassword().
 *
 * Strategy:
 *   - Sliding window counter per IP address (1 minute window)
 *   - Sliding window counter per email address (15 minute window)
 *   - Supabase KV store (via a rate_limits table) for distributed tracking
 *
 * Limits (enterprise standard):
 *   - 5 failed attempts per IP per minute → 60s lockout
 *   - 10 failed attempts per email per 15 minutes → 15min lockout
 *
 * Returns:
 *   { allowed: true }  — proceed with login
 *   { allowed: false, retryAfter: N, reason: "ip"|"email" }  — block
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://www.quantivis.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const IP_WINDOW_SECONDS = 60;
const IP_MAX_ATTEMPTS = 5;
const EMAIL_WINDOW_SECONDS = 900; // 15 minutes
const EMAIL_MAX_ATTEMPTS = 10;

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { email, action = "check" } = await req.json().catch(() => ({}));

    // Get caller IP from headers
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const now = Math.floor(Date.now() / 1000);

    if (action === "record_failure") {
      // Record a failed attempt. The increment_rate_limit RPC is the single
      // source of truth for the sliding window — it inserts on first failure
      // and atomically increments-or-resets on conflict. A prior version of
      // this handler also ran a plain upsert before the RPC call, which
      // unconditionally reset attempts=1/window_start=now on every call and
      // silently defeated the email-based lockout (it could never accumulate
      // past 1 attempt). Do not reintroduce that upsert.
      if (email) {
        await svc.rpc("increment_rate_limit", {
          _key: `email:${email.toLowerCase()}`,
          _window_seconds: EMAIL_WINDOW_SECONDS,
        }).then(() => {});
      }
      await svc.rpc("increment_rate_limit", {
        _key: `ip:${ip}`,
        _window_seconds: IP_WINDOW_SECONDS,
      }).then(() => {});
      return j({ recorded: true });
    }

    if (action === "record_success") {
      // Reset counters on successful login
      if (email) {
        await svc.from("auth_rate_limits")
          .delete()
          .eq("key", `email:${email.toLowerCase()}`).then(() => {});
      }
      await svc.from("auth_rate_limits").delete().eq("key", `ip:${ip}`).then(() => {});
      return j({ recorded: true });
    }

    // Default: check if this request is allowed
    const [ipRow, emailRow] = await Promise.all([
      svc.from("auth_rate_limits").select("attempts,window_start,window_seconds").eq("key", `ip:${ip}`).maybeSingle(),
      email
        ? svc.from("auth_rate_limits").select("attempts,window_start,window_seconds").eq("key", `email:${email.toLowerCase()}`).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Check IP limit
    if (ipRow.data) {
      const { attempts, window_start, window_seconds } = ipRow.data;
      const windowAge = now - window_start;
      if (windowAge < window_seconds && attempts >= IP_MAX_ATTEMPTS) {
        const retryAfter = window_seconds - windowAge;
        return j({ allowed: false, reason: "ip", retryAfter, message: `Too many attempts from this network. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` }, 429);
      }
    }

    // Check email limit
    if (emailRow.data) {
      const { attempts, window_start, window_seconds } = emailRow.data;
      const windowAge = now - window_start;
      if (windowAge < window_seconds && attempts >= EMAIL_MAX_ATTEMPTS) {
        const retryAfter = window_seconds - windowAge;
        return j({ allowed: false, reason: "email", retryAfter, message: `Too many failed attempts for this account. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` }, 429);
      }
    }

    return j({ allowed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("auth-rate-limiter error:", msg);
    // Fail open on errors to avoid locking out legitimate users
    return j({ allowed: true, warning: "Rate limiter error — proceeding" });
  }
});
