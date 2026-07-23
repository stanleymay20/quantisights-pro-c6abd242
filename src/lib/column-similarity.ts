export interface ColumnSimilarityGroup {
  canonicalName: string;
  columns: string[];
  confidence: number;
  basis: string[];
}

export interface ColumnSimilarityReport {
  groups: ColumnSimilarityGroup[];
  groupedColumnCount: number;
  summary: string;
}

const CANONICAL_SYNONYMS: Record<string, string[]> = {
  revenue: ["revenue", "sales", "turnover", "income", "net_sales", "gross_sales", "sales_revenue", "revenue_amount"],
  cost: ["cost", "expense", "cogs", "opex", "spend", "cost_amount"],
  profit: ["profit", "gross_profit", "net_profit", "operating_profit", "earnings"],
  margin: ["margin", "gross_margin", "margin_pct", "gross_margin_pct", "profit_margin"],
  customer: ["customer", "client", "account", "buyer"],
  employee: ["employee", "staff", "worker", "associate"],
  supplier: ["supplier", "vendor", "partner"],
  product: ["product", "item", "sku", "article"],
  inventory: ["inventory", "stock", "warehouse_stock", "stock_level"],
};

function normalizeColumn(name: string): string {
  return name.toLowerCase().trim().replace(/[%]/g, "_pct").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function tokens(name: string): Set<string> {
  return new Set(normalizeColumn(name).split("_").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / union.size;
}

function canonicalFor(column: string): { canonicalName: string; confidence: number; basis: string[] } {
  const normalized = normalizeColumn(column);
  for (const [canonicalName, synonyms] of Object.entries(CANONICAL_SYNONYMS)) {
    if (synonyms.includes(normalized)) {
      return { canonicalName, confidence: 0.95, basis: ["exact_synonym_match"] };
    }
    if (synonyms.some((synonym) => normalized.includes(synonym) || synonym.includes(normalized))) {
      return { canonicalName, confidence: 0.86, basis: ["partial_synonym_match"] };
    }
  }
  return { canonicalName: normalized, confidence: 0.7, basis: ["normalized_name"] };
}

export function groupSimilarColumns(columns: string[]): ColumnSimilarityReport {
  const grouped = new Map<string, ColumnSimilarityGroup>();

  for (const column of columns) {
    const canonical = canonicalFor(column);
    const existing = grouped.get(canonical.canonicalName);
    if (existing) {
      existing.columns.push(column);
      existing.confidence = Math.min(0.95, Math.round(((existing.confidence + canonical.confidence) / 2) * 100) / 100);
      existing.basis = Array.from(new Set([...existing.basis, ...canonical.basis]));
    } else {
      grouped.set(canonical.canonicalName, {
        canonicalName: canonical.canonicalName,
        columns: [column],
        confidence: canonical.confidence,
        basis: canonical.basis,
      });
    }
  }

  const tokenGroups = Array.from(grouped.values());
  for (let i = 0; i < columns.length; i += 1) {
    for (let j = i + 1; j < columns.length; j += 1) {
      const score = jaccard(tokens(columns[i]), tokens(columns[j]));
      if (score < 0.6) continue;
      const canonicalA = canonicalFor(columns[i]).canonicalName;
      const canonicalB = canonicalFor(columns[j]).canonicalName;
      if (canonicalA === canonicalB) continue;
      const groupA = grouped.get(canonicalA);
      const groupB = grouped.get(canonicalB);
      if (!groupA || !groupB) continue;
      groupA.columns = Array.from(new Set([...groupA.columns, ...groupB.columns]));
      groupA.confidence = Math.min(0.95, Math.round((0.75 + score * 0.2) * 100) / 100);
      groupA.basis = Array.from(new Set([...groupA.basis, ...groupB.basis, "token_similarity"]));
      grouped.delete(canonicalB);
    }
  }

  const groups = Array.from(grouped.values())
    .filter((group) => group.columns.length > 1)
    .sort((a, b) => b.confidence - a.confidence);

  return {
    groups,
    groupedColumnCount: groups.reduce((sum, group) => sum + group.columns.length, 0),
    summary: groups.length === 0
      ? "No related column groups detected"
      : `${groups.length} related column group${groups.length === 1 ? "" : "s"} detected`,
  };
}
