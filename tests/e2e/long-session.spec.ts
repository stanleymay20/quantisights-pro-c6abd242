// tests/e2e/long-session.spec.ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

if (process.env.LOAD_PREREQ_WAIVED !== "yes") {
  test.skip(true, "Prereq gate not waived");
}

const BASE = process.env.LOAD_BASE_URL || "http://localhost:8080";
const users = JSON.parse(readFileSync(process.env.LOAD_USERS_FILE || "tests/load/.users.json", "utf8"));
const DURATION_MS = Number(process.env.LONG_SESSION_MS || 30 * 60 * 1000);

test.setTimeout(DURATION_MS + 5 * 60 * 1000);

test("long session stability", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const u = users[0];
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(u.email);
  await page.getByLabel(/password/i).fill(u.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 20_000 });

  const baseline = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
  const routes = ["/dashboard", "/decisions", "/auditability", "/kpis", "/insights", "/reports", "/copilot", "/forecasting"];
  const stop = Date.now() + DURATION_MS;
  let loops = 0;
  while (Date.now() < stop) {
    for (const r of routes) {
      await page.goto(`${BASE}${r}`).catch(() => {});
      await page.waitForTimeout(2000);
    }
    loops++;
  }

  const finalMem = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
  console.log(`loops=${loops} memBaseline=${baseline} memFinal=${finalMem}`);
  if (baseline > 0) expect(finalMem).toBeLessThan(baseline * 2);
  const hydrationErrors = errors.filter((e) => /hydration|hydrat/i.test(e));
  expect(hydrationErrors, hydrationErrors.join("\n")).toHaveLength(0);
});
