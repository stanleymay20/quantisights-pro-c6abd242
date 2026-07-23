import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/evaluate-outcomes`;

Deno.test("evaluate-outcomes: handles OPTIONS preflight", async () => {
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

Deno.test("evaluate-outcomes: cron endpoint rejects non-service-role callers", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action: "evaluate_all", cron: true }),
  });
  const body = await res.json();
  assertEquals(res.status, 403);
  assertEquals(body.error, "Forbidden: cron endpoint requires service-role");
});

Deno.test("evaluate-outcomes: rejects missing organization_id", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action: "evaluate" }),
  });
  const body = await res.text();
  assertExists(body);
  assertEquals(res.status >= 400, true);
});
