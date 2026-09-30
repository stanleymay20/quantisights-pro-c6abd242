import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const script = resolve(root, "scripts/netlify-release-gate.mjs");
const sha = "1234567890abcdef1234567890abcdef12345678";
const otherSha = "abcdef1234567890abcdef1234567890abcdef12";

const runGate = (env: Record<string, string>) =>
  spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

describe("Netlify production release gate", () => {
  it("fails closed when production has no GA-certified SHA", () => {
    const result = runGate({ CONTEXT: "production", BRANCH: "main", COMMIT_REF: sha, QUANTIVIS_GA_CERTIFIED_SHA: "" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("production build skipped");
  });

  it("fails closed when production commit does not equal the certified SHA", () => {
    const result = runGate({ CONTEXT: "production", BRANCH: "main", COMMIT_REF: sha, QUANTIVIS_GA_CERTIFIED_SHA: otherSha });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("is not the certified release");
  });

  it("allows only the exact certified production SHA", () => {
    const result = runGate({ CONTEXT: "production", BRANCH: "main", COMMIT_REF: sha, QUANTIVIS_GA_CERTIFIED_SHA: sha });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("production build allowed");
  });

  it("does not block non-production deploy previews", () => {
    const result = runGate({ CONTEXT: "deploy-preview", BRANCH: "feature/test", COMMIT_REF: sha, QUANTIVIS_GA_CERTIFIED_SHA: "" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("non-production context");
  });
});
