import { describe, expect, it } from "vitest";
import { inferSchema, parseCSVText } from "./data-upload-utils";
import { classifySemanticSchema } from "./semantic-column-classifier";

const profileFor = (summary: ReturnType<typeof classifySemanticSchema>, column: string) => {
  const found = summary.profiles.find((profile) => profile.column === column);
  if (!found) throw new Error(`Semantic profile not found for ${column}`);
  return found;
};

describe("semantic column classifier", () => {
  it("identifies financial KPI semantics from wide finance columns", () => {
    const csv = `date,revenue_eur,gross_margin_pct,cost_eur,cash_balance
2024-01-01,10000,42%,5800,25000
2024-01-02,12000,44%,6500,27000`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const summary = classifySemanticSchema({ schema, rows });

    expect(profileFor(summary, "revenue_eur").semanticType).toBe("currency");
    expect(profileFor(summary, "revenue_eur").businessRole).toBe("financial_kpi");
    expect(profileFor(summary, "gross_margin_pct").semanticType).toBe("percentage");
    expect(profileFor(summary, "gross_margin_pct").businessRole).toBe("financial_kpi");
    expect(summary.kpiColumns).toEqual(expect.arrayContaining(["revenue_eur", "gross_margin_pct", "cost_eur", "cash_balance"]));
  });

  it("protects identifiers and postal/location codes from KPI usage", () => {
    const csv = `employee_id,zip_code,product_code,invoice_number,revenue
100001,10115,PROD-900,INV-001,1000
100002,10117,PROD-901,INV-002,1100`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const summary = classifySemanticSchema({ schema, rows });

    expect(profileFor(summary, "employee_id").semanticType).toBe("identifier");
    expect(profileFor(summary, "employee_id").businessRole).toBe("entity_key");
    expect(profileFor(summary, "zip_code").semanticType).toBe("location");
    expect(profileFor(summary, "zip_code").businessRole).toBe("geo_dimension");
    expect(profileFor(summary, "product_code").semanticType).toBe("identifier");
    expect(profileFor(summary, "invoice_number").semanticType).toBe("identifier");
    expect(summary.identifierColumns).toEqual(expect.arrayContaining(["employee_id", "product_code", "invoice_number"]));
  });

  it("flags sensitive attributes and boolean status fields", () => {
    const csv = `customer_email,phone,is_active,approved_flag,revenue
alice@example.com,+49 123 456789,yes,true,1000
bob@example.com,+49 987 654321,no,false,900`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const summary = classifySemanticSchema({ schema, rows });

    expect(profileFor(summary, "customer_email").semanticType).toBe("pii");
    expect(profileFor(summary, "phone").semanticType).toBe("pii");
    expect(profileFor(summary, "is_active").semanticType).toBe("boolean");
    expect(profileFor(summary, "approved_flag").businessRole).toBe("status_flag");
    expect(summary.piiColumns).toEqual(expect.arrayContaining(["customer_email", "phone"]));
    expect(summary.reviewRequiredCount).toBeGreaterThanOrEqual(2);
  });

  it("assigns operational and customer KPI roles", () => {
    const csv = `date,inventory_turnover,defect_rate,on_time_delivery_pct,customer_satisfaction_score,nps
2024-01-01,6.2,1.5%,96%,8.7,55
2024-01-02,6.4,1.2%,97%,8.9,58`;
    const { headers, rows } = parseCSVText(csv);
    const schema = inferSchema(headers, rows);
    const summary = classifySemanticSchema({ schema, rows });

    expect(profileFor(summary, "inventory_turnover").businessRole).toBe("operational_kpi");
    expect(profileFor(summary, "defect_rate").businessRole).toBe("operational_kpi");
    expect(profileFor(summary, "customer_satisfaction_score").businessRole).toBe("customer_kpi");
    expect(profileFor(summary, "nps").businessRole).toBe("customer_kpi");
    expect(summary.averageConfidence).toBeGreaterThanOrEqual(80);
  });
});
