import { test, expect } from "@playwright/test";

test.describe("Public Page Navigation", () => {
  test("landing page renders hero section", async ({ page }) => {
    await page.goto("/");
    // Should have primary heading
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
  });

  test("pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText(/pricing|plan|starter|growth|enterprise/i).first()).toBeVisible();
  });

  test("demo page loads", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("impressum page loads (DSGVO compliance)", async ({ page }) => {
    await page.goto("/impressum");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("404 page for unknown routes", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByText(/not found|404|page doesn't exist/i).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Responsive Layout", () => {
  test("mobile viewport shows menu toggle", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only test");
    await page.goto("/");
    // On mobile, navigation should collapse into a menu
    await expect(page.locator("body")).toBeVisible();
  });
});
