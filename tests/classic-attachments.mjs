import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.BASE_URL || "http://127.0.0.1:8128";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
  serviceWorkers: "block",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(
  await readFile(new URL("./classic-client.js", import.meta.url), "utf8"),
);
await context.route("**/assets/supabase-client.js", (route) =>
  route.fulfill({
    contentType: "text/javascript",
    body: "export const supabase=globalThis.__mailTest.client;",
  }),
);
await context.route("https://*.supabase.co/**", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ configured: false, supported: false }),
  }),
);
await context.route("https://fonts.googleapis.com/**", (route) =>
  route.fulfill({ contentType: "text/css", body: "" }),
);
await context.route("https://fonts.gstatic.com/**", (route) => route.abort());
await context.route("https://frankiflow.de/**", (route) => route.abort());
await page.exposeFunction("__writeAttachmentFixture", async (path, data) => {
  const { resolve, dirname } = await import("node:path");
  const root = resolve("test-results/file-downloads"),
    file = resolve(root, path);
  if (!file.startsWith(`${root}/`))
    throw new Error("Invalid synthetic fixture path");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(data, "base64"));
});
const sentNav = () => page.locator('[data-folder="sent"]').first().click();
const sentCard = () =>
  page.locator('#reader .thread-card[data-message-id="sent"]');
let checks = 0;
function pass(text) {
  checks++;
  console.log(`PASS ${text}`);
}
async function compose(subject) {
  await page.locator("#composeMain").click();
  await page.locator("#cTo").fill("client@example.com");
  await page.locator("#cSubject").fill(subject);
  await page.locator("#cEditor").fill("Sent with a verifiable attachment.");
}
try {
  await page.goto(base);
  await page.locator(".mail-row").first().waitFor();
  await sentNav();
  await page.locator('.mail-row[data-id="sent"]').click();
  await sentCard()
    .getByRole("button", { name: "Download sent-receipt.txt", exact: true })
    .waitFor();
  await page
    .locator('#reader .thread-card[data-message-id="inbound"]')
    .getByRole("button", { name: "Download incoming-invoice.txt", exact: true })
    .waitFor();
  assert.equal(
    await sentCard().getByText("incoming-invoice.txt", { exact: true }).count(),
    0,
  );
  pass(
    "Sent attachments load despite a stale flag and stay on the correct thread message",
  );
  await page.locator("#readerStar").click();
  await sentCard()
    .getByRole("button", { name: "Download sent-receipt.txt", exact: true })
    .waitFor();
  pass("reader rerender after starring keeps Sent attachments visible");
  await page.locator("#search").fill("has:attachment");
  await page.locator('.mail-row[data-id="sent"]').waitFor();
  assert.ok(
    await page.locator('.mail-row[data-id="sent"] .row-icons').textContent(),
  );
  await page.locator("#search").fill("");
  pass(
    "Sent attachment search and paperclip use stored metadata when the message flag is stale",
  );
  await page.evaluate(() => {
    window.__mailTest.signError = true;
  });
  await sentCard()
    .getByRole("button", { name: "Download sent-receipt.txt", exact: true })
    .click();
  await sentCard()
    .getByRole("alert")
    .filter({ hasText: "This file could not be opened" })
    .waitFor();
  assert.equal(
    await sentCard().getByText("sent-receipt.txt", { exact: true }).count(),
    1,
  );
  await page.evaluate(() => {
    window.__mailTest.signError = false;
  });
  const downloaded = page.waitForEvent("download");
  await sentCard()
    .getByRole("button", { name: "Download sent-receipt.txt", exact: true })
    .click();
  const receipt = await downloaded;
  assert.equal(
    await readFile(await receipt.path(), "utf8"),
    "Receipt from Sent",
  );
  pass(
    "expired/denied signed URLs show an error and a fresh retry downloads exact bytes",
  );
  await page.evaluate(() => {
    window.__mailTest.metadataError = true;
  });
  await page.locator("#readerStar").click();
  await sentCard()
    .getByRole("alert")
    .filter({ hasText: "Attachments could not be loaded" })
    .waitFor();
  await page.evaluate(() => {
    window.__mailTest.metadataError = false;
  });
  await sentCard()
    .getByRole("button", { name: "Retry attachments", exact: true })
    .click();
  await sentCard()
    .getByRole("button", { name: "Download sent-receipt.txt", exact: true })
    .waitFor();
  pass("metadata failures are visible and Retry restores the attachment list");
  await page.evaluate(() => {
    window.__mailTest.tables.frankiflow_mail_messages.find(
      (row) => row.id === "sent",
    ).has_attachments = true;
    window.__mailTest.tables.frankiflow_mail_attachments =
      window.__mailTest.tables.frankiflow_mail_attachments.filter(
        (row) => row.message_id !== "sent",
      );
  });
  await page.locator("#refreshBtn").click();
  await page.locator('.mail-row[data-id="sent"]').click();
  await sentCard()
    .getByText(/no saved files were returned/)
    .waitFor();
  pass(
    "messages claiming attachments without stored files display a diagnostic instead of silently hiding them",
  );
  await compose("Binary file preparation failure");
  const bytes = Buffer.from([0, 255, 1, 254, 128, 195, 188]);
  await page
    .locator("#fileInput")
    .setInputFiles({
      name: "binary-proof.bin",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
  await page.evaluate(() => {
    window.__originalArrayBuffer = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async () => {
      throw new Error("Simulated file read failure");
    };
  });
  await page.locator("#sendNow").click();
  await page
    .getByText(/Could not prepare email: Simulated file read failure/)
    .waitFor();
  assert.equal(await page.locator("#sendNow").isEnabled(), true);
  assert.equal(
    await page.locator("#cEditor").getAttribute("contenteditable"),
    "true",
  );
  await page.evaluate(() => {
    File.prototype.arrayBuffer = window.__originalArrayBuffer;
    window.__mailTest.failSend = true;
  });
  await page.locator("#sendNow").click();
  await page.getByText(/Send failed: Transport unavailable/).waitFor();
  assert.equal(await page.locator("#sendNow").isEnabled(), true);
  assert.equal(
    await page.locator("#attachmentList .file-pill").filter({hasText:"binary-proof.bin"}).count(),
    1,
  );
  pass(
    "transport failure preserves the attachment and re-enables Send for retry",
  );
  await page.evaluate(() => {
    window.__mailTest.failSend = false;
  });
  await page.locator("#sendNow").click();
  await page.locator(".composer").waitFor({ state: "detached" });
  const payload = await page.evaluate(() => window.__mailTest.payloads.at(-1));
  assert.deepEqual(
    Buffer.from(payload.attachments[0].content, "base64"),
    bytes,
  );
  await sentNav();
  await page
    .locator(".mail-row")
    .filter({ hasText: "Binary file preparation failure" })
    .click();
  await page
    .getByRole("button", { name: "Download binary-proof.bin", exact: true })
    .waitFor();
  const fileWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download binary-proof.bin", exact: true })
    .click();
  assert.deepEqual(await readFile(await (await fileWait).path()), bytes);
  pass(
    "file read failures unlock the composer and retry sends and archives the original binary bytes",
  );
  await page.evaluate(() => {
    window.__mailTest.draftDelay = 1200;
    window.__mailTest.draftStarted = false;
    window.__mailTest.events = [];
  });
  await compose("Autosave must finish before delivery");
  await page.waitForFunction(() => window.__mailTest.draftStarted);
  await page.locator("#sendNow").click();
  await page.locator(".composer").waitFor({ state: "detached" });
  const lifecycle = await page.evaluate(() => ({
    events: window.__mailTest.events,
    drafts: window.__mailTest.tables.frankiflow_mail_messages.filter(
      (row) =>
        row.direction === "draft" &&
        row.subject === "Autosave must finish before delivery",
    ),
  }));
  assert.ok(
    lifecycle.events.indexOf("draft-save") < lifecycle.events.indexOf("send"),
  );
  assert.equal(lifecycle.drafts.length, 0);
  pass("in-flight autosave finishes before send and leaves no ghost draft");
  await page.evaluate(() => {
    window.__mailTest.draftDelay = 0;
    window.__mailTest.draftStarted = false;
  });
  await compose("Cleanup warning after delivery");
  await page.waitForFunction(() => window.__mailTest.draftStarted);
  await page.evaluate(() => {
    window.__mailTest.failDraftCleanup = true;
    window.__mailTest.failContacts = true;
  });
  await page.locator("#sendNow").click();
  await page.locator(".composer").waitFor({ state: "detached" });
  await page
    .getByText(/Email sent, but the old draft could not be removed/)
    .waitFor();
  await page.getByText(/contacts could not be updated/).waitFor();
  pass(
    "post-send cleanup failures do not turn a successful delivery into Send failed",
  );
  const callbacksSynchronous = await page.evaluate(() =>
    window.__mailTest.authCallbacks.every(
      (callback) =>
        !(
          callback("TOKEN_REFRESHED", {
            access_token: "synthetic-session",
            user: { id: "user", email: "person@example.com" },
          }) instanceof Promise
        ),
    ),
  );
  assert.equal(callbacksSynchronous, true);
  pass(
    "Supabase auth callbacks do not await database work while the auth lock is held",
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/classic-attachments.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  pass("no browser JavaScript errors");
  console.log(`${checks} classic-mail regression checks passed`);
} catch (error) {
  console.error("Browser errors:", errors);
  console.error((await page.locator("body").innerText()).slice(0, 2500));
  throw error;
} finally {
  await browser.close();
}
