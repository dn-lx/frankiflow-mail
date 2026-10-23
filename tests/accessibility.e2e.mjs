import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage(), reports = [];
async function audit(name) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  reports.push({ name, passedRules: result.passes.length, violations: result.violations });
  console.log(`${result.violations.length ? "FAIL" : "PASS"} accessibility ${name}: ${result.passes.length} rules passed; ${result.violations.map(v => `${v.id} (${v.nodes.length})`).join(", ") || "no violations"}`);
}
try {
  await page.goto(`${base}/demo`); await audit("light Inbox");
  await page.locator(".row-content").first().click(); await audit("message reader");
  await page.getByRole("button", { name: "New message", exact: false }).click(); await audit("plain composer");
  await page.getByRole("button", { name: "Rich text", exact: true }).click(); await audit("rich composer");
  await page.getByRole("button", { name: "Discard message", exact: true }).click();
  await page.getByRole("button", { name: "Open settings", exact: true }).click(); await page.getByText("Reading, accounts & notifications", { exact: true }).click(); await audit("expanded settings");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.locator(".sidebar-tools").getByRole("button", { name: "Contacts", exact: true }).click();
  await page.getByRole("button", { name: "New contact", exact: true }).click(); await audit("contact form");
  await page.getByRole("navigation", { name: "Workspace tools" }).getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "New event", exact: true }).click(); await audit("calendar form");
  await page.getByRole("button", { name: "Close Workspace tools", exact: true }).click();
  await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
  await page.locator('html[data-theme="dark"]').waitFor(); await audit("dark reader");
  await page.setViewportSize({ width: 390, height: 844 }); await audit("mobile dark reader");
  await page.goto(base); await audit("sign-in");
} finally {
  await mkdir("test-results", { recursive: true }); await writeFile("test-results/accessibility.json", JSON.stringify(reports, null, 2));
  await browser.close();
}
const issues = reports.flatMap(report => report.violations.map(v => ({ screen: report.name, id: v.id, elements: v.nodes.map(n => n.target) })));
assert.equal(issues.length, 0, `${issues.length} accessibility violations; details in test-results/accessibility.json`);
console.log(`10 screens passed WCAG 2.1 AA automated checks`);
