import { expect, test } from "@playwright/test";
import { as, e2eEnabled } from "./helpers";

test.skip(!e2eEnabled(), "needs the test Supabase project (.env.test)");

// Run on the "mobile" project (Pixel 5) and re-checked at the two target widths.
for (const width of [360, 390]) {
  test.describe(`phone ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("bottom navigation, no horizontal scroll on core screens", async ({ browser }) => {
      const { page, context } = await as(browser, "ads", { viewport: { width, height: 800 } });
      const nav = page.getByRole("navigation", { name: "Main" }).last();
      await expect(nav.getByRole("link")).toHaveCount(4);
      for (const path of ["/dashboard", "/creatives", "/channels/general", "/notifications", "/settings/notifications"]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
      await context.close();
    });

    test("tap targets in the bottom nav are at least 44px", async ({ browser }) => {
      const { page, context } = await as(browser, "creative", { viewport: { width, height: 800 } });
      for (const link of await page.getByRole("navigation", { name: "Main" }).last().getByRole("link").all()) {
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      await context.close();
    });

    test("kanban uses the column switcher instead of drag and drop", async ({ browser }) => {
      const { page, context } = await as(browser, "admin", { viewport: { width, height: 800 } });
      await page.goto("/creatives?view=kanban");
      await expect(page.getByRole("tablist", { name: "Workflow column" })).toBeVisible();
      await context.close();
    });
  });
}
