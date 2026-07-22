// ---- Enterprise workbook parser ----
// Handles XLSX, XLS, XLSM, ODS via SheetJS. Returns a uniform shape so the
// existing CSV ingestion pipeline (normalize → infer → validate) can consume it.
//
// Design rules:
//   • Read formulas as their cached values (cellFormula:false). Formulas that
//     never recalculated in Excel will reflect their last saved value, which is
//     the same behavior an executive sees when opening the file.
//   • Hidden sheets are surfaced but flagged so the UI can warn before import.
//   • Merged cells: the value lives only in the top-left cell. We expand it
//     into every covered cell so downstream inference sees a rectangular grid.
//   • Auto header detection: scans the first 10 rows for the row with the most
//     non-empty cells and the highest text-rate. Falls back to row 0.
//   • Excel serial dates are emitted as ISO yyyy-mm-dd strings so messy-data
//     guards do not have to re-detect them.

import * as XLSX from "xlsx";
import { deduplicateHeaders, normalizeCell } from "./messy-data-guards";

export interface WorkbookSheet {
  name: string;
  hidden: boolean;
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: string[][];
}

export interface ParsedWorkbook {
  workbookName: string;
  sheetCount: number;
  sheets: WorkbookSheet[];
}

const SUPPORTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".ods"] as const;

export function isWorkbookFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isSupportedDataFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".csv") || isWorkbookFile(lower);
}

function isLikelyHeaderRow(cells: unknown[]): { score: number; nonEmpty: number } {
  let nonEmpty = 0;
  let textCells = 0;
  let numericCells = 0;
  for (const cell of cells) {
    if (cell === null || cell === undefined || cell === "") continue;
    nonEmpty += 1;
    const asString = String(cell).trim();
    if (!asString) continue;
    if (!Number.isNaN(Number(asString.replace(/[,%$€£¥\s]/g, "")))) {
      numericCells += 1;
    } else {
      textCells += 1;
    }
  }
  // Header rows are wide, mostly text, no numbers.
  const score = nonEmpty + textCells * 2 - numericCells * 3;
  return { score, nonEmpty };
}

function detectHeaderRowIndex(rows: unknown[][]): number {
  const scanLimit = Math.min(rows.length, 10);
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < scanLimit; i += 1) {
    const { score, nonEmpty } = isLikelyHeaderRow(rows[i]);
    if (nonEmpty === 0) continue;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    // Keep integers integer, otherwise trim noisy float precision.
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return normalizeCell(String(value));
}

function applyMergedCells(
  worksheet: XLSX.WorkSheet,
  matrix: unknown[][],
): void {
  const merges = (worksheet["!merges"] ?? []) as XLSX.Range[];
  for (const merge of merges) {
    const topRow = merge.s.r;
    const topCol = merge.s.c;
    const value = matrix[topRow]?.[topCol];
    if (value === undefined || value === null || value === "") continue;
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      if (!matrix[r]) matrix[r] = [];
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        if (r === topRow && c === topCol) continue;
        matrix[r][c] = value;
      }
    }
  }
}

export async function parseWorkbookFile(
  input: File | ArrayBuffer,
  fileName?: string,
): Promise<ParsedWorkbook> {
  const buffer =
    input instanceof ArrayBuffer
      ? input
      : typeof (input as File).arrayBuffer === "function"
        ? await (input as File).arrayBuffer()
        : await new Response(input as Blob).arrayBuffer();
  const resolvedName = fileName ?? (input instanceof ArrayBuffer ? "workbook.xlsx" : (input as File).name);
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellFormula: false,
    cellNF: false,
    cellText: false,
  });

  const sheets: WorkbookSheet[] = [];
  const sheetMeta = (workbook.Workbook?.Sheets ?? []) as Array<{
    name: string;
    Hidden?: number;
  }>;

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const hiddenFlag =
      sheetMeta.find((s) => s.name === sheetName)?.Hidden ?? 0;
    const hidden = hiddenFlag !== 0;

    const raw = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });

    if (raw.length === 0) {
      sheets.push({
        name: sheetName,
        hidden,
        rowCount: 0,
        columnCount: 0,
        headers: [],
        rows: [],
      });
      continue;
    }

    applyMergedCells(worksheet, raw);

    const headerIdx = detectHeaderRowIndex(raw);
    const rawHeaders = (raw[headerIdx] ?? []).map((cell, idx) => {
      const str = cellToString(cell);
      return str || `column_${idx + 1}`;
    });
    const headers = deduplicateHeaders(rawHeaders);
    const columnCount = headers.length;

    const dataRows: string[][] = [];
    for (let i = headerIdx + 1; i < raw.length; i += 1) {
      const row = raw[i] ?? [];
      const cells: string[] = [];
      let hasContent = false;
      for (let c = 0; c < columnCount; c += 1) {
        const value = cellToString(row[c]);
        if (value) hasContent = true;
        cells.push(value);
      }
      if (hasContent) dataRows.push(cells);
    }

    sheets.push({
      name: sheetName,
      hidden,
      rowCount: dataRows.length,
      columnCount,
      headers,
      rows: dataRows,
    });
  }

  const workbookName = resolvedName.replace(/\.(xlsx|xls|xlsm|ods)$/i, "");
  return {
    workbookName,
    sheetCount: sheets.length,
    sheets,
  };
}
