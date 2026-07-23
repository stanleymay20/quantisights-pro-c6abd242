import type { ParsedWorkbook, WorkbookSheet } from "./workbook-parser";

export type RelationshipKind = "primary_foreign_key" | "shared_business_key" | "possible_lookup";

export interface SheetRelationship {
  fromSheet: string;
  toSheet: string;
  fromColumn: string;
  toColumn: string;
  kind: RelationshipKind;
  confidence: number;
  basis: string[];
}

export interface CrossSheetDiscoveryResult {
  relationships: SheetRelationship[];
  sheetCount: number;
  confidence: number;
  summary: string;
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isKeyColumn(header: string): boolean {
  const h = normalizeHeader(header);
  return h === "id" || h.endsWith("_id") || h.endsWith("_no") || h.endsWith("_number") || h.includes("uuid") || h.includes("sku");
}

function uniqueNonEmptyValues(sheet: WorkbookSheet, columnIndex: number, maxRows = 1000): Set<string> {
  return new Set(
    sheet.rows
      .slice(0, maxRows)
      .map((row) => String(row[columnIndex] ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function singularize(name: string): string {
  return name.toLowerCase().replace(/s$/, "");
}

function inferKind(fromSheet: string, toSheet: string, fromColumn: string, toColumn: string): RelationshipKind {
  const from = normalizeHeader(fromColumn);
  const to = normalizeHeader(toColumn);
  if (from === to && isKeyColumn(from)) return "shared_business_key";
  if (isKeyColumn(from) && isKeyColumn(to)) return "primary_foreign_key";
  if (singularize(toSheet).includes(singularize(fromSheet)) || singularize(fromSheet).includes(singularize(toSheet))) {
    return "possible_lookup";
  }
  return "shared_business_key";
}

export function discoverCrossSheetRelationships(workbook: ParsedWorkbook): CrossSheetDiscoveryResult {
  const usableSheets = workbook.sheets.filter((sheet) => !sheet.hidden && sheet.headers.length > 0 && sheet.rows.length > 0);
  const relationships: SheetRelationship[] = [];

  for (let i = 0; i < usableSheets.length; i += 1) {
    for (let j = i + 1; j < usableSheets.length; j += 1) {
      const left = usableSheets[i];
      const right = usableSheets[j];

      left.headers.forEach((leftHeader, leftIdx) => {
        const leftNorm = normalizeHeader(leftHeader);
        right.headers.forEach((rightHeader, rightIdx) => {
          const rightNorm = normalizeHeader(rightHeader);
          const exactNameMatch = leftNorm === rightNorm;
          const keyNameMatch = isKeyColumn(leftHeader) && isKeyColumn(rightHeader) && (
            leftNorm === rightNorm || leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm)
          );
          if (!exactNameMatch && !keyNameMatch) return;

          const leftValues = uniqueNonEmptyValues(left, leftIdx);
          const rightValues = uniqueNonEmptyValues(right, rightIdx);
          const overlap = overlapRatio(leftValues, rightValues);
          if (overlap < 0.15 && !keyNameMatch) return;

          const confidence = Math.min(0.95, Math.round((0.55 + overlap * 0.4 + (keyNameMatch ? 0.1 : 0)) * 100) / 100);
          relationships.push({
            fromSheet: left.name,
            toSheet: right.name,
            fromColumn: leftHeader,
            toColumn: rightHeader,
            kind: inferKind(left.name, right.name, leftHeader, rightHeader),
            confidence,
            basis: [
              exactNameMatch ? "matching_column_name" : "similar_key_column_name",
              `value_overlap_${Math.round(overlap * 100)}pct`,
              keyNameMatch ? "key_column_pattern" : "shared_values",
            ],
          });
        });
      });
    }
  }

  const avgConfidence = relationships.length > 0
    ? Math.round((relationships.reduce((sum, rel) => sum + rel.confidence, 0) / relationships.length) * 100) / 100
    : 0;

  return {
    relationships: relationships.sort((a, b) => b.confidence - a.confidence),
    sheetCount: usableSheets.length,
    confidence: avgConfidence,
    summary: relationships.length === 0
      ? "No cross-sheet relationships detected"
      : `${relationships.length} cross-sheet relationship${relationships.length === 1 ? "" : "s"} detected`,
  };
}
