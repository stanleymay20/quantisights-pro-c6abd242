import { test, expect } from "@playwright/test";

/**
 * UX-2 executive review flow — mobile layout guard.
 * Runs on the "mobile" Playwright project (iPhone 13 viewport) and asserts
 * that none of the UX-2 surfaces introduce horizontal overflow.
 */

const UX2_PATHS = [
  "/executive-brief",
  "/decisions/demo-decision/review",
  "/decisions/demo-decision/outcome",
];

test.describe("UX-2 review flow — mobile width", () => {
  for (const path of UX2_PATHS) {
    test(`no horizontal overflow at mobile width on ${path}`, async ({ page, isMobile }) => {
      test.skip(!isMobile, "Mobile-only layout guard");

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      // Whether the route renders the flow or redirects to login,
      // the rendered document must never scroll horizontally.
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
