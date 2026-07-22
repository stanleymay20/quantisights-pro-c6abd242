/**
 * Minimal RFC-4180-ish CSV parser for server-side ingestion.
 * Handles: quoted fields, escaped quotes (""), newlines inside quotes,
 * mixed line endings (\r\n, \n).
 *
 * Returns rows as arrays of strings. The first row is treated as the header.
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(input: string): ParsedCsv {
  if (!input || input.length === 0) return { headers: [], rows: [] };

  // Strip BOM
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const allRows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") {
      // handle \r\n
      if (text[i + 1] === "\n") i++;
      row.push(field);
      allRows.push(row);
      field = "";
      row = [];
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      allRows.push(row);
      field = "";
      row = [];
      continue;
    }
    field += ch;
  }

  // Flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    allRows.push(row);
  }

  if (allRows.length === 0) return { headers: [], rows: [] };

  const headers = allRows[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < allRows.length; r++) {
    const data = allRows[r];
    if (data.length === 1 && data[0] === "") continue; // skip empty trailing line
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (data[c] ?? "").trim();
    }
    rows.push(obj);
  }

  return { headers, rows };
}
