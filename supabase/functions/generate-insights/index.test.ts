import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-insights`;

Deno.test("generate-insights: handles OPTIONS preflight", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://quantisights-pro.lovable.app",
      "Access-Control-Request-Method": "POST",
    },
  });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("generate-insights: rejects unauthenticated requests", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  // Should return 401 or error for missing auth
  const isAuthError = res.status === 401 || body?.error?.includes("Unauthorized") || body?.error?.includes("auth");
  assertEquals(isAuthError || res.status >= 400, true);
});

Deno.test("generate-insights: rejects invalid payload with auth", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ invalid: true }),
  });
  const body = await res.text();
  assertExists(body);
  // Should return error (401 unauthorized or 400 bad request)
  assertEquals(res.status >= 400, true);
});
