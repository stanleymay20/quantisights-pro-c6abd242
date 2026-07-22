export * from "./data-upload-utils";

import {
  humanizeError,
  type ColumnMapping,
  type ImportMode,
  type ValidationResult,
} from "./data-upload-utils";
import { parseMessyDate, parseMessyNumber } from "./messy-data-guards";

function findMappedIdx(mapping: ColumnMapping, target: string): number {
  const entry = Object.entries(mapping).find(([, value]) => value === target);
  return entry ? Number(entry[0]) : -1;
}

function findAllMappedIdx(mapping: ColumnMapping, target: string): number[] {
  return Object.entries(mapping)
    .filter(([, value]) => value === target)
    .map(([key]) => Number(key));
}

function safeNumberRange(values: number[]): { min: number; max: number } | null {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * Stack-safe validateData replacement for browser upload flows.
 *
 * The legacy implementation used Math.min(...values) / Math.max(...values),
 * which overflows the JS argument stack on large datasets. This keeps the same
 * public contract while computing the range through O(n) iteration.
 */
export function validateData(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping,
  importMode: ImportMode = "single",
): ValidationResult {
  const dateIdx = findMappedIdx(mapping, "date");
  const hasDateColumn = dateIdx >= 0;
  const valueIndices = findAllMappedIdx(mapping, "value");
  const primaryValueIdx = valueIndices[0] ?? -1;

  const errors: ReturnType<typeof humanizeError>[] = [];
  let validRows = 0;
  let validPoints = 0;
  let invalidPoints = 0;
  const dates: string[] = [];
  const values: number[] = [];
  let totalCells = 0;
  let filledCells = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    let rowValid = true;
    let dateValid = true;

    row.forEach((cell) => {
      totalCells += 1;
      if (cell && cell.trim()) filledCells += 1;
    });

    if (hasDateColumn) {
      const normalizedDate = parseMessyDate(row[dateIdx]);
      if (!normalizedDate) {
        errors.push(humanizeError(rowIndex + 2, `Invalid date format: "${row[dateIdx] ?? ""}"`));
        rowValid = false;
        dateValid = false;
      } else {
        dates.push(normalizedDate);
      }
    }

    const checkIndices = importMode === "multi" ? valueIndices : (primaryValueIdx >= 0 ? [primaryValueIdx] : []);
    for (const valueIndex of checkIndices) {
      const raw = row[valueIndex];
      const num = parseMessyNumber(raw);
      if (!raw || !raw.trim()) {
        if (importMode === "single") {
          errors.push(humanizeError(rowIndex + 2, `Missing value in column "${headers[valueIndex] ?? valueIndex}"`));
          rowValid = false;
        }
        invalidPoints += 1;
      } else if (!Number.isFinite(num)) {
        errors.push(humanizeError(rowIndex + 2, `Non-numeric value in column "${headers[valueIndex] ?? valueIndex}": "${raw}"`));
        rowValid = false;
        invalidPoints += 1;
      } else if (Math.abs(num) > 1e12) {
        errors.push(humanizeError(rowIndex + 2, `Value exceeds limit: ${num}`));
        rowValid = false;
        invalidPoints += 1;
      } else {
        if (dateValid) validPoints += 1;
        values.push(num);
      }
    }

    if (rowValid) validRows += 1;
  }

  const totalPoints = importMode === "multi" ? rows.length * Math.max(1, valueIndices.length) : rows.length;
  const completeness = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
  const errorRate = rows.length > 0 ? (errors.length / rows.length) * 100 : 0;
  const structureBonus = (primaryValueIdx >= 0 ? 10 : 0) + (hasDateColumn ? 10 : 0);
  const qualityScore = Math.max(0, Math.min(100, Math.round(
    completeness * 0.4 + (100 - errorRate) * 0.4 + structureBonus,
  )));

  const sortedDates = [...dates].sort();
  return {
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    validPoints,
    invalidPoints,
    totalPoints,
    errors: errors.slice(0, 50),
    qualityScore,
    completeness,
    dateRange: sortedDates.length > 0 ? { min: sortedDates[0], max: sortedDates[sortedDates.length - 1] } : null,
    valueRange: safeNumberRange(values),
  };
}
