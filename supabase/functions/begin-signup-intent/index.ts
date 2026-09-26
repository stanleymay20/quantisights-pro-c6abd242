import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";

const RATE_LIMIT_WINDOW_SECONDS = 600;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

function jsonResponse(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function callerIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405, { "Allow": "POST, OPTIONS" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("begin-signup-intent missing required Supabase runtime configuration");
      return jsonResponse(req, { error: "Signup is temporarily unavailable" }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // This endpoint is intentionally pre-auth. Enforce a server-side network
    // throttle before issuing any database capability. Store only a SHA-256
    // digest of the caller IP in the shared service-role-only rate-limit table.
    const ipHash = await sha256Hex(callerIp(req));
    const { data: attempts, error: rateLimitError } = await admin.rpc("increment_rate_limit", {
      _key: `signup-intent:ip:${ipHash}`,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });

    if (rateLimitError || typeof attempts !== "number") {
      console.error("begin-signup-intent rate limiter failed:", rateLimitError?.message ?? "invalid counter result");
      return jsonResponse(req, { error: "Signup is temporarily unavailable" }, 503);
    }

    if (attempts > RATE_LIMIT_MAX_ATTEMPTS) {
      return jsonResponse(
        req,
        { error: "Too many signup attempts from this network. Please try again later." },
        429,
        { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) },
      );
    }

    const { data, error } = await admin.rpc("issue_signup_intent_internal");
    if (error) {
      console.error("begin-signup-intent issuance failed:", error.message);
      return jsonResponse(req, { error: "Signup is temporarily unavailable" }, 503);
    }
    if (typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) {
      console.error("begin-signup-intent returned an invalid token");
      return jsonResponse(req, { error: "Signup is temporarily unavailable" }, 503);
    }

    return jsonResponse(req, { token: data });
  } catch (error) {
    console.error("begin-signup-intent unexpected error:", error instanceof Error ? error.message : String(error));
    return jsonResponse(req, { error: "Signup is temporarily unavailable" }, 503);
  }
});
