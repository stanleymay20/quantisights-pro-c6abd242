import { describe, expect, it } from "vitest";
import { computeDiagnostics, inferSchema, parseCSVText } from "./data-upload-utils";
import { buildIngestionIntelligence } from "./ingestion-intelligence";
import { buildImportRemediationPlan } from "./ingestion-remediation";

function buildPlan(csv: string) {
  const { headers, rows } = parseCSVText(csv);
  const schema = inferSchema(headers, rows);
  const mapping = Object.fromEntries(schema.map((column) => [column.colIdx, column.inferredType]));
  const diagnostics = computeDiagnostics(rows, headers, mapping, schema);
  const intelligence = buildIngestionIntelligence({ headers, rows, schema, diagnostics });
  const remediation = buildImportRemediationPlan({ schema, diagnostics, intelligence });
  return { headers, rows, schema, diagnostics, intelligence, remediation };
}

describe("import remediation workflow", () => {
  it("produces a readiness breakdown with component scores", () => {
    const { remediation } = buildPlan(`date,region,revenue,cost,profit
2024-01-01,Berlin,1000,700,300
2024-01-02,Hamburg,1200,760,440`);

    expect(remediation.readiness.total).toBeGreaterThan(0);
    expect(remediation.readiness.components.map((component) => component.label)).toEqual([
      "Schema Quality",
      "Validation Health",
      "Governance",
      "Repair Stability",
      "Completeness",
    ]);
    expect(remediation.recommendationLabel).toBeTruthy();
  });

  it("creates actionable PII issues with suggested fixes", () => {
    const { remediation } = buildPlan(`date,customer_email,revenue
2024-01-01,alice@example.com,1000
2024-01-02,bob@example.com,1200`);

    const piiIssue = remediation.issues.find((issue) => issue.id === "pii-detected");
    expect(piiIssue).toBeTruthy();
    expect(piiIssue?.problem).toContain("PII");
    expect(piiIssue?.impact).toContain("Sensitive data");
    expect(piiIssue?.suggestedFix).toContain("masked");
    expect(piiIssue?.actions).toEqual(expect.arrayContaining(["review", "ignore"]));
  });

  it("builds a review queue for low-confidence or review-required fields", () => {
    const { remediation } = buildPlan(`unknown_blob,notes,email,revenue
???,needs manual checking,alice@example.com,1000
???,needs manual checking,bob@example.com,1200`);

    expect(remediation.reviewQueue.length).toBeGreaterThanOrEqual(1);
    expect(remediation.reviewQueue[0]).toEqual(
      expect.objectContaining({
        column: expect.any(String),
        confidence: expect.any(Number),
        reason: expect.any(String),
        badges: expect.any(Array),
      }),
    );
  });

  it("falls back to an info issue when no blockers are present", () => {
    const { remediation } = buildPlan(`date,region,revenue
2024-01-01,Berlin,1000
2024-01-02,Hamburg,1200`);

    expect(remediation.issues.some((issue) => issue.id === "no-blocking-issues")).toBe(true);
  });
});
