// tests/load/scenarios/03-load-50.js
import { guard } from "../lib/guard.js";
import { thresholds } from "../lib/thresholds.js";
import { handleSummary as hs } from "../lib/observability.js";
import { signIn } from "../lib/auth.js";
import { dashboardReads } from "../workflows/dashboard.js";
import { fullWorkflow } from "../workflows/business-outcome.js";
import { tenantIsolation } from "../workflows/tenant-isolation.js";
import { SharedArray } from "k6/data";

__ENV.LOAD_STAGE = "load-50";
const users = new SharedArray("users", () => JSON.parse(open(__ENV.LOAD_USERS_FILE || "../.users.json")));

export const options = {
  scenarios: {
    load: { executor: "ramping-vus", startVUs: 0, stages: [
      { duration: "30s", target: 50 }, { duration: "3m", target: 50 }, { duration: "30s", target: 0 },
    ] },
    isolation: { executor: "per-vu-iterations", vus: 2, iterations: 1, startTime: "4m", exec: "isolationCheck" },
  },
  thresholds: thresholds("load-50"),
};

export function setup() { guard({ stage: "load-50", vus: 50 }); }

export default function () {
  const u = users[__VU % users.length];
  const s = signIn(u.email, u.password);
  if (!s) return;
  const org = u.org === "b" ? __ENV.LOAD_ORG_B_ID : __ENV.LOAD_ORG_A_ID;
  dashboardReads(s.token, org);
  fullWorkflow(s.token, org);
}

export function isolationCheck() {
  const a = users.find((x) => x.org === "a");
  const s = signIn(a.email, a.password);
  if (s) tenantIsolation(s.token, __ENV.LOAD_ORG_B_ID);
}

export const handleSummary = hs;
