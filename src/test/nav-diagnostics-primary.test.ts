import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sidebar = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/DashboardSidebar.tsx"),
  "utf8",
);

describe("diagnostics navigation", () => {
  it("places Diagnostics under the primary Operations section", () => {
    const operationsStart = sidebar.indexOf('label: "Operations"');
    const reportsStart = sidebar.indexOf('label: "Reports"', operationsStart);
    const operationsBlock = sidebar.slice(operationsStart, reportsStart);

    expect(operationsBlock).toContain('label: "Diagnostics"');
    expect(operationsBlock).toContain('path: "/diagnostics"');
  });

  it("does not duplicate Diagnostics in the Advanced Labs section", () => {
    const labsStart = sidebar.indexOf('label: "Labs"');
    const adminStart = sidebar.indexOf('label: "Admin"', labsStart);
    const labsBlock = sidebar.slice(labsStart, adminStart);

    expect(labsBlock).not.toContain('label: "Diagnostics"');
    expect((sidebar.match(/path: "\/diagnostics"/g) ?? []).length).toBe(1);
  });
});
