import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto(`${base}/demo`);
  const manifest = await (await context.request.get(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.start_url, "/");
  for (const icon of manifest.icons) assert.equal((await context.request.get(new URL(icon.src, base).href)).status(), 200);
  const script = await context.request.get(`${base}/sw-v2.js`);
  assert.match(script.headers()["cache-control"], /no-cache|no-store/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw-v2.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  });
  assert.deepEqual(await page.evaluate(() => caches.keys()), []);
  await context.setOffline(true);
  await page.goto(base);
  await page.getByRole("heading", { name: "You’re offline.", exact: true }).waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /emma@example.com|A fresh direction/);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "Sign in to your workspace", exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => caches.keys()), []);
  console.log("PASS installable icons, uncached worker, private-data-free offline screen and online sign-in recovery");
} finally { await browser.close(); }
