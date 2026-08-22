// tests/load/lib/guard.js
// Refuses to run unless target + prerequisites are sane.
import { fail } from "k6";

const env = (k) => __ENV[k] || "";

export function guard({ stage, vus }) {
  const target = env("LOAD_TARGET");
  const prereqConfirmed = env("LOAD_PREREQ_CONFIRMED") === "yes";
  const prereqWaived = env("LOAD_PREREQ_WAIVED") === "yes";
  const aiMode = env("LOAD_AI") || "mock";
  const confirmProd = env("LOAD_CONFIRM_PROD") === "I_UNDERSTAND";

  console.log("─".repeat(60));
  console.log(`Quantivis load test — stage=${stage} vus=${vus}`);
  console.log(`target=${target} ai=${aiMode} prereqConfirmed=${prereqConfirmed} prereqWaived=${prereqWaived}`);
  console.log("F-1 and F-2 have source-level fixes; the target deployment must still be confirmed");
  console.log("with LOAD_PREREQ_CONFIRMED=yes, or explicitly waived only for diagnostic runs.");
  console.log("─".repeat(60));

  if (!target) fail("LOAD_TARGET is required");
  if (target === "production" && !confirmProd) {
    fail("Refusing production: set LOAD_CONFIRM_PROD=I_UNDERSTAND");
  }
  if (!prereqConfirmed && !prereqWaived) {
    fail("Prerequisite deployment is not confirmed. Set LOAD_PREREQ_CONFIRMED=yes only after verifying the target SHA, or use LOAD_PREREQ_WAIVED=yes for an explicitly non-certifying diagnostic run.");
  }
  if (vus > 10 && target !== "staging" && target !== "production") {
    fail(`Stage ${stage} requires LOAD_TARGET=staging (got ${target})`);
  }
  if (aiMode === "live" && !env("LOAD_AI_BUDGET_USD")) {
    fail("LOAD_AI=live requires LOAD_AI_BUDGET_USD");
  }
}
