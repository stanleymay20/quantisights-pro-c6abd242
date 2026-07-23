import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Dashboard crash regression: duplicate notifications realtime channel", () => {
  // Root cause: GlobalContextBar (rendered on every protected route via
  // ProtectedShell) and DashboardHeader (rendered only by the Dashboard
  // page) both call useNotifications(orgId, datasetId), which subscribes to
  // an identical Supabase Realtime channel name (notifications:${orgId}:${datasetId}).
  // GlobalContextBar computed an `isDashboard` flag specifically to avoid
  // this collision but never used it to gate the render, so on /dashboard
  // both components subscribed to the same channel — the second one to run
  // its effect called .on() on an already-subscribed channel object, which
  // throws synchronously and trips the page's error boundary on every load.

  it("GlobalContextBar gates GlobalNotificationBell behind isDashboard", () => {
    const source = read("src/components/layout/GlobalContextBar.tsx");
    expect(source).toContain("const isDashboard");
    expect(source).toMatch(/\{!isDashboard\s*&&\s*\(\s*<GlobalNotificationBell/);
  });

  // Separately, org/dataset-scoped realtime hooks (useNotifications,
  // useSubscription, useIntelligenceInbox, useInterventions,
  // useNarrativeFusion, useExecutionPlans, useExecutiveIntelligence,
  // useMetrics, DecisionComments) each subscribe to a channel name derived
  // only from ids, with no defense against two mounted instances colliding.
  // createSafeChannel(...) (src/lib/realtime-channel.ts) closes that gap by
  // giving every call a unique topic suffix, wrapped in try/catch so a
  // Realtime failure can never crash the calling route.
  it("realtime-channel.ts provides a collision-proof channel helper", () => {
    const source = read("src/lib/realtime-channel.ts");
    expect(source).toMatch(/export function createSafeChannel/);
    expect(source).toMatch(/randomUUID|Date\.now/);
  });
});
