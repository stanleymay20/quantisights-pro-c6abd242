import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("'AI Boardroom' nav entry (audit: near-exact duplicate of Deliberation)", () => {
  // AIBoardroom.tsx renders <Deliberation variant="boardroom" />, and
  // Deliberation.tsx's variantCopy only swaps header eyebrow/title/
  // description text -- it never changes the underlying query, filters, or
  // list content. The page is architecturally meant to be reached with a
  // ?decision=<id> URL param to scope to one decision, but the sidebar
  // linked to the bare /ai-boardroom route with no id, and nothing else in
  // the app ever links to it with a decision context -- so every real
  // visit rendered the identical generic queue Deliberation already shows.
  // Removed the redundant top-level nav entry; the route/component itself
  // is untouched for if/when a real contextual entry point gets built.
  it("no longer has its own top-level sidebar entry", () => {
    const source = read("src/components/dashboard/DashboardSidebar.tsx");
    expect(source).not.toContain('label: "AI Boardroom"');
    expect(source).not.toContain('"AI Boardroom": "sidebar.ai_boardroom"');
  });

  it("Deliberation sidebar entry is still present (the one real feature both pages render)", () => {
    const source = read("src/components/dashboard/DashboardSidebar.tsx");
    expect(source).toContain('label: "Deliberation",     path: "/deliberation"');
  });
});
