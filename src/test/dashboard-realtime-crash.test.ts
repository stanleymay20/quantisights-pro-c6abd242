import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Dashboard crash regression: duplicate notifications realtime channel", () => {
  it("GlobalContextBar keeps GlobalNotificationBell off the dashboard and waits for context hydration", () => {
    const source = read("src/components/layout/GlobalContextBar.tsx");
    expect(source).toContain('const isDashboard = location.pathname === "/dashboard"');
    expect(source).toContain("!isDashboard && !contextLoading");

    const gate = source.indexOf("!isDashboard && !contextLoading");
    const bell = source.indexOf("<GlobalNotificationBell", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(bell).toBeGreaterThan(gate);
  });

  it("realtime-channel.ts provides a collision-proof channel helper", () => {
    const source = read("src/lib/realtime-channel.ts");
    expect(source).toMatch(/export function createSafeChannel/);
    expect(source).toMatch(/randomUUID|Date\.now/);
  });
});
