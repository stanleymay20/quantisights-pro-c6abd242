// tests/load/lib/guard.js
// Refuses to run unless target + prerequisites are sane.
import { fail } from "k6";

const env = (k) => __ENV[k] || "";

export function guard({ stage, vus }) {
  const target = env("LOAD_TARGET");
  const prereqWaived = env("LOAD_PREREQ_WAIVED") === "yes";
  const aiMode = env("LOAD_AI") || "mock";
  const confirmProd = env("LOAD_CONFIRM_PROD") === "I_UNDERSTAND";

  console.log("─".repeat(60));
  console.log(`Quantivis load test — stage=${stage} vus=${vus}`);
  console.log(`target=${target} ai=${aiMode} prereqWaived=${prereqWaived}`);
  console.log("Reminder: F-1 (/auth/callback double-exchange) and F-2 (stale chunk)");
  console.log("must be fixed or LOAD_PREREQ_WAIVED=yes set.");
  console.log("─".repeat(60));

  if (!target) fail("LOAD_TARGET is required");
  if (target === "production" && !confirmProd) {
    fail("Refusing production: set LOAD_CONFIRM_PROD=I_UNDERSTAND");
  }
  if (!prereqWaived) {
    fail("Prerequisite gate not waived. See tests/PREREQUISITES.md.");
  }
  if (vus > 10 && target !== "staging" && target !== "production") {
    fail(`Stage ${stage} requires LOAD_TARGET=staging (got ${target})`);
  }
  if (aiMode === "live" && !env("LOAD_AI_BUDGET_USD")) {
    fail("LOAD_AI=live requires LOAD_AI_BUDGET_USD");
  }
}
