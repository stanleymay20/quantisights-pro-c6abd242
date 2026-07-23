import { describe, expect, it } from "vitest";
import {
  type ColumnMapping,
  computeDiagnostics,
  inferSchema,
  parseCSVText,
  validateData,
} from "./data-upload-utils";

const mappingFromSchema = (schema: ReturnType<typeof inferSchema>): ColumnMapping => {
  return Object.fromEntries(schema.map((col) => [col.colIdx, col.inferredType]));
};

const typeOf = (schema: ReturnType<typeof inferSchema>, column: string) => {
  const found = schema.find((item) => item.column === column);
  if (!found) throw new Error(`Column not found: ${column}`);
  return found.inferredType;
};

describe("data upload messy dataset inference", () => {
  it("keeps business text columns out of metric mapping", () => {
    const csv = `date,month,department,region,product_line,sales_channel,supplier,revenue_eur,gross_margin_pct,decision_flag
2024-01-01,2024-01,Manufacturing,Kumasi,Suiting Fabric,Wholesale,Printex Ltd,€12,500.50,35%,Normal
2024-01-02,2024-01,Sales,Accra,School Uniform Fabric,Institutional Contract,Regional Fabric Supplier,13200.75,31.5%,Margin Pressure
2024-01-03,2024-01,Operations,Tamale,Sewing Accessories,Distributor,China Textile Supplier,(1100.25),-8%,Delivery Risk`;

    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);

    expect(typeOf(schema, "date")).toBe("date");
    expect(typeOf(schema, "department")).toBe("segment");
    expect(typeOf(schema, "region")).not.toBe("value");
    expect(typeOf(schema, "product_line")).toBe("segment");
    expect(typeOf(schema, "sales_channel")).toBe("segment");
    expect(typeOf(schema, "supplier")).toBe("segment");
    expect(typeOf(schema, "decision_flag")).toBe("segment");
    expect(typeOf(schema, "revenue_eur")).toBe("value");
    expect(typeOf(schema, "gross_margin_pct")).toBe("value");
    expect(typeOf(schema, "month")).not.toBe("value");
  });

  it("validates wide multi-metric CSVs with currency, percentages, and negative accounting values", () => {
    const csv = `date,department,revenue_eur,cost_eur,gross_profit_eur,gross_margin_pct,on_time_delivery_pct,defect_rate_pct
2024-01-01,Manufacturing,€12,500,7500,5000,40%,96.2%,1.8%
2024-01-02,Manufacturing,13200,8100,5100,38.64%,95.1%,2.1%
2024-01-03,Sales,(1100),900,-200,-18.18%,92%,2.9%`;

    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const mapping = mappingFromSchema(schema);
    const validation = validateData(rows, headers, mapping, "multi");

    expect(validation.validRows).toBe(3);
    expect(validation.errors).toHaveLength(0);
    expect(validation.validPoints).toBeGreaterThanOrEqual(18);
  });

  it("detects quarter and period fields as time/segments, never numeric metrics", () => {
    const csv = `quarter,period,reporting_period,revenue_eur,risk_score
2024-Q1,Jan-2024,2024-01,10000,42
2024-Q2,Feb-2024,2024-02,12000,38
2024-Q3,Mar-2024,2024-03,15000,35`;

    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);

    expect(typeOf(schema, "quarter")).not.toBe("value");
    expect(typeOf(schema, "period")).not.toBe("value");
    expect(typeOf(schema, "reporting_period")).not.toBe("value");
    expect(typeOf(schema, "revenue_eur")).toBe("value");
    expect(typeOf(schema, "risk_score")).toBe("value");
  });

  it("handles common operational datasets without forcing identifiers or booleans into metrics", () => {
    const csv = `order_id,customer_id,is_active,status,sku,units_sold,returns_units,customer_satisfaction_score
ORD-001,CUST-001,true,completed,SKU-1,120,2,8.7
ORD-002,CUST-002,false,pending,SKU-2,80,1,7.9
ORD-003,CUST-003,true,cancelled,SKU-3,0,5,4.2`;

    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);

    expect(typeOf(schema, "order_id")).not.toBe("value");
    expect(typeOf(schema, "customer_id")).not.toBe("value");
    expect(typeOf(schema, "is_active")).not.toBe("value");
    expect(typeOf(schema, "status")).toBe("segment");
    expect(typeOf(schema, "sku")).not.toBe("value");
    expect(typeOf(schema, "units_sold")).toBe("value");
    expect(typeOf(schema, "returns_units")).toBe("value");
    expect(typeOf(schema, "customer_satisfaction_score")).toBe("value");
  });

  it("deduplicates duplicate headers before inference", () => {
    const csv = `date,revenue,revenue,revenue
2024-01-01,100,200,300
2024-01-02,110,210,310`;
    const { headers } = parseCSVText(csv);
    expect(headers).toEqual(["date", "revenue", "revenue_2", "revenue_3"]);
  });

  it("normalizes null-like tokens to empty strings", () => {
    const csv = `date,revenue
2024-01-01,N/A
2024-01-02,NULL
2024-01-03,1500`;
    const { rows } = parseCSVText(csv);
    expect(rows[0][1]).toBe("");
    expect(rows[1][1]).toBe("");
    expect(rows[2][1]).toBe("1500");
  });

  it("parses European numbers, accounting negatives, magnitude suffixes, and scientific notation", () => {
    const csv = `date,revenue
2024-01-01,"€12.500,50"
2024-01-02,(1500)
2024-01-03,10K
2024-01-04,1.2E6
2024-01-05,"1.234.567,89"`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const revenueCol = schema.find((s) => s.column === "revenue");
    expect(revenueCol?.inferredType).toBe("value");
  });

  it("parses Excel serial dates, ISO week, quarters, and FY periods", () => {
    const csv = `date,revenue
45292,1000
2024-W03,1100
Q2-2024,1200
FY24-Q3,1300
2024-01,1400`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const mapping: ColumnMapping = Object.fromEntries(
      schema.map((s) => [s.colIdx, s.inferredType]),
    );
    const result = validateData(rows, headers, mapping, "single");
    expect(result.errors.filter((e) => e.friendlyTitle.toLowerCase().includes("date"))).toHaveLength(0);
    expect(result.dateRange).not.toBeNull();
  });

  it("classifies identifier columns as segments, never metrics", () => {
    const csv = `order_id,customer_id,uuid,sku,revenue
ORD-001,CUST-1001,550e8400-e29b-41d4-a716-446655440000,SKU-9001,1200
ORD-002,CUST-1002,550e8400-e29b-41d4-a716-446655440001,SKU-9002,1300`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    for (const col of ["order_id", "customer_id", "uuid", "sku"]) {
      const t = schema.find((s) => s.column === col)?.inferredType;
      expect(t).not.toBe("value");
    }
    expect(schema.find((s) => s.column === "revenue")?.inferredType).toBe("value");
  });

  it("detects PII columns in diagnostics", () => {
    const csv = `customer_id,email,phone,revenue
C001,alice@example.com,+1 555 123 4567,1000
C002,bob@example.com,+1 555 987 6543,1100`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const mapping: ColumnMapping = Object.fromEntries(
      schema.map((s) => [s.colIdx, s.inferredType]),
    );
    const diag = computeDiagnostics(rows, headers, mapping);
    expect(diag.piiRisk.level).toBe("high");
    expect(diag.piiRisk.columns).toEqual(expect.arrayContaining(["email", "phone"]));
  });

  it("HR dataset: tenure/headcount stay metrics, employee_id stays segment", () => {
    const csv = `period,department,employee_id,headcount,attrition_rate,tenure_years
2024-01,Engineering,EMP-1001,120,0.08,3.4
2024-02,Engineering,EMP-1002,122,0.07,3.5
2024-03,Sales,EMP-1003,98,0.11,2.9`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    expect(schema.find((s) => s.column === "employee_id")?.inferredType).toBe("segment");
    expect(schema.find((s) => s.column === "headcount")?.inferredType).toBe("value");
    expect(schema.find((s) => s.column === "attrition_rate")?.inferredType).toBe("value");
    expect(schema.find((s) => s.column === "tenure_years")?.inferredType).toBe("value");
  });

  it("validation errors include column name and a suggestion", () => {
    const csv = `date,revenue
2024-01-01,not_a_number
2024-01-02,1500`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const mapping: ColumnMapping = Object.fromEntries(
      schema.map((s) => [s.colIdx, s.inferredType]),
    );
    // Force revenue as value even if inference demoted it
    const revIdx = headers.indexOf("revenue");
    mapping[revIdx] = "value";
    const result = validateData(rows, headers, mapping, "single");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].friendlyDescription).toContain("revenue");
    expect(result.errors[0].suggestion).toBeTruthy();
  });
});
