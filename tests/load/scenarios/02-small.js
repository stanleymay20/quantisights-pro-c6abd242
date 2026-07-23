// tests/load/scenarios/02-small.js
import { guard } from "../lib/guard.js";
import { thresholds } from "../lib/thresholds.js";
import { handleSummary as hs } from "../lib/observability.js";
import { signIn } from "../lib/auth.js";
import { dashboardReads } from "../workflows/dashboard.js";
import { fullWorkflow } from "../workflows/business-outcome.js";
import { SharedArray } from "k6/data";

__ENV.LOAD_STAGE = "small";
const users = new SharedArray("users", () => JSON.parse(open(__ENV.LOAD_USERS_FILE || "../.users.json")));

export const options = {
  scenarios: { small: { executor: "constant-vus", vus: 10, duration: "2m" } },
  thresholds: thresholds("small"),
};

export function setup() { guard({ stage: "small", vus: 10 }); }

export default function () {
  const u = users[__VU % users.length];
  const s = signIn(u.email, u.password);
  if (!s) return;
  const org = u.org === "b" ? __ENV.LOAD_ORG_B_ID : __ENV.LOAD_ORG_A_ID;
  dashboardReads(s.token, org);
  fullWorkflow(s.token, org);
}
export const handleSummary = hs;
