import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("'Decision History' nav item (audit: routed to the same URL as its own parent 'Decisions' page)", () => {
  it("points at /history (the real, distinct feed also reachable under Operations), not /decisions", () => {
    const source = read("src/components/dashboard/DashboardSidebar.tsx");
    expect(source).toContain('{ icon: ClipboardList,  label: "Decision History", path: "/history" }');
  });
});
