import { expect, test } from "@playwright/test";
import { PNG, as, e2eEnabled, openCreative } from "./helpers";

test.skip(!e2eEnabled(), "needs the test Supabase project (.env.test)");

const TITLE = `E2E hero ${Date.now()}`;

// One creative travels through the whole workflow, each role acting in its own browser session.
test.describe.serial("request -> upload -> approve -> sent to ads -> live", () => {
  test("admin creates a request", async ({ browser }) => {
    const { page, context } = await as(browser, "admin");
    await page.goto("/creatives/new");
    await page.getByLabel("Title").fill(TITLE);
    await page.getByLabel("Campaign / product").fill("E2E campaign");
    await page.getByLabel("Date to be submitted").fill("2030-12-31");
    await page.getByLabel("Brief").fill("Make it pop");
    await page.getByRole("button", { name: "Create request" }).click();
    await expect(page.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
    await expect(page.getByText("Requested").first()).toBeVisible();
    await context.close();
  });

  test("creative uploads a file and it becomes Submitted", async ({ browser }) => {
    const { page, context } = await as(browser, "creative");
    await openCreative(page, TITLE);
    await page.locator('input[type="file"]').first().setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("New version uploaded")).toBeVisible();
    await expect(page.getByText("Submitted").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /v1/ })).toBeVisible();
    // the creative team cannot edit DP fields
    await expect(page.getByLabel("Is it live?")).toHaveCount(0);
    await context.close();
  });

  test("admin approves and sends to ads", async ({ browser }) => {
    const { page, context } = await as(browser, "admin");
    await openCreative(page, TITLE);
    for (const status of ["Approved", "Sent to ads"]) {
      await page.getByLabel("Move to status").selectOption({ label: status });
      await page.getByRole("button", { name: "Update" }).click();
      await expect(page.getByText("Status updated")).toBeVisible();
    }
    await expect(page.getByText("Sent to ads").first()).toBeVisible();
    await context.close();
  });

  test("ads cannot jump the queue, then takes it live with required details", async ({ browser }) => {
    const { page, context } = await as(browser, "ads");
    await openCreative(page, TITLE);
    // only live / paused / rejected / changes requested are offered
    const options = await page.getByLabel("Move to status").locator("option").allTextContents();
    expect(options).not.toContain("Approved");
    await page.getByLabel("Move to status").selectOption({ label: "Live" });
    await page.getByRole("button", { name: "Update" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Go live" }).click(); // link is required
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Meta Ads preview link").fill("https://fb.me/e2e");
    await dialog.getByRole("button", { name: "Go live" }).click();
    await expect(page.getByText("Marked live")).toBeVisible();
    await expect(page.getByText("Live").first()).toBeVisible();
    await context.close();
  });

  test("kanban shows the card in Live and respects permissions", async ({ browser }) => {
    const { page, context } = await as(browser, "creative", { viewport: { width: 1280, height: 800 } });
    await page.goto("/creatives?view=kanban&q=" + encodeURIComponent(TITLE));
    const live = page.getByRole("region", { name: "Live column" });
    await expect(live.getByText(TITLE)).toBeVisible();
    // a creative cannot move it: no "Move to" menu is offered on a Live card
    await expect(live.getByLabel(new RegExp(`Move ${TITLE} to`))).toHaveCount(0);
    await context.close();
  });

  test("activity timeline shows who did what", async ({ browser }) => {
    const { page, context } = await as(browser, "admin");
    await openCreative(page, TITLE);
    await page.getByRole("tab", { name: /Timeline/ }).click();
    await expect(page.getByText("uploaded v1")).toBeVisible();
    await expect(page.getByText(/set live state Not live → Live/)).toBeVisible();
    await context.close();
  });
});
