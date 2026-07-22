import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/stripe-webhook`;

Deno.test("stripe-webhook: rejects missing signature", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ type: "test" }),
  });
  const body = await res.text();
  // Should fail with 400 because no stripe-signature header
  assertEquals(res.status, 400);
  assertExists(body);
});

Deno.test("stripe-webhook: handles OPTIONS preflight", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://quantisights-pro.lovable.app",
      "Access-Control-Request-Method": "POST",
    },
  });
  await res.text(); // consume body
  assertEquals(res.status, 200);
  assertExists(res.headers.get("access-control-allow-origin"));
});

Deno.test("stripe-webhook: rejects invalid signature", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=1234567890,v1=invalid_signature_value",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      id: "evt_test_123",
      type: "checkout.session.completed",
      data: { object: {} },
    }),
  });
  const body = await res.text();
  assertEquals(res.status, 400);
  assertExists(body);
});
