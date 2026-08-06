import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BACKUP_BASELINE, BACKUP_SLA_TARGET } from "@/lib/reliability-claims";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("residency and backup/DR source of truth", () => {
  it("does not hardcode a specific hosting region on marketing or legal surfaces", () => {
    const surfaces = [
      "src/pages/Index.tsx",
      "src/pages/SecurityQuestionnaire.tsx",
      "src/pages/DataResidency.tsx",
    ].map(read).join("\n");
    expect(surfaces).not.toContain("Frankfurt region only");
    expect(surfaces).not.toContain("AWS EU-West-1, Ireland");
  });

  it("wires the homepage, questionnaire, and SLA to the shared reliability-claims module", () => {
    expect(read("src/pages/Index.tsx")).toContain("@/lib/reliability-claims");
    expect(read("src/pages/SecurityQuestionnaire.tsx")).toContain("@/lib/reliability-claims");
    expect(read("src/pages/SLA.tsx")).toContain("@/lib/reliability-claims");
    expect(read("src/pages/DataResidency.tsx")).toContain("@/lib/reliability-claims");
  });

  it("keeps the enterprise SLA target strictly tighter than the default baseline", () => {
    expect(BACKUP_SLA_TARGET.targetRPOHours).toBeLessThan(BACKUP_BASELINE.targetRPOHours);
    expect(BACKUP_SLA_TARGET.retentionDays).toBeGreaterThan(BACKUP_BASELINE.retentionDays);
    expect(BACKUP_BASELINE.commitment).toBe("best effort");
    expect(BACKUP_SLA_TARGET.commitment).toBe("contractual");
  });

  it("does not present the baseline backup posture as an unconditional contractual guarantee", () => {
    const questionnaire = read("src/pages/SecurityQuestionnaire.tsx");
    expect(questionnaire).not.toMatch(/retained for 30 days/i);
    expect(questionnaire).not.toMatch(/RPO[:\s]*1 hour/i);
  });

  it("qualifies the SLA backup target as contract-dependent rather than a baseline default", () => {
    const sla = read("src/pages/SLA.tsx");
    expect(sla).toContain("Order Form");
    expect(sla).toContain("/security-questionnaire");
  });
});
