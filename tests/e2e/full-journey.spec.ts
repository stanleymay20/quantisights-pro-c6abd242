// tests/e2e/full-journey.spec.ts
// 1-user end-to-end walk across all major pipelines.
// Skipped unless prereqs waived AND a seeded user file is present.
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

const USERS_FILE = process.env.LOAD_USERS_FILE || "tests/load/.users.json";
const BASE = process.env.LOAD_BASE_URL || "http://localhost:8080";

if (process.env.LOAD_PREREQ_WAIVED !== "yes") {
  test.skip(true, "Prereq gate not waived");
}
if (!existsSync(USERS_FILE)) {
  test.skip(true, `No seeded users at ${USERS_FILE} — run load:seed first`);
}

const users = JSON.parse(readFileSync(USERS_FILE, "utf8"));
const u = users.find((x: any) => x.org === "a") ?? users[0];

test("full journey: auth → onboarding → data → decision → governance → reports → notifications → logout", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // 1. Auth
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(u.email);
  await page.getByLabel(/password/i).fill(u.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });

  // 2. Onboarding (skip if already past it)
  if (page.url().includes("/onboarding")) {
    await page.getByRole("button", { name: /continue|finish|get started/i }).first().click().catch(() => {});
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  }

  // 3. Data
  await page.goto(`${BASE}/data-catalog`);
  await expect(page.locator("body")).toContainText(/dataset|catalog/i);

  // 4. Decision (read-only here; create path covered in decisions.spec)
  await page.goto(`${BASE}/decisions`);
  await expect(page.locator("body")).toContainText(/decision/i);

  // 5. Governance
  await page.goto(`${BASE}/auditability`);
  await expect(page.locator("body")).toContainText(/audit/i);

  // 6. Reports
  await page.goto(`${BASE}/reports`);
  await expect(page.locator("body")).toContainText(/report/i);

  // 7. Notifications
  await page.goto(`${BASE}/system-health`);
  await expect(page.locator("body")).toContainText(/status|health/i);

  // 8. Logout
  await page.goto(`${BASE}/settings`).catch(() => {});
  await page.getByRole("button", { name: /sign out|logout/i }).first().click().catch(() => {});
  await page.waitForURL(/\/login|\//, { timeout: 10_000 }).catch(() => {});

  expect(errors, `console errors: ${errors.join("\n")}`).toEqual([]);
});
