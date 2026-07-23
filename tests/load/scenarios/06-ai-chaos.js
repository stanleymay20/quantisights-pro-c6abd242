// tests/load/scenarios/06-ai-chaos.js
import { guard } from "../lib/guard.js";
import { thresholds } from "../lib/thresholds.js";
import { handleSummary as hs, aiFailures, recordResponse } from "../lib/observability.js";
import { signIn, authHeaders } from "../lib/auth.js";
import http from "k6/http";
import { SharedArray } from "k6/data";

__ENV.LOAD_STAGE = "ai-chaos";
const users = new SharedArray("users", () => JSON.parse(open(__ENV.LOAD_USERS_FILE || "../.users.json")));
const URL = __ENV.LOAD_SUPABASE_URL;
const MODES = ["timeout", "rate_limit", "malformed", "unavailable"];

export const options = {
  scenarios: { chaos: { executor: "constant-vus", vus: 10, duration: "3m" } },
  thresholds: thresholds("small"),
};

export function setup() { guard({ stage: "ai-chaos", vus: 10 }); }

export default function () {
  const u = users[__VU % users.length];
  const s = signIn(u.email, u.password);
  if (!s) return;
  const mode = MODES[__ITER % MODES.length];
  const res = http.post(`${URL}/functions/v1/mock-ai`, JSON.stringify({ kind: "recommendation" }), {
    headers: { ...authHeaders(s.token), "x-test-mock": "1", "x-mock-failure": mode },
    tags: { kind: "edge_fn", name: `chaos_${mode}` },
    timeout: "5s",
  });
  recordResponse(res, { workflow: "ai_chaos", mode });
  if (res.status >= 400) aiFailures.add(1);
}
export const handleSummary = hs;
