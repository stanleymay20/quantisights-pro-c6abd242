import { test, expect, type Page } from "@playwright/test";
import axe from "axe-core";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.CLIENT_ACCEPTANCE_BASE_URL || "http://127.0.0.1:4173";
const STATE = process.env.CLIENT_ACCEPTANCE_STATE || "tests/client-acceptance/.state.json";
if (!existsSync(STATE)) throw new Error(`Missing client-acceptance state at ${STATE}`);

const state = JSON.parse(readFileSync(STATE, "utf8"));
const customers = state.customers as Record<string, { email: string; password: string; tier: string }>;

const growthRoutes = [
  "/simulations",
  "/forecasting",
  "/advisory",
  "/causal-inference",
  "/benchmarking",
  "/alert-playbooks",
  "/okrs",
  "/aicis-sync",
];
const enterpriseRoutes = [
  "/lineage",
  "/market-intelligence",
  "/cognitive-bias",
  "/counterfactual",
  "/branching",
  "/sso",
];
const coreRoutes = ["/dashboard", "/decisions", "/data-catalog", "/reports", "/settings", "/billing"];

async function login(page: Page, tier: "starter" | "growth" | "enterprise") {
  const customer = customers[tier];
  expect(customer, `missing ${tier} fixture`).toBeTruthy();
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(customer.email);
  await page.getByLabel(/password/i).fill(customer.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
}

async function expectUsableRoute(page: Page, path: string) {
  const serverErrors: string[] = [];
  const pageErrors: string[] = [];
  const onResponse = (response: any) => {
    if (response.url().startsWith(BASE) && response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  };
  const onPageError = (error: Error) => pageErrors.push(error.message);
  page.on("response", onResponse);
  page.on("pageerror", onPageError);
  await page.goto(`${BASE}${path}`);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).not.toContainText(/your current access level doesn't include this capability/i);
  await expect(page.locator("body")).not.toContainText(/something went wrong|application error|unexpected error/i);
  expect(serverErrors, `${path} returned server errors`).toEqual([]);
  expect(pageErrors, `${path} raised browser errors`).toEqual([]);
  page.off("response", onResponse);
  page.off("pageerror", onPageError);
}

async function expectLockedRoute(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).toContainText(/your current access level doesn't include this capability/i);
  await expect(page.getByRole("button", { name: /see what's included/i })).toBeVisible();
}

async function assertNoCriticalA11y(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (window as any).axe.run(document, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return result.violations
      .filter((v: any) => v.impact === "critical")
      .map((v: any) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
  });
  expect(violations, `critical accessibility violations: ${JSON.stringify(violations)}`).toEqual([]);
}

test("public buyer surface matches in-app commercial tiers", async ({ page }) => {
  await page.goto(`${BASE}/pricing`);
  await expect(page.locator("body")).toContainText("Essentials");
  await expect(page.locator("body")).toContainText("Governance");
  await expect(page.locator("body")).toContainText("Enterprise");
  await expect(page.locator("body")).toContainText("€499");
  await expect(page.locator("body")).toContainText("€1,999");
  await expect(page.locator("body")).toContainText(/3 data connectors|live data connectors/i);
  await assertNoCriticalA11y(page);
});

test.describe("Essentials customer", () => {
  test.beforeEach(async ({ page }) => login(page, "starter"));

  test("core paid experience is usable", async ({ page }) => {
    for (const route of coreRoutes) await expectUsableRoute(page, route);
    await page.goto(`${BASE}/dashboard`);
    await page.screenshot({ path: "artifacts/client-acceptance/essentials-dashboard.png", fullPage: true });
    await assertNoCriticalA11y(page);
  });

  test("Governance and Enterprise capabilities remain honestly locked", async ({ page }) => {
    for (const route of [...growthRoutes, ...enterpriseRoutes]) await expectLockedRoute(page, route);
  });
});

test.describe("Governance customer", () => {
  test.beforeEach(async ({ page }) => login(page, "growth"));

  test("core and Governance capabilities are usable", async ({ page }) => {
    for (const route of [...coreRoutes, ...growthRoutes]) await expectUsableRoute(page, route);
    await page.goto(`${BASE}/simulations`);
    await page.screenshot({ path: "artifacts/client-acceptance/governance-simulations.png", fullPage: true });
  });

  test("Enterprise-only capabilities remain locked with upgrade guidance", async ({ page }) => {
    for (const route of enterpriseRoutes) await expectLockedRoute(page, route);
  });
});

test.describe("Enterprise customer", () => {
  test.beforeEach(async ({ page }) => login(page, "enterprise"));

  test("all paid route tiers are reachable", async ({ page }) => {
    for (const route of [...coreRoutes, ...growthRoutes, ...enterpriseRoutes]) await expectUsableRoute(page, route);
    await page.goto(`${BASE}/market-intelligence`);
    await page.screenshot({ path: "artifacts/client-acceptance/enterprise-market-intelligence.png", fullPage: true });
    await assertNoCriticalA11y(page);
  });
});
