// tests/e2e/smoke.spec.ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

if (process.env.LOAD_PREREQ_WAIVED !== "yes") {
  test.skip(true, "Prereq gate not waived — fix F-1/F-2 or set LOAD_PREREQ_WAIVED=yes");
}

const BASE = process.env.LOAD_BASE_URL || "http://localhost:8080";
const users = JSON.parse(readFileSync(process.env.LOAD_USERS_FILE || "tests/load/.users.json", "utf8"));
const u = users.find((x: any) => x.org === "a") ?? users[0];

test("smoke: home → login → dashboard → decisions → audit → logout", async ({ page }) => {
  await page.goto(BASE);
  await expect(page).toHaveTitle(/Quantivis/i);

  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(u.email);
  await page.getByLabel(/password/i).fill(u.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });

  await page.goto(`${BASE}/decisions`);
  await expect(page.locator("body")).toContainText(/decision/i);

  await page.goto(`${BASE}/auditability`);
  await expect(page.locator("body")).toContainText(/audit/i);

  await page.getByRole("button", { name: /sign out|logout/i }).click().catch(() => {});
});
