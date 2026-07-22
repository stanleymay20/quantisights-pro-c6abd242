// tests/load/scenarios/05-stress-1000.js
// HARD-CAPPED: 10 min, constant-arrival-rate (no unbounded ramp). Staging only.
import { guard } from "../lib/guard.js";
import { thresholds } from "../lib/thresholds.js";
import { handleSummary as hs } from "../lib/observability.js";
import { signIn } from "../lib/auth.js";
import { dashboardReads } from "../workflows/dashboard.js";
import { createDecision } from "../workflows/decisions.js";
import { SharedArray } from "k6/data";

__ENV.LOAD_STAGE = "stress-1000";
const users = new SharedArray("users", () => JSON.parse(open(__ENV.LOAD_USERS_FILE || "../.users.json")));

export const options = {
  scenarios: {
    stress: {
      executor: "constant-arrival-rate",
      rate: 250,
      timeUnit: "1s",
      duration: "10m",
      preAllocatedVUs: 1000,
      maxVUs: 1000,
    },
  },
  thresholds: thresholds("stress-1000"),
};

export function setup() {
  guard({ stage: "stress-1000", vus: 1000 });
  if (__ENV.LOAD_TARGET !== "staging") throw new Error("1000-VU stage requires LOAD_TARGET=staging");
}

export default function () {
  const u = users[__VU % users.length];
  const s = signIn(u.email, u.password);
  if (!s) return;
  const org = u.org === "b" ? __ENV.LOAD_ORG_B_ID : __ENV.LOAD_ORG_A_ID;
  if (Math.random() < 0.8) dashboardReads(s.token, org);
  else createDecision(s.token, org);
}
export const handleSummary = hs;
