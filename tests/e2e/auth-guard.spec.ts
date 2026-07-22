// tests/e2e/auth-guard.spec.ts
// Verifies protected routes redirect unauthenticated users to /login.
// Runs without seeded users — no LOAD_PREREQ_WAIVED gate needed for redirect probes.
import { test, expect } from "@playwright/test";

const BASE = process.env.LOAD_BASE_URL || "http://localhost:8080";

const PROTECTED = ["/dashboard", "/decisions", "/reports", "/settings", "/admin/governance-audit"];

for (const route of PROTECTED) {
  test(`unauthenticated ${route} → /login`, async ({ page }) => {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    expect(page.url()).toMatch(/\/login/);
  });
}
