// tests/load/scenarios/01-smoke.js
import { guard } from "../lib/guard.js";
import { thresholds } from "../lib/thresholds.js";
import { handleSummary as hs } from "../lib/observability.js";
import { signIn } from "../lib/auth.js";
import { dashboardReads } from "../workflows/dashboard.js";
import { fullWorkflow } from "../workflows/business-outcome.js";
import { SharedArray } from "k6/data";

__ENV.LOAD_STAGE = "smoke";

const users = new SharedArray("users", () => JSON.parse(open(__ENV.LOAD_USERS_FILE || "../.users.json")));

export const options = {
  scenarios: { smoke: { executor: "per-vu-iterations", vus: 1, iterations: 5, maxDuration: "2m" } },
  thresholds: thresholds("smoke"),
};

export function setup() { guard({ stage: "smoke", vus: 1 }); }

export default function () {
  const u = users.find((x) => x.org === "a");
  const s = signIn(u.email, u.password);
  if (!s) return;
  dashboardReads(s.token, __ENV.LOAD_ORG_A_ID);
  fullWorkflow(s.token, __ENV.LOAD_ORG_A_ID);
}

export const handleSummary = hs;
