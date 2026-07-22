// ---- Phase 5: Schema Evolution Engine ----
// Pure, deterministic schema diff. No DB, no React. Easy to unit-test.
//
// Detects:
//   • added columns
//   • removed columns
//   • renamed columns (via fuzzy similarity)
//   • type changes
//   • metric/dimension role changes
//
// Confidence scoring is bounded to [0,1] and capped at 0.95 (epistemic
// integrity rule — never claim certainty). Renames are only proposed when
// similarity ≥ 0.72 AND types match.

import type { ColumnTarget } from "./data-upload-utils";

export interface SchemaColumn {
  name: string;
  type: "number" | "date" | "text" | "boolean" | "identifier" | "unknown";
  role: ColumnTarget;
}

export interface SchemaSnapshot {
  datasetId: string;
  versionNumber: number;
  columns: SchemaColumn[];
  capturedAt: string; // ISO
}

export type DriftChangeType =
  | "added"
  | "removed"
  | "renamed"
  | "type_changed"
  | "role_changed";

export interface DriftChange {
  changeType: DriftChangeType;
  columnName: string;
  oldName?: string;
  oldType?: SchemaColumn["type"];
  newType?: SchemaColumn["type"];
  oldRole?: ColumnTarget;
  newRole?: ColumnTarget;
  confidence: number; // 0..0.95
  recommendation: string;
}

export interface DriftReport {
  fromVersion: number;
  toVersion: number;
  totalChanges: number;
  changes: DriftChange[];
  /** True when only additive changes — dashboards remain valid. */
  backwardCompatible: boolean;
}

// ---- Similarity: Jaro-Winkler-lite, sufficient for column-name matching ----
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) m[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(
        m[i - 1][j] + 1,
        m[i][j - 1] + 1,
        m[i - 1][j - 1] + cost,
      );
    }
  }
  return m[a.length][b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

const RENAME_THRESHOLD = 0.72;

// ---- Snapshot construction ----
export function buildSnapshot(
  datasetId: string,
  versionNumber: number,
  columns: SchemaColumn[],
): SchemaSnapshot {
  return {
    datasetId,
    versionNumber,
    columns: columns.map((c) => ({ ...c })),
    capturedAt: new Date().toISOString(),
  };
}

// ---- Drift detection ----
export function detectDrift(
  previous: SchemaSnapshot | null,
  next: SchemaSnapshot,
): DriftReport {
  if (!previous) {
    return {
      fromVersion: 0,
      toVersion: next.versionNumber,
      totalChanges: 0,
      changes: [],
      backwardCompatible: true,
    };
  }

  const changes: DriftChange[] = [];
  const prevByName = new Map(previous.columns.map((c) => [c.name, c]));
  const nextByName = new Map(next.columns.map((c) => [c.name, c]));

  // 1. Exact-name matches: detect type and role changes
  for (const [name, prevCol] of prevByName) {
    const nextCol = nextByName.get(name);
    if (!nextCol) continue;
    if (prevCol.type !== nextCol.type) {
      changes.push({
        changeType: "type_changed",
        columnName: name,
        oldType: prevCol.type,
        newType: nextCol.type,
        confidence: 0.95,
        recommendation:
          nextCol.type === "text" && prevCol.type === "number"
            ? "Numeric column became text. Check for currency symbols or null tokens like 'N/A'."
            : `Type changed ${prevCol.type} → ${nextCol.type}. Re-validate downstream metrics.`,
      });
    }
    if (prevCol.role !== nextCol.role) {
      changes.push({
        changeType: "role_changed",
        columnName: name,
        oldRole: prevCol.role,
        newRole: nextCol.role,
        confidence: 0.85,
        recommendation: `Column role changed ${prevCol.role} → ${nextCol.role}. Existing dashboards may misclassify this field.`,
      });
    }
  }

  // 2. Find rename candidates among unmatched columns
  const unmatchedPrev = previous.columns.filter((c) => !nextByName.has(c.name));
  const unmatchedNext = next.columns.filter((c) => !prevByName.has(c.name));
  const consumed = new Set<string>();

  for (const newCol of unmatchedNext) {
    let bestMatch: SchemaColumn | null = null;
    let bestScore = 0;
    for (const oldCol of unmatchedPrev) {
      if (consumed.has(oldCol.name)) continue;
      if (oldCol.type !== newCol.type) continue;
      const score = nameSimilarity(oldCol.name, newCol.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = oldCol;
      }
    }
    if (bestMatch && bestScore >= RENAME_THRESHOLD) {
      consumed.add(bestMatch.name);
      changes.push({
        changeType: "renamed",
        columnName: newCol.name,
        oldName: bestMatch.name,
        oldType: bestMatch.type,
        newType: newCol.type,
        confidence: Math.min(0.95, bestScore),
        recommendation: `Likely rename of '${bestMatch.name}'. Auto-map to preserve dashboards.`,
      });
    }
  }

  // 3. Remaining are pure adds/removes
  for (const newCol of unmatchedNext) {
    const wasRename = changes.some(
      (c) => c.changeType === "renamed" && c.columnName === newCol.name,
    );
    if (wasRename) continue;
    changes.push({
      changeType: "added",
      columnName: newCol.name,
      newType: newCol.type,
      newRole: newCol.role,
      confidence: 0.95,
      recommendation: `New column added. Suggested role: ${newCol.role}.`,
    });
  }
  for (const oldCol of unmatchedPrev) {
    if (consumed.has(oldCol.name)) continue;
    changes.push({
      changeType: "removed",
      columnName: oldCol.name,
      oldType: oldCol.type,
      oldRole: oldCol.role,
      confidence: 0.95,
      recommendation:
        oldCol.role === "value"
          ? `Metric '${oldCol.name}' removed. Dashboards referencing it will break — replace or hide.`
          : `Column removed. Safe to drop if not referenced.`,
    });
  }

  const breakingTypes: DriftChangeType[] = ["removed", "type_changed", "role_changed"];
  const backwardCompatible = !changes.some((c) =>
    breakingTypes.includes(c.changeType),
  );

  return {
    fromVersion: previous.versionNumber,
    toVersion: next.versionNumber,
    totalChanges: changes.length,
    changes,
    backwardCompatible,
  };
}

// ---- Rendering helpers ----
export function summarizeDrift(report: DriftReport): string {
  if (report.totalChanges === 0) return "No schema changes detected.";
  const counts: Record<DriftChangeType, number> = {
    added: 0,
    removed: 0,
    renamed: 0,
    type_changed: 0,
    role_changed: 0,
  };
  for (const c of report.changes) counts[c.changeType] += 1;
  const parts: string[] = [];
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (counts.renamed) parts.push(`${counts.renamed} renamed`);
  if (counts.type_changed) parts.push(`${counts.type_changed} type changes`);
  if (counts.role_changed) parts.push(`${counts.role_changed} role changes`);
  return parts.join(", ");
}
