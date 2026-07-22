import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/webhook-ingest`;
const API_KEY = "427ee35a3ccee13d33ef87467f7fb468f8370ee977d5e46e747f97fe116606ed";

let requestCounter = 0;
function uniqueRequestId(prefix: string): string {
  return `test-${prefix}-${Date.now()}-${++requestCounter}`;
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "x-api-key": API_KEY,
      "x-request-id": uniqueRequestId("default"),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

Deno.test("valid single-record payload → 200, total_succeeded=1", async () => {
  const rid = uniqueRequestId("single");
  const { status, json } = await post(
    { records: [{ indicator: "TestMetric", country: "DE", value: 42, date: "2025-06-01" }] },
    { "x-request-id": rid },
  );
  assertEquals(status, 200);
  assert(json !== null);
  assertEquals(json!.success, true);
  assertEquals(json!.total_received, 1);
  assertEquals(json!.total_succeeded, 1);
  assertEquals(json!.total_failed, 0);
});

Deno.test("valid multi-record batch → 200, all succeed", async () => {
  const rid = uniqueRequestId("batch");
  const { status, json } = await post(
    {
      records: [
        { indicator: "Revenue", country: "US", value: 100000, date: "2025-01-15" },
        { indicator: "Costs", country: "UK", value: 50000, date: "2025-02-15" },
        { indicator: "Margin", country: "FR", value: 0.35, date: "2025-03-15" },
      ],
    },
    { "x-request-id": rid },
  );
  assertEquals(status, 200);
  assertEquals(json!.total_received, 3);
  assertEquals(json!.total_succeeded, 3);
  assertEquals(json!.total_failed, 0);
});

Deno.test("mixed-validity batch → 200, partial success with errors", async () => {
  const rid = uniqueRequestId("mixed");
  const { status, json } = await post(
    {
      records: [
        { indicator: "Good", country: "DE", value: 10, date: "2025-05-01" },
        { indicator: "BadValue", country: "XX", value: "not-a-number", date: "2025-05-01" },
        { indicator: "OldDate", country: "JP", value: 5, date: "2010-01-01" },
        { indicator: "AlsoGood", country: "US", value: 20, date: "2025-06-01" },
      ],
    },
    { "x-request-id": rid },
  );
  assertEquals(status, 200);
  assertEquals(json!.total_received, 4);
  assertEquals(json!.total_succeeded, 2);
  assertEquals(json!.total_failed, 2);
  assert(Array.isArray(json!.errors));
  assertEquals((json!.errors as unknown[]).length, 2);
});

Deno.test("malformed top-level payload → 400", async () => {
  const rid = uniqueRequestId("malformed");
  const { status, json } = await post("this is not json at all {{{{", { "x-request-id": rid });
  // Body is not valid JSON → the fetch will send the stringified version of the string
  // Actually let's send raw invalid JSON
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "x-api-key": API_KEY,
      "x-request-id": uniqueRequestId("malformed2"),
    },
    body: "{{invalid json}}",
  });
  const text = await res.text();
  assertEquals(res.status, 400);
  assert(text.includes("Invalid JSON body"));
});

Deno.test("missing required fields → validation errors with field names", async () => {
  const rid = uniqueRequestId("missing-fields");
  const { status, json } = await post(
    { records: [{ indicator: "NoDate", country: "US", value: 10 }] },
    { "x-request-id": rid },
  );
  // Missing date should fail validation
  assertEquals(status, 400);
  assert(json!.error !== undefined || json!.errors !== undefined);
});

Deno.test("duplicate/idempotent replay → 200 with idempotent=true", async () => {
  const rid = uniqueRequestId("idemp");
  // First request
  const first = await post(
    { records: [{ indicator: "IdempTest", country: "DE", value: 99, date: "2025-07-01" }] },
    { "x-request-id": rid },
  );
  assertEquals(first.status, 200);
  assertEquals(first.json!.success, true);

  // Replay same request_id
  const replay = await post(
    { records: [{ indicator: "IdempTest", country: "DE", value: 99, date: "2025-07-01" }] },
    { "x-request-id": rid },
  );
  assertEquals(replay.status, 200);
  assertEquals(replay.json!.idempotent, true);
});

Deno.test("auth failure → 403 with structured error", async () => {
  const rid = uniqueRequestId("authfail");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "x-api-key": "completely-wrong-key",
      "x-request-id": rid,
    },
    body: JSON.stringify({ records: [{ indicator: "X", country: "X", value: 1, date: "2025-01-01" }] }),
  });
  const text = await res.text();
  assertEquals(res.status, 403);
  const json = JSON.parse(text);
  assertEquals(json.error, "Invalid API key");
  assertEquals(json.stage, "auth");
});

Deno.test("missing x-api-key → 401", async () => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "x-request-id": uniqueRequestId("nokey"),
    },
    body: JSON.stringify({ records: [{ indicator: "X", country: "X", value: 1, date: "2025-01-01" }] }),
  });
  const text = await res.text();
  assertEquals(res.status, 401);
  assert(text.includes("x-api-key header required"));
});

Deno.test("error messages never contain [object Object]", async () => {
  const rid = uniqueRequestId("serialization");
  const { json } = await post(
    {
      records: [
        { indicator: "Bad", country: "XX", value: {}, date: "2025-01-01" },
      ],
    },
    { "x-request-id": rid },
  );
  const fullText = JSON.stringify(json);
  assertEquals(fullText.includes("[object Object]"), false);
});
