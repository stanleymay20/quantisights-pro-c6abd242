import { test, expect } from "@playwright/test";
import axe from "axe-core";
import { readFileSync } from "node:fs";

const BASE = process.env.CLIENT_ACCEPTANCE_BASE_URL || "http://127.0.0.1:4173";
const STATE = process.env.CLIENT_ACCEPTANCE_STATE || "tests/client-acceptance/.state.json";
const state = JSON.parse(readFileSync(STATE, "utf8"));
const leadEmail = `${state.run_tag}@quantivis.test`;

async function assertAccessible(page: import("@playwright/test").Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (window as any).axe.run(document, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return result.violations
      .filter((v: any) => v.impact === "critical" || v.impact === "serious")
      .map((v: any) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 10).map((node: any) => node.target),
      }));
  });
  expect(violations, `serious/critical accessibility violations: ${JSON.stringify(violations)}`).toEqual([]);
}

test("registration gives consistent pilot and password guidance", async ({ page }) => {
  await page.goto(`${BASE}/register?pilot=1`);
  const body = page.locator("body");
  await expect(body).toContainText(/30 days of Governance access/i);
  await expect(body).toContainText(/No payment card/i);
  await expect(body).toContainText(/No automatic renewal/i);

  const password = page.getByLabel(/^Password$/i);
  await password.fill("Short1!");
  await expect(body).toContainText(/At least 12 characters/i);
  await expect(page.getByRole("button", { name: /create account/i })).toBeDisabled();

  await password.fill("Client-Ready-2026!");
  await expect(page.getByRole("button", { name: /create account/i })).toBeEnabled();
  await expect(page.getByRole("link", { name: /^Terms$/i }).first()).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: /Privacy Policy/i }).first()).toHaveAttribute("href", "/privacy");
  await assertAccessible(page);
});

test("paid-plan registration ribbon matches current commercial offer", async ({ page }) => {
  await page.goto(`${BASE}/register?plan=starter`);
  await expect(page.locator("body")).toContainText(/Essentials — €499\/mo/i);
  await expect(page.locator("body")).toContainText(/14-day trial/i);

  await page.goto(`${BASE}/register?plan=growth`);
  await expect(page.locator("body")).toContainText(/Governance — €1,999\/mo/i);
  await expect(page.locator("body")).toContainText(/14-day trial/i);
});

test("procurement, legal and competitive trust pages resolve publicly", async ({ page }) => {
  const routes = [
    ["/trust", /trust|security/i],
    ["/security", /security/i],
    ["/procurement-pack", /procurement/i],
    ["/dpa", /data processing|dpa/i],
    ["/ai-governance", /ai act|governance/i],
    ["/privacy", /privacy/i],
    ["/terms", /terms/i],
    ["/subprocessors", /sub[- ]?processor/i],
    ["/impressum", /impressum/i],
    ["/competitive-analysis", /50 competitors and alternatives/i],
  ] as const;

  for (const [path, expected] of routes) {
    const response = await page.goto(`${BASE}${path}`);
    expect(response?.status(), `${path} response status`).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body"), `${path} content`).toContainText(expected);
    await expect(page.locator("body")).not.toContainText(/page not found|something went wrong|application error/i);
  }
});

test("competitive analysis gives a buyer-safe 50-vendor market map", async ({ page }) => {
  await page.goto(`${BASE}/competitive-analysis`);
  const body = page.locator("body");
  await expect(body).toContainText(/50 vendors reviewed/i);
  await expect(body).toContainText(/AI governance/i);
  await expect(body).toContainText(/Decision intelligence/i);
  await expect(body).toContainText(/Adjacent enterprise platform/i);
  await expect(body).toContainText("Credo AI");
  await expect(body).toContainText("OneTrust AI Governance");
  await expect(body).toContainText("Aera Technology");
  await expect(body).toContainText("FICO");
  await expect(body).toContainText("Palantir");
  await expect(body).toContainText(/Choose Quantivis when/i);
  await expect(body).toContainText(/Choose them when/i);
  await expect(body).toContainText(/Do not oversell/i);
  await assertAccessible(page);
});

test("homepage demo request creates a real staging lead and confirms success", async ({ page }) => {
  await page.goto(`${BASE}/#demo`);
  await expect(page.getByLabel(/Full name/i)).toBeVisible();
  await expect(page.getByLabel(/Work email/i)).toBeVisible();
  await expect(page.getByLabel(/Company/i)).toBeVisible();
  await page.getByLabel(/Full name/i).fill("Client Acceptance Reviewer");
  await page.getByLabel(/Work email/i).fill(leadEmail);
  await page.getByLabel(/Company/i).fill("Quantivis Acceptance Test");
  await page.getByLabel(/What are you trying to govern/i).fill(`Automated client acceptance ${state.run_tag}`);
  await page.getByRole("button", { name: /Request a Demo/i }).click();
  await expect(page.locator("body")).toContainText(/Request received/i, { timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText(/Something went wrong/i);
});

test("registration and competitive analysis remain usable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/register?pilot=1`);
  await expect(page.getByRole("heading", { name: /Create your workspace/i })).toBeVisible();
  await expect(page.getByLabel(/Full name/i)).toBeVisible();
  await expect(page.getByLabel(/Work email/i)).toBeVisible();
  await expect(page.getByLabel(/^Password$/i)).toBeVisible();
  await assertAccessible(page);

  await page.goto(`${BASE}/competitive-analysis`);
  await expect(page.getByRole("heading", { name: /Quantivis governs the decision itself/i })).toBeVisible();
  await expect(page.locator("body")).toContainText(/50 vendors reviewed/i);
  await assertAccessible(page);
});
