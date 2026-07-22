import { describe, expect, it } from "vitest";
import {
  type ColumnMapping,
  classifyDataset,
  computeDiagnostics,
  inferSchema,
  parseCSVText,
} from "./data-upload-utils";

const mappingFor = (schema: ReturnType<typeof inferSchema>): ColumnMapping =>
  Object.fromEntries(schema.map(s => [s.colIdx, s.inferredType]));

const fromCsv = (csv: string) => {
  const { headers, rows } = parseCSVText(csv);
  const schema = inferSchema(headers, rows);
  return { headers, rows, schema, mapping: mappingFor(schema) };
};

describe("industry classification (9 verticals)", () => {
  it("detects Finance from revenue/EBITDA/cash flow", () => {
    const { headers, mapping } = fromCsv(
      `date,revenue,ebitda,cash_flow,opex\n2024-01-01,1000,200,150,300\n2024-02-01,1100,210,160,310`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("Finance");
    expect(cls.confidence).toBeGreaterThanOrEqual(70);
  });

  it("detects Manufacturing from yield/defect/OEE", () => {
    const { headers, mapping } = fromCsv(
      `date,line_id,yield,defect_rate,oee,downtime\n2024-01-01,L1,0.95,0.02,0.83,12\n2024-01-02,L1,0.94,0.025,0.81,15`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("Manufacturing");
  });

  it("detects HR from employee_id/headcount/attrition", () => {
    const { headers, mapping } = fromCsv(
      `period,department,employee_id,headcount,attrition_rate,tenure_years\n2024-01,Eng,EMP-1,120,0.08,3.4\n2024-02,Eng,EMP-2,122,0.07,3.5`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("HR");
  });

  it("detects CRM from lead_source/opportunity_stage/pipeline", () => {
    const { headers, mapping } = fromCsv(
      `date,lead_source,opportunity_stage,deal_size,sales_rep\n2024-01-01,inbound,proposal,5000,Alice\n2024-01-02,outbound,negotiation,12000,Bob`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("CRM");
  });

  it("detects Supply Chain from supplier/on_time_delivery/lead_time", () => {
    const { headers, mapping } = fromCsv(
      `date,supplier,po_number,lead_time,on_time_delivery,fill_rate\n2024-01-01,Acme,PO-1,12,0.96,0.98\n2024-01-02,Beta,PO-2,15,0.94,0.97`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("Supply Chain");
  });

  it("detects Government from agency/appropriation/fiscal_year", () => {
    const { headers, mapping } = fromCsv(
      `fiscal_year,agency,program_code,appropriation,obligation,outlay\n2024,DOE,PRG-1,1000000,800000,750000\n2024,DOT,PRG-2,500000,400000,380000`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("Government");
  });

  it("detects Healthcare from patient_id/diagnosis/readmission", () => {
    const { headers, mapping } = fromCsv(
      `encounter_id,patient_id,diagnosis,los,readmission,mortality\nENC-1,P-1,I50,5,0,0\nENC-2,P-2,J18,7,1,0`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("Healthcare");
  });

  it("detects Retail from store_id/footfall/basket_size", () => {
    const { headers, mapping } = fromCsv(
      `date,store_id,footfall,basket_size,transactions,aov\n2024-01-01,S-1,1200,45,800,52\n2024-01-02,S-2,900,42,700,48`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("Retail");
  });

  it("detects SaaS from MRR/churn/NRR/active_users", () => {
    const { headers, mapping } = fromCsv(
      `month,mrr,nrr,churn_rate,active_users,cac\n2024-01,100000,1.12,0.02,5000,300\n2024-02,108000,1.14,0.018,5200,310`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("SaaS");
  });

  it("falls back to General Business when no signature matches", () => {
    const { headers, mapping } = fromCsv(
      `date,foo,bar,baz\n2024-01-01,1,2,3\n2024-02-01,4,5,6`,
    );
    const cls = classifyDataset(headers, mapping);
    expect(cls.industry).toBe("General Business");
  });
});

describe("dataset health profiler", () => {
  it("produces a healthScore with recommended action on a clean dataset", () => {
    const csv = `date,revenue,region\n${Array.from({ length: 12 }, (_, i) =>
      `2024-${String(i + 1).padStart(2, "0")}-01,${1000 + i * 50},EMEA`).join("\n")}`;
    const { headers, rows, schema, mapping } = fromCsv(csv);
    const diag = computeDiagnostics(rows, headers, mapping, schema);
    expect(diag.healthScore).toBeGreaterThanOrEqual(70);
    expect(["Proceed with Import", "Review before Import"]).toContain(diag.recommendedAction);
    expect(diag.completenessScore).toBeGreaterThan(90);
    expect(diag.schemaConfidence).toBeGreaterThan(60);
  });

  it("detects near-duplicate rows (same dims, different metric)", () => {
    const csv = `date,region,revenue\n2024-01-01,EMEA,1000\n2024-01-01,EMEA,1050\n2024-02-01,EMEA,1200`;
    const { headers, rows, schema, mapping } = fromCsv(csv);
    const diag = computeDiagnostics(rows, headers, mapping, schema);
    expect(diag.nearDuplicateRows).toBeGreaterThanOrEqual(1);
  });

  it("labels freshness as Stale for old data", () => {
    const csv = `date,revenue\n2015-01-01,100\n2015-02-01,110\n2015-03-01,120`;
    const { headers, rows, schema, mapping } = fromCsv(csv);
    const diag = computeDiagnostics(rows, headers, mapping, schema);
    expect(diag.dataFreshness.label).toBe("Stale");
    expect(diag.dataFreshness.daysSinceLatest).toBeGreaterThan(180);
  });

  it("penalizes health score when PII columns are present", () => {
    const csvClean = `date,revenue\n2024-01-01,1000\n2024-02-01,1100\n2024-03-01,1200`;
    const csvPii = `date,revenue,email,phone\n2024-01-01,1000,a@b.com,+1 555 123 4567\n2024-02-01,1100,c@d.com,+1 555 234 5678\n2024-03-01,1200,e@f.com,+1 555 345 6789`;
    const clean = fromCsv(csvClean);
    const pii = fromCsv(csvPii);
    const dClean = computeDiagnostics(clean.rows, clean.headers, clean.mapping, clean.schema);
    const dPii = computeDiagnostics(pii.rows, pii.headers, pii.mapping, pii.schema);
    expect(dPii.piiRisk.level).toBe("high");
    expect(dPii.healthScore).toBeLessThanOrEqual(dClean.healthScore);
  });
});

describe("German locale ingestion", () => {
  it("parses European number formats and German date order", () => {
    const csv = `datum,umsatz,kosten\n01.01.2024,"€12.500,50","8.200,75"\n02.01.2024,"€13.100,25","8.500,00"\n03.01.2024,"€14.000,00","9.000,00"`;
    const { headers, rows, schema, mapping } = fromCsv(csv);
    expect(schema.find(s => s.column === "umsatz")?.inferredType).toBe("value");
    expect(schema.find(s => s.column === "kosten")?.inferredType).toBe("value");
    const diag = computeDiagnostics(rows, headers, mapping, schema);
    expect(diag.completenessScore).toBeGreaterThan(90);
  });
});
