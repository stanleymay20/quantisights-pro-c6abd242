import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Governance Command View vs Settings retention-policy contradiction", () => {
  // Root cause: RetentionPolicySettings.tsx initializes React state with a
  // hardcoded DEFAULT_POLICIES array (the exact 6 categories/day-values an
  // audit found "configured") and only overwrites it with real
  // data_retention_policies rows when savedPolicies.length > 0. An org that
  // has never clicked Save shows what looks like a fully configured
  // retention policy in Settings, while Governance Command View correctly
  // and honestly queries the same table and reports 0 rows. Both signals
  // were individually correct; Settings just never disclosed that its
  // display was unsaved defaults, not persisted configuration.
  it("shows an explicit unsaved-defaults warning when no policies have actually been saved", () => {
    const source = read("src/components/settings/RetentionPolicySettings.tsx");
    expect(source).toMatch(/!savedPolicies \|\| savedPolicies\.length === 0/);
    expect(source).toContain("unsaved defaults");
  });
});
