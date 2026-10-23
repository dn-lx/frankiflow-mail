import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let externalRequests = [];
page.on("request", (r) => {
  if (r.url().includes("supabase.co")) externalRequests.push(r.url());
});
let checks = 0;
const pass = (text) => {
  checks++;
  console.log(`PASS ${text}`);
};
try {
  // An expired sample auth session must not trigger token refresh on /demo.
  await page.addInitScript(() => {
    if (location.pathname !== "/demo") return;
    localStorage.setItem(
      "sb-bdeajozhylypiidrldka-auth-token",
      JSON.stringify({
        access_token: "expired-test-token",
        refresh_token: "test-refresh",
        expires_at: 1,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: "test-user" },
      }),
    );
  });
  await page.goto(`${base}/demo`);
  await page.getByRole("heading", { name: "Inbox", exact: false }).waitFor();
  await page
    .getByRole("button", { name: /Emma Wilson.*A fresh direction/ })
    .click();
  await page
    .getByRole("button", { name: "Download Campaign brief.txt" })
    .waitFor();
  pass("sample inbox and attachment reader render");
  await page.getByRole("button", { name: "Close message" }).click();
  await page
    .getByRole("button", { name: /Emma Wilson.*A fresh direction/ })
    .click();
  await page
    .getByRole("button", { name: "Download Campaign brief.txt" })
    .waitFor();
  pass("attachment remains visible after reopening same conversation");
  await page.getByRole("button", { name: "New message" }).click();
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("recipient@example.com");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Attachment regression — sent folder");
  await page
    .getByRole("textbox", { name: "Message body" })
    .fill("An attached document should remain available after sending.");
  await page.locator("input[type=file]").setInputFiles({
    name: "résumé.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Attachment payload: Grüße 👋"),
  });
  await page.getByRole("button", { name: "Send in demo" }).click();
  const attachment = page.getByRole("button", { name: "Download résumé.txt" });
  await attachment.waitFor();
  const downloadWait = page.waitForEvent("download");
  await attachment.click();
  const download = await downloadWait;
  assert.equal(download.suggestedFilename(), "résumé.txt");
  assert.equal(
    await readFile(await download.path(), "utf8"),
    "Attachment payload: Grüße 👋",
  );
  pass(
    "compose → attach → send → Sent → download preserves exact UTF-8 content",
  );
  await page.reload();
  await page
    .getByRole("navigation", { name: "Mail folders" })
    .getByRole("button", { name: /^Sent/ })
    .click();
  await page
    .getByRole("button", {
      name: /To: recipient@example.com.*Attachment regression/,
    })
    .click();
  await page.getByRole("button", { name: "Download résumé.txt" }).waitFor();
  pass("sent attachment persists after full reload");
  await page
    .getByRole("textbox", { name: "Search mail" })
    .fill("has:attachment subject:regression");
  assert.equal(await page.locator(".message-row").count(), 1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "New message" }).click();
  await page.getByRole("textbox", { name: "To", exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Send in demo" }).click();
  await page
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "Enter valid email" })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("A saved draft");
  await page
    .getByRole("textbox", { name: "Message body" })
    .fill("Draft body stays intact");
  await page.getByRole("button", { name: "Close and save draft" }).click();
  await page
    .getByRole("navigation", { name: "Mail folders" })
    .getByRole("button", { name: /^Drafts/ })
    .click();
  await page
    .locator(".row-content")
    .filter({ hasText: "A saved draft" })
    .click();
  assert.equal(
    await page.getByRole("textbox", { name: "Message body" }).inputValue(),
    "Draft body stays intact",
  );
  await page.getByRole("button", { name: "Discard message" }).click();
  pass("search operators, invalid recipient handling, save and reopen draft");
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.getByRole("switch", { name: "Dark appearance" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("switch", { name: "Compact message list" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  assert.equal(await page.locator(".workspace.compact").count(), 1);
  await page.reload();
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.locator(".workspace.compact").waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page
    .getByRole("navigation", { name: "Mail folders" })
    .getByRole("button", { name: /^Inbox/ })
    .click();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  pass("theme and density settings persist");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Mail folders" })
    .getByRole("button", { name: /^Sent/ })
    .click();
  await page
    .getByRole("button", {
      name: /To: recipient@example.com.*Attachment regression/,
    })
    .click();
  await page.getByRole("button", { name: "Download résumé.txt" }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  pass(
    "mobile navigation and attachment reader at 390px without horizontal overflow",
  );
  assert.deepEqual(externalRequests, []);
  pass("demo never requests live Supabase data");
  await page.evaluate(() =>
    localStorage.removeItem("sb-bdeajozhylypiidrldka-auth-token"),
  );
  await page.goto(base);
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  assert.equal(await page.locator(".message-row").count(), 0);
  pass("real mailbox requires login");
  assert.deepEqual(errors, []);
  pass("no browser JavaScript errors");

  // Exercise the classic-reader regression against a real DOM and reordered API results.
  if (!process.env.SKIP_LEGACY) {
    const source = await readFile("assets/enhancements.js", "utf8");
    const start = source.indexOf("async function enhanceReader() {");
    const end = source.indexOf("\nfunction dialogEmail", start);
    await page.setContent(
      '<div id="reader" class="open"><div class="thread-card" data-message-id="second"><div class="thread-body" data-ff-rich="1"></div></div><div class="thread-card" data-message-id="first"><div class="thread-body" data-ff-rich="1"></div></div></div>',
    );
    await page.evaluate(
      (source) => {
        window.attachmentCalls = [];
        window.qs = (s, r = document) => r.querySelector(s);
        window.qsa = (s, r = document) => [...r.querySelectorAll(s)];
        window.readerEnhancementBusy = false;
        window.mailDb = {
          from: () => ({
            select: () => ({
              in: async () => ({
                data: [{ id: "first" }, { id: "second" }],
                error: null,
              }),
            }),
          }),
        };
        window.renderAttachments = async (body, id) => {
          body.textContent = `Attachment for ${id}`;
          window.attachmentCalls.push(id);
        };
        window.renderHtmlInto = () => {};
        window.eval(source + "; window.enhanceReader = enhanceReader;");
      },
      source.slice(start, end),
    );
    await page.evaluate(() => window.enhanceReader());
    assert.equal(
      await page.locator(".thread-card").first().textContent(),
      "Attachment for second",
    );
    await page.evaluate(() => {
      const panel = document.querySelector("#reader");
      panel.innerHTML = panel.innerHTML.replaceAll(
        'data-ff-attachments="1"',
        "",
      );
      return window.enhanceReader();
    });
    assert.deepEqual(await page.evaluate(() => window.attachmentCalls), [
      "second",
      "first",
      "second",
      "first",
    ]);
    pass(
      "classic reader matches by ID and reloads attachments after identical DOM rerender",
    );
  }
  console.log(`${checks} browser checks passed against ${base}`);
} finally {
  await browser.close();
}
