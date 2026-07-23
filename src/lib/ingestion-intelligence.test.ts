import { describe, expect, it } from "vitest";
import { computeDiagnostics, inferSchema, parseCSVText } from "./data-upload-utils";
import { buildIngestionIntelligence, summarizeIngestionIntelligence } from "./ingestion-intelligence";

const mappingFromSchema = (schema: ReturnType<typeof inferSchema>) => {
  return Object.fromEntries(schema.map((column) => [column.colIdx, column.inferredType]));
};

describe("ingestion intelligence aggregator", () => {
  it("builds a complete intelligence package for messy German manufacturing data", () => {
    const csv = `date,region,revenue_eur,gross_margin_pct,inventory_turnover,customer_email
2024-01-01,Berlin,"1.234,56",42%,6.2,alice@example.com
2024-01-02,Hamburg,"2.345,67",41%,6.4,bob@example.com
2024-01-03,Munich,Unknown,39%,6.1,charlie@example.com`;

    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const mapping = mappingFromSchema(schema);
    const diagnostics = computeDiagnostics(rows, headers, mapping, schema);
    const result = buildIngestionIntelligence({ headers, rows, schema, diagnostics });

    expect(result.locale.locale).toBe("de-DE");
    expect(result.dictionary.fieldCount).toBe(headers.length);
    expect(result.dictionary.summary.piiCount).toBeGreaterThanOrEqual(1);
    expect(result.semanticSchema.kpiColumns).toEqual(expect.arrayContaining(["revenue_eur", "gross_margin_pct", "inventory_turnover"]));
    expect(result.repairReport.summary.recommendedAction).toBeTruthy();
  });

  it("summarizes ingestion intelligence for upload UI cards", () => {
    const csv = `date,revenue,revenue_usd,sales_revenue,customer_id
2024-01-01,1000,1000,1000,C001
2024-01-02,1200,1200,1200,C002`;

    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const mapping = mappingFromSchema(schema);
    const diagnostics = computeDiagnostics(rows, headers, mapping, schema);
    const result = buildIngestionIntelligence({ headers, rows, schema, diagnostics });
    const summary = summarizeIngestionIntelligence(result);

    expect(summary.join("\n")).toContain("Dictionary fields");
    expect(summary.join("\n")).toContain("Trust signal");
    expect(result.columnSimilarity.groups.length).toBeGreaterThanOrEqual(1);
  });
});
