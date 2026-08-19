import { test, expect, type Page, type Response, type Request } from "@playwright/test";
import axe from "axe-core";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.CLIENT_ACCEPTANCE_BASE_URL || "http://127.0.0.1:4173";
const STATE = process.env.CLIENT_ACCEPTANCE_STATE || "tests/client-acceptance/.state.json";
const STAGING_SUPABASE_HOST = "cmnihsbdbpubznlkmjbc.supabase.co";
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

const isFirstParty = (url: string) => {
  try {
    const parsed = new URL(url);
    return url.startsWith(BASE) || parsed.hostname === STAGING_SUPABASE_HOST;
  } catch {
    return false;
  }
};

async function login(page: Page, tier: "starter" | "growth" | "enterprise") {
  const customer = customers[tier];
  expect(customer, `missing ${tier} fixture`).toBeTruthy();
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(customer.email);
  await page.getByLabel(/password/i).fill(customer.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText(/multi-factor authentication required/i);
}

async function expectUsableRoute(page: Page, path: string) {
  const serverErrors: string[] = [];
  const requestFailures: string[] = [];
  const pageErrors: string[] = [];
  const onResponse = (response: Response) => {
    if (isFirstParty(response.url()) && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  };
  const onRequestFailed = (request: Request) => {
    const errorText = request.failure()?.errorText ?? "failed";
    if (isFirstParty(request.url()) && errorText !== "net::ERR_ABORTED") {
      requestFailures.push(`${errorText} ${request.url()}`);
    }
  };
  const onPageError = (error: Error) => pageErrors.push(error.message);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("pageerror", onPageError);
  try {
    await page.goto(`${BASE}${path}`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/your current access level doesn't include this capability/i);
    await expect(page.locator("body")).not.toContainText(/something went wrong|application error|unexpected error/i);
    expect(serverErrors, `${path} returned first-party server errors`).toEqual([]);
    expect(requestFailures, `${path} had failed first-party requests`).toEqual([]);
    expect(pageErrors, `${path} raised browser errors`).toEqual([]);
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
    page.off("pageerror", onPageError);
  }
}

async function expectLockedRoute(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).toContainText(/your current access level doesn't include this capability/i);
  await expect(page.getByRole("button", { name: /see what's included/i })).toBeVisible();
}

async function assertAccessible(page: Page) {
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

async function expectPaidPlanPresentation(page: Page, tierName: string) {
  await page.goto(`${BASE}/pricing`);
  await expect(page.locator("body")).toContainText(tierName);
  await expect(page.locator("body")).toContainText(/your plan/i);
  await expect(page.locator("body")).not.toContainText(/pilot access/i);
}

async function expectLogoutWorks(page: Page) {
  await page.goto(`${BASE}/settings`);
  const mobileMenu = page.getByRole("button", { name: /open navigation menu/i });
  const isMobileViewport = (page.viewportSize()?.width ?? 1280) < 768;
  if (isMobileViewport) {
    await expect(mobileMenu).toBeVisible({ timeout: 5_000 });
    await mobileMenu.click();
    await expect(page.getByRole("button", { name: /close navigation/i })).toBeVisible();
  }
  const button = page.getByTestId("sign-out");
  await expect(button).toBeVisible();
  await button.click();
  await page.waitForURL((url) => url.pathname === "/login" || url.pathname === "/", { timeout: 15_000 });
  await page.goto(`${BASE}/dashboard`);
  await expect(page).toHaveURL(/\/login/);
}

test("homepage is commercially honest and source-of-truth aligned", async ({ page }) => {
  await page.goto(BASE);
  const body = page.locator("body");
  await expect(body).toContainText("Essentials");
  await expect(body).toContainText("Governance");
  await expect(body).toContainText("Enterprise");
  await expect(body).toContainText("3 data connectors");
  await expect(body).toContainText(/30-day no-card Governance pilot/i);
  await expect(body).toContainText(/high-risk AI systems/i);
  await expect(body).not.toContainText(/5 enterprise connectors/i);
  await expect(body).not.toContainText(/DAX-listed industrial group/i);
  await expect(body).not.toContainText(/GDPR Compliant/i);
  await expect(body).not.toContainText(/SCIM \+ SSO available when configured/i);
  await page.screenshot({ path: "artifacts/client-acceptance/public-homepage.png", fullPage: true });
  await assertAccessible(page);
});

test("public pricing surface matches in-app commercial tiers", async ({ page }) => {
  await page.goto(`${BASE}/pricing`);
  await expect(page.locator("body")).toContainText("Essentials");
  await expect(page.locator("body")).toContainText("Governance");
  await expect(page.locator("body")).toContainText("Enterprise");
  await expect(page.locator("body")).toContainText("€499");
  await expect(page.locator("body")).toContainText(/€1,?999/);
  await expect(page.locator("body")).toContainText(/3 data connectors|live data connectors/i);
  await assertAccessible(page);
});

test("public buyer surface remains usable on a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/pricing`);
  await expect(page.getByRole("heading", { name: "Essentials", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Governance", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enterprise", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/something went wrong|application error|unexpected error/i);
  await assertAccessible(page);

  await page.goto(BASE);
  await expect(page.getByText("Quantivis", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /request demo/i }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/something went wrong|application error|unexpected error/i);
});

test.describe("Essentials customer", () => {
  test.beforeEach(async ({ page }) => login(page, "starter"));

  test("core paid experience is usable", async ({ page }) => {
    for (const route of coreRoutes) await expectUsableRoute(page, route);
    await expectPaidPlanPresentation(page, "Essentials");
    await page.goto(`${BASE}/dashboard`);
    await page.screenshot({ path: "artifacts/client-acceptance/essentials-dashboard.png", fullPage: true });
    await assertAccessible(page);
  });

  test("Governance and Enterprise capabilities remain honestly locked", async ({ page }) => {
    for (const route of [...growthRoutes, ...enterpriseRoutes]) await expectLockedRoute(page, route);
  });

  test("logout closes the paid session", async ({ page }) => {
    await expectLogoutWorks(page);
  });
});

test.describe("Governance customer", () => {
  test.beforeEach(async ({ page }) => login(page, "growth"));

  test("core and Governance capabilities are usable", async ({ page }) => {
    for (const route of [...coreRoutes, ...growthRoutes]) await expectUsableRoute(page, route);
    await expectPaidPlanPresentation(page, "Governance");
    await page.goto(`${BASE}/simulations`);
    await page.screenshot({ path: "artifacts/client-acceptance/governance-simulations.png", fullPage: true });
    await assertAccessible(page);
  });

  test("Enterprise-only capabilities remain locked with upgrade guidance", async ({ page }) => {
    for (const route of enterpriseRoutes) await expectLockedRoute(page, route);
  });
});

test.describe("Enterprise customer", () => {
  test.beforeEach(async ({ page }) => login(page, "enterprise"));

  test("all paid route tiers are reachable", async ({ page }) => {
    for (const route of [...coreRoutes, ...growthRoutes, ...enterpriseRoutes]) await expectUsableRoute(page, route);
    await expectPaidPlanPresentation(page, "Enterprise");
    await page.goto(`${BASE}/market-intelligence`);
    await page.screenshot({ path: "artifacts/client-acceptance/enterprise-market-intelligence.png", fullPage: true });
    await assertAccessible(page);
  });
});
