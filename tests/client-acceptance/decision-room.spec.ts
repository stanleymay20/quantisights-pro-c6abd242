import { test, expect, type Page } from "@playwright/test";
import axe from "axe-core";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.CLIENT_ACCEPTANCE_BASE_URL || "http://127.0.0.1:4173";
const STATE = process.env.CLIENT_ACCEPTANCE_STATE || "tests/client-acceptance/.state.json";
if (!existsSync(STATE)) throw new Error(`Missing client-acceptance state at ${STATE}`);

const state = JSON.parse(readFileSync(STATE, "utf8"));
const customers = state.customers as Record<
  string,
  { email: string; password: string; tier: string; org_id?: string; decision_id?: string }
>;

async function login(page: Page, tier: "starter" | "growth" | "enterprise") {
  const customer = customers[tier];
  expect(customer, `missing ${tier} fixture`).toBeTruthy();
  expect(customer.org_id, `missing ${tier} canonical organization fixture`).toBeTruthy();
  expect(customer.decision_id, `missing ${tier} decision-room fixture`).toBeTruthy();
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(customer.email);
  await page.getByLabel(/password/i).fill(customer.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
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
      .map((v: any) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
  });
  expect(violations, `serious/critical accessibility violations: ${JSON.stringify(violations)}`).toEqual([]);
}

for (const tier of ["starter", "growth", "enterprise"] as const) {
  test(`${tier} paid customer can inspect a governed Executive Decision Room`, async ({ page }) => {
    await login(page, tier);
    const customer = customers[tier];
    await page.goto(`${BASE}/decisions/${customer.decision_id}/room`);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Executive Decision Room" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/your current access level doesn't include this capability/i);
    await expect(page.locator("body")).not.toContainText(/something went wrong|application error|unexpected error/i);

    // Resolve tenant/data loading before asserting the business content. If this
    // fails, Playwright now reports the actual Decision Room state instead of a
    // misleading downstream "recommendation text not found" timeout.
    await expect(page.getByText("Preparing the decision room…")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Decision Room unavailable" })).not.toBeVisible();

    await expect(page.getByText(`Renegotiate the primary supplier agreement for ${tier}`)).toBeVisible();
    await expect(page.getByText("72% recorded confidence")).toBeVisible();
    await expect(page.getByText("6/6")).toBeVisible();
    await expect(page.getByText(/Transparent checklist count, not an AI quality score/i)).toBeVisible();
    await expect(page.getByText(/AI-generated synthesis is not source evidence/i)).toBeVisible();
    await expect(page.getByText(/Supplier cost increased 14%/).first()).toBeVisible();
    await expect(page.getByText(/Only stages backed by stored records are marked recorded/i)).toBeVisible();
    await expect(page.getByText(/No alternatives are stored on this decision. Quantivis will not invent them./i)).toBeVisible();

    const decisionVisual = page.getByTestId("decision-visual");
    await expect(decisionVisual).toBeVisible();
    await expect(decisionVisual.getByRole("heading", { name: "Decision Visual" })).toBeVisible();
    await expect(decisionVisual.getByText("Auto-selected")).toBeVisible();
    await expect(decisionVisual.getByText("Predicted net impact", { exact: true })).toBeVisible();
    const recordedValues = decisionVisual.getByTestId("decision-visual-values");
    await expect(recordedValues.getByText("€42,000", { exact: true })).toBeVisible();
    await expect(recordedValues.getByText(/ROI probability/i)).toBeVisible();
    await expect(recordedValues.getByText("68%", { exact: true })).toBeVisible();
    await expect(decisionVisual.getByText(/representation of recorded evidence, not source evidence itself/i)).toBeVisible();
    await decisionVisual.getByText("Why this visualization?").click();
    await expect(decisionVisual.getByText(/chart would add visual machinery without adding meaning/i)).toBeVisible();
    await expect(decisionVisual.getByText(/No ordered time-series points are stored/i)).toBeVisible();

    await expect(page.getByRole("link", { name: "Evidence Pack" })).toHaveAttribute(
      "href",
      `/evidence-pack/${customer.decision_id}`,
    );
    await expect(page.getByRole("link", { name: "Review decision" })).toHaveAttribute(
      "href",
      `/decisions/${customer.decision_id}/review`,
    );
    await expect(decisionVisual.getByRole("link", { name: "Inspect source evidence" })).toHaveAttribute(
      "href",
      `/evidence-pack/${customer.decision_id}`,
    );

    await assertAccessible(page);

    if (tier === "enterprise") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Executive Decision Room" })).toBeVisible();
      await expect(page.getByText("Preparing the decision room…")).toBeHidden({ timeout: 10_000 });
      await expect(page.getByRole("heading", { name: "Decision Room unavailable" })).not.toBeVisible();
      await expect(page.getByRole("link", { name: "Evidence Pack" })).toBeVisible();
      await expect(page.getByTestId("decision-visual")).toBeVisible();
      await page.screenshot({ path: "artifacts/client-acceptance/enterprise-decision-room-mobile.png", fullPage: true });
      await assertAccessible(page);
    }
  });
}
