// tests/e2e/auth-session.spec.ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

if (process.env.LOAD_PREREQ_WAIVED !== "yes") {
  test.skip(true, "Prereq gate not waived");
}

const BASE = process.env.LOAD_BASE_URL || "http://localhost:8080";
const users = JSON.parse(readFileSync(process.env.LOAD_USERS_FILE || "tests/load/.users.json", "utf8"));

for (let i = 0; i < 10; i++) {
  test(`worker ${i}: login + dashboard`, async ({ page }) => {
    const u = users[i % users.length];
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(u.email);
    await page.getByLabel(/password/i).fill(u.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/);
  });
}
