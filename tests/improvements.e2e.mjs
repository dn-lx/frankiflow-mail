import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const nav = (name) =>
  page
    .getByRole("navigation", { name: "Mail folders" })
    .getByRole("button", { name: new RegExp(`^${name}`) });
const row = (subject) =>
  page.locator(".row-content").filter({ hasText: subject });
async function download(name) {
  const wait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: `Download ${name}`, exact: true })
    .click();
  return readFile(await (await wait).path());
}
try {
  await page.goto(`${base}/demo`);
  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill('"Wilson, Emma" <emma@example.com>');
  await page.getByRole("button", { name: "Cc / Bcc", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Cc", exact: true })
    .fill("team@example.com");
  await page
    .getByRole("textbox", { name: "Bcc", exact: true })
    .fill("hidden@example.com");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Recover an unsent attachment");
  await page
    .getByRole("textbox", { name: "Message body" })
    .fill("This text and the binary attachment must survive a reload.");
  const bytes = Buffer.from([0, 255, 1, 254, 128, 195, 188]);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "recovered.bin",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
  await page.getByText("Draft saved on this device", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Resume draft", exact: false })
    .click();
  assert.equal(
    await page.getByRole("textbox", { name: "To", exact: true }).inputValue(),
    '"Wilson, Emma" <emma@example.com>',
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Bcc", exact: true }).inputValue(),
    "hidden@example.com",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Message body" }).inputValue(),
    "This text and the binary attachment must survive a reload.",
  );
  await page
    .getByRole("button", { name: "Remove recovered.bin", exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Message body" })
    .press("Control+Enter");
  await page
    .getByRole("button", { name: "Download recovered.bin", exact: true })
    .waitFor();
  assert.deepEqual(await download("recovered.bin"), bytes);
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Resume draft", exact: false })
      .count(),
    0,
  );
  console.log(
    "PASS device recovery restores recipients, Bcc, body and exact file bytes; successful send clears recovery",
  );

  await nav("Sent").click();
  await row("Recover an unsent attachment").click();
  await page
    .getByRole("button", { name: "Forward with attachments", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("forward@example.com");
  await page
    .getByRole("button", { name: "Remove recovered.bin", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Send in demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Download recovered.bin", exact: true })
    .waitFor();
  assert.deepEqual(await download("recovered.bin"), bytes);
  console.log(
    "PASS forwarding automatically includes original attachment bytes",
  );

  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("draft@example.com");
  await page.getByRole("button", { name: "Cc / Bcc", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Bcc", exact: true })
    .fill("draft-hidden@example.com");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Draft with files");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "draft.bin",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
  await page
    .getByRole("button", { name: "Close and save draft", exact: true })
    .click();
  await nav("Drafts").click();
  await row("Draft with files").click();
  await page
    .getByRole("button", { name: "Remove draft.bin", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "Bcc", exact: true }).inputValue(),
    "draft-hidden@example.com",
  );
  await page.getByRole("button", { name: "Send in demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Download draft.bin", exact: true })
    .waitFor();
  assert.deepEqual(await download("draft.bin"), bytes);
  console.log(
    "PASS saved demo drafts retain attachments and Bcc when reopened and sent",
  );

  await nav("Inbox").click();
  await row("A fresh direction").click();
  await page
    .getByRole("button", { name: "Archive message", exact: true })
    .click();
  assert.equal(await row("A fresh direction").count(), 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await row("A fresh direction").waitFor();
  await row("A fresh direction").click();
  await page
    .getByRole("button", { name: "Move message to trash", exact: true })
    .click();
  await nav("Trash").click();
  await row("A fresh direction").click();
  await page
    .getByRole("button", { name: "Restore message to Inbox", exact: true })
    .click();
  await nav("Inbox").click();
  await row("A fresh direction").waitFor();
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("frankiflow-demo-v2")).find((m) =>
      m.subject.includes("A fresh direction"),
    ),
  );
  assert.equal(restored.folder, "inbox");
  assert.equal(restored.trashed_at, null);
  console.log(
    "PASS archive Undo and trash Restore return messages and clear trash expiration",
  );

  await row("A fresh direction").click();
  await page.getByRole("button", { name: "Reply all", exact: true }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "To", exact: true }).inputValue(),
    "emma@example.com",
  );
  if (!(await page.getByRole("textbox", { name: "Cc", exact: true }).count()))
    await page.getByRole("button", { name: "Cc / Bcc", exact: true }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Cc", exact: true }).inputValue(),
    "",
  );
  await page
    .getByRole("textbox", { name: "Message body" })
    .fill("Discard this recovery record");
  await page.getByText("Draft saved on this device", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Discard message", exact: true })
    .click();
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Resume draft", exact: false })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS reply-all excludes our own address; discarding removes the device recovery copy",
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/improvements-desktop.png",
    fullPage: true,
  });
  console.log("5 compose recovery and mailbox action checks passed");
} finally {
  await browser.close();
}
