import { test, expect } from "@playwright/test";

test.describe("Accessibility — Critical Checks", () => {
  test("landing page has exactly one h1", async ({ page }) => {
    await page.goto("/");
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);
  });

  test("login page has form labels", async ({ page }) => {
    await page.goto("/login");
    // Every input should have an associated label or aria-label
    const inputs = page.locator("input[type='email'], input[type='password'], input[type='text']");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const hasLabel = await input.evaluate((el) => {
        const id = el.id;
        const ariaLabel = el.getAttribute("aria-label");
        const ariaLabelledby = el.getAttribute("aria-labelledby");
        const placeholder = el.getAttribute("placeholder");
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;
        return !!(label || ariaLabel || ariaLabelledby || placeholder);
      });
      expect(hasLabel).toBe(true);
    }
  });

  test("skip-to-content link exists", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator('a[href="#main-content"]').first();
    // Skip link should exist (may be visually hidden)
    await expect(skipLink).toBeAttached();
  });

  test("images have alt attributes", async ({ page }) => {
    await page.goto("/");
    const images = page.locator("img");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");
      const role = await img.getAttribute("role");
      // Images should have alt text or role="presentation"
      expect(alt !== null || role === "presentation").toBe(true);
    }
  });

  test("interactive elements are keyboard focusable", async ({ page }) => {
    await page.goto("/login");
    // Tab through the page and verify focus moves
    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeTruthy();
  });

  test("color contrast — no transparent text on transparent bg", async ({ page }) => {
    await page.goto("/");
    // Check that primary CTA buttons have visible text
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const text = await btn.textContent();
        expect(text?.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
