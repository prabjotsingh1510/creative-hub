/**
 * Lighthouse (mobile profile) against a PRODUCTION build, with a logged-in session.
 *
 *   1. Put the test project's keys in .env.test and run the e2e once (it creates users in tests/e2e/.users.json),
 *      or set LH_EMAIL / LH_PASSWORD for any existing user.
 *   2. npm run build && npm run start   (never `next dev`: dev mode is far slower and not representative)
 *   3. npm run lighthouse               (LH_BASE=http://localhost:3000 by default)
 *
 * Writes lighthouse-reports/summary.json and prints a table. Add a creative id to LH_CREATIVE to include the detail page.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.LH_BASE ?? "http://localhost:3000";
const port = 9333;
let email = process.env.LH_EMAIL;
let password = process.env.LH_PASSWORD;
if (!email && existsSync("tests/e2e/.users.json")) {
  const u = JSON.parse(readFileSync("tests/e2e/.users.json", "utf8")).admin;
  if (u) ({ email, password } = u);
}

const { default: lighthouse } = await import("lighthouse");
const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
const page = await (await browser.newContext()).newPage();

const pages = [["login (public)", "/login", false]];
if (email) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  pages.push(["dashboard", "/dashboard", true], ["creatives (grid)", "/creatives", true], ["creatives (board)", "/creatives?view=kanban", true]);
  if (process.env.LH_CREATIVE) pages.push(["creative detail", `/creatives/${process.env.LH_CREATIVE}`, true]);
} else {
  console.warn("No login available: only the public login page will be measured.");
}

const rows = [];
for (const [name, path] of pages) {
  const result = await lighthouse(`${base}${path}`, { port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices"], formFactor: "mobile", screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false }, throttlingMethod: "simulate" });
  const lhr = result.lhr;
  const a = lhr.audits;
  rows.push({
    page: name,
    performance: Math.round(lhr.categories.performance.score * 100),
    accessibility: Math.round(lhr.categories.accessibility.score * 100),
    bestPractices: Math.round(lhr.categories["best-practices"].score * 100),
    LCP_s: +(a["largest-contentful-paint"].numericValue / 1000).toFixed(2),
    CLS: +a["cumulative-layout-shift"].numericValue.toFixed(3),
    TBT_ms: Math.round(a["total-blocking-time"].numericValue),
  });
}
await browser.close();
mkdirSync("lighthouse-reports", { recursive: true });
writeFileSync("lighthouse-reports/summary.json", JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
console.table(rows);
