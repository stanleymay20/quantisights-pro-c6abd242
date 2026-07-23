import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Governance Command View 'No assessment yet' vs. Settings > Security 'fully populated' (audit)", () => {
  // GovernanceCommandView's maturity score reads governance_maturity_assessments,
  // a manual self-assessment table that's empty for orgs that haven't run one.
  // SecurityPosture (Settings > Security) is a mostly-hardcoded, always-on
  // technical control checklist that never shows an empty state. An
  // executive seeing "No assessment yet" on one page and a populated score
  // on the other reads it as a contradiction, since both pages use
  // "governance"/"security" language without distinguishing the two
  // concepts. Neither page's underlying data was wrong -- this adds
  // cross-linking copy so the distinction is explicit instead of implied.

  it("GovernanceCommandView's empty state explains this is a distinct metric from Security Posture", () => {
    const source = read("src/pages/GovernanceCommandView.tsx");
    expect(source).toMatch(/No assessment yet.*Security Posture/s);
  });

  it("SecurityPosture links to Governance Command View and distinguishes the two metrics", () => {
    const source = read("src/components/security/SecurityPosture.tsx");
    expect(source).toContain('to="/governance"');
    expect(source).toMatch(/not organizational governance maturity/);
  });
});
