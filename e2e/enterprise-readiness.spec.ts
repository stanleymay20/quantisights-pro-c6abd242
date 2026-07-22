import { test, expect } from "@playwright/test";

const auditedRoutes = [
  "/trust",
  "/security",
  "/how-ai-is-used",
  "/ai-system-classification",
  "/impressum",
  "/pricing",
  "/decision-intelligence-platforms",
];

test.describe("Enterprise readiness", () => {
  test("canonical trust route renders the trust center", async ({ page }) => {
    await page.goto("/trust");
    await expect(page.getByRole("heading", { name: "Trust Center" })).toBeVisible();
  });

  test("legacy trust route redirects to the canonical route", async ({ page }) => {
    await page.goto("/trust-center");
    await expect(page).toHaveURL(/\/trust$/);
  });

  test("procurement routes render unique metadata", async ({ page }) => {
    const titles = new Set<string>();
    const canonicals = new Set<string>();

    for (const route of auditedRoutes) {
      await page.goto(route);
      titles.add(await page.title());
      canonicals.add(
        (await page.locator('link[rel="canonical"]').getAttribute("href")) ?? "",
      );
    }

    expect(titles.size).toBe(auditedRoutes.length);
    expect(canonicals.size).toBe(auditedRoutes.length);
  });

  test("embed endpoint is excluded from indexing", async ({ page }) => {
    await page.goto("/embed");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
  });

  test("browser console has no observability CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (
        message.type() === "error" &&
        /Content Security Policy|posthog|sentry|worker-src/i.test(text)
      ) {
        violations.push(text);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(violations).toEqual([]);
  });

  test("production headers allow observability without weakening framing", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";

    expect(csp).toContain("eu-assets.i.posthog.com");
    expect(csp).toContain("eu.posthog.com");
    expect(csp).toContain("ingest.de.sentry.io");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("status does not mark missing telemetry as healthy", async ({ page }) => {
    await page.goto("/status");

    const awaitingFirstRun = page.getByText("Awaiting first run", { exact: false });
    if ((await awaitingFirstRun.count()) > 0) {
      await expect(
        page.getByRole("heading", { name: "All Systems Operational" }),
      ).toHaveCount(0);
    }
  });
});
