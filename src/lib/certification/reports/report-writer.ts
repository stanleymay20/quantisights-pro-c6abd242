// Certification report writer — generates a markdown release-gate report
// summarising every certification pack outcome, performance, and assertions.

export type PackStatus = "PASS" | "FAIL";

export interface PackResult {
  name: string;
  status: PackStatus;
  rows: number;
  parseMs?: number;
  parseBudgetMs?: number;
  heapDeltaMb?: number;
  notes: string[];
}

export interface CertificationReport {
  generatedAt: string;
  overall: PackStatus;
  ingestionAccuracyPct: number;
  performance: PackStatus;
  governance: PackStatus;
  schemaEvolution: PackStatus;
  piiDetection: PackStatus;
  industryClassification: PackStatus;
  packs: PackResult[];
}

export function renderReport(report: CertificationReport): string {
  const lines: string[] = [];
  lines.push("# Quantivis Ingestion Certification Report");
  lines.push("");
  lines.push(`_Generated: ${report.generatedAt}_`);
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push(`| Section | Status |`);
  lines.push(`|---|---|`);
  lines.push(`| **Overall** | **${report.overall}** |`);
  lines.push(`| Ingestion Accuracy | ${report.ingestionAccuracyPct.toFixed(1)}% |`);
  lines.push(`| Performance | ${report.performance} |`);
  lines.push(`| Governance | ${report.governance} |`);
  lines.push(`| Schema Evolution | ${report.schemaEvolution} |`);
  lines.push(`| PII Detection | ${report.piiDetection} |`);
  lines.push(`| Industry Classification | ${report.industryClassification} |`);
  lines.push("");
  lines.push("## Packs");
  lines.push("");
  lines.push(`| Pack | Rows | Parse (ms) | Budget (ms) | Heap Δ (MB) | Status |`);
  lines.push(`|---|---:|---:|---:|---:|---|`);
  for (const p of report.packs) {
    lines.push(
      `| ${p.name} | ${p.rows.toLocaleString()} | ${p.parseMs ?? "-"} | ${p.parseBudgetMs ?? "-"} | ${(p.heapDeltaMb ?? 0).toFixed(1)} | ${p.status} |`,
    );
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const p of report.packs) {
    if (p.notes.length === 0) continue;
    lines.push(`### ${p.name}`);
    for (const note of p.notes) lines.push(`- ${note}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function computeOverall(
  sections: Record<string, PackStatus>,
): PackStatus {
  return Object.values(sections).every((s) => s === "PASS") ? "PASS" : "FAIL";
}
