import { existsSync, readFileSync } from "node:fs";
import { expect, type Browser, type Page } from "@playwright/test";

export type Role = "admin" | "creative" | "ads";
type Users = Partial<Record<Role, { email: string; password: string; name: string }>>;

export const users = (): Users => (existsSync("tests/e2e/.users.json") ? JSON.parse(readFileSync("tests/e2e/.users.json", "utf8")) : {});
export const e2eEnabled = () => Boolean(users().admin);

/** 1x1 transparent PNG, the smallest real image that passes content sniffing. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export async function login(page: Page, role: Role) {
  const u = users()[role]!;
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

/** A fresh, separate browser context signed in as `role` (so several roles can act in one test). */
export async function as(browser: Browser, role: Role, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await login(page, role);
  return { context, page };
}

export async function openCreative(page: Page, title: string) {
  await page.goto("/creatives?q=" + encodeURIComponent(title));
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}
