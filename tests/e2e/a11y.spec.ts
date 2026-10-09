import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { as, e2eEnabled } from "./helpers";

test.skip(!e2eEnabled(), "needs the test Supabase project (.env.test)");

// Automated accessibility scan (WCAG A/AA rules incl. colour contrast) in light and dark mode.
for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe: ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const path of ["/dashboard", "/creatives", "/creatives?view=kanban", "/channels/general", "/notifications", "/settings/notifications"]) {
      test(`${path} has no serious violations`, async ({ browser }) => {
        const { page, context } = await as(browser, "admin", { colorScheme: scheme });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
        await context.close();
      });
    }
  });
}

test("login page has no serious violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
