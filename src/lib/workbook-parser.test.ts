import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbookFile } from "./workbook-parser";

function buildWorkbookBuffer(
  sheets: Array<{ name: string; aoa: unknown[][]; hidden?: boolean }>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, aoa }) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  wb.Workbook = {
    Sheets: sheets.map(({ name, hidden }) => ({ name, Hidden: hidden ? 1 : 0 })),
  };
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("workbook parser", () => {
  it("parses a single-sheet XLSX with headers and rows", async () => {
    const buf = buildWorkbookBuffer([
      {
        name: "Sheet1",
        aoa: [
          ["date", "revenue", "region"],
          ["2024-01-01", 1000, "EMEA"],
          ["2024-02-01", 1200, "AMER"],
        ],
      },
    ]);
    const wb = await parseWorkbookFile(buf, "test.xlsx");
    expect(wb.sheetCount).toBe(1);
    expect(wb.sheets[0].headers).toEqual(["date", "revenue", "region"]);
    expect(wb.sheets[0].rowCount).toBe(2);
    expect(wb.sheets[0].rows[0][1]).toBe("1000");
  });

  it("flags hidden sheets and lists all sheets in a multi-sheet workbook", async () => {
    const buf = buildWorkbookBuffer([
      { name: "Summary", aoa: [["metric", "value"], ["a", 1]] },
      { name: "Internal", aoa: [["x", "y"], [1, 2]], hidden: true },
      { name: "Detail", aoa: [["a", "b"], [1, 2]] },
    ]);
    const wb = await parseWorkbookFile(buf, "test.xlsx");
    expect(wb.sheetCount).toBe(3);
    const hidden = wb.sheets.find(s => s.name === "Internal");
    expect(hidden?.hidden).toBe(true);
    const visible = wb.sheets.filter(s => !s.hidden);
    expect(visible.map(s => s.name)).toEqual(["Summary", "Detail"]);
  });

  it("detects header row when title rows precede the table", async () => {
    const buf = buildWorkbookBuffer([
      {
        name: "Report",
        aoa: [
          ["Acme Corp — Q1 Report", "", ""],
          ["", "", ""],
          ["date", "revenue", "cost"],
          ["2024-01-01", 1000, 700],
          ["2024-02-01", 1100, 750],
        ],
      },
    ]);
    const wb = await parseWorkbookFile(buf, "report.xlsx");
    expect(wb.sheets[0].headers).toEqual(["date", "revenue", "cost"]);
    expect(wb.sheets[0].rowCount).toBe(2);
  });

  it("expands merged cells so downstream rows are rectangular", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["region", "month", "revenue"],
      ["EMEA", "Jan", 100],
      ["", "Feb", 110],
      ["", "Mar", 120],
    ]);
    ws["!merges"] = [{ s: { r: 1, c: 0 }, e: { r: 3, c: 0 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parsed = await parseWorkbookFile(buf, "merged.xlsx");
    const rows = parsed.sheets[0].rows;
    expect(rows[0][0]).toBe("EMEA");
    expect(rows[1][0]).toBe("EMEA");
    expect(rows[2][0]).toBe("EMEA");
  });

  it("converts Excel date cells to ISO yyyy-mm-dd", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["date", "revenue"],
      [new Date(Date.UTC(2024, 0, 15)), 1000],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parsed = await parseWorkbookFile(buf, "dates.xlsx");
    expect(parsed.sheets[0].rows[0][0]).toBe("2024-01-15");
  });
});
