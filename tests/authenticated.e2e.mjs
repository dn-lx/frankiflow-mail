import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const mail = {
  id: "11111111-1111-4111-8111-111111111111",
  from_name: "Alex",
  from_address: "alex@example.com",
  to_addresses: ["emma@example.com"],
  subject: "Sent attachment with stale flag",
  text_body: "",
  html_body: "<p>Contract <strong>test</strong></p>",
  folder: "sent",
  direction: "outbound",
  is_read: true,
  is_starred: false,
  has_attachments: false,
  created_at: new Date().toISOString(),
  account_id: "44444444-4444-4444-8444-444444444444",
  thread_id: "thread-original",
  provider_message_id: "provider-original",
  cc_addresses: [
    "alex@example.com",
    "info@example.com",
    "colleague@example.com",
  ],
  bcc_addresses: ["hidden@example.com"],
};
const account = {
  id: "22222222-2222-4222-8222-222222222222",
  address: "alex@example.com",
  display_name: "Alex",
  is_primary: true,
};
const shared = {
  id: "44444444-4444-4444-8444-444444444444",
  address: "info@example.com",
  display_name: "Shared mailbox",
};
const draft = {
  ...mail,
  id: "55555555-5555-4555-8555-555555555555",
  folder: "drafts",
  direction: "draft",
  subject: "Server draft cleanup test",
};
let includeDraft = false,
  failCleanup = false,
  failDownload = true,
  messageWrites = 0;
let sentPayload,
  failSend = true,
  failSign = true,
  attachmentReads = 0,
  failIndex = false,
  serverWarning = "";
const user = {
  id: "33333333-3333-4333-8333-333333333333",
  email: account.address,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test-signature`;
await page.route("https://*.supabase.co/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const fulfill = (body, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  if (url.pathname === "/auth/v1/token")
    return fulfill({
      access_token: jwt,
      refresh_token: "sample-refresh",
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
  if (url.pathname === "/auth/v1/user") return fulfill(user);
  if (url.pathname === "/rest/v1/frankiflow_mail_messages") {
    if (req.method() === "DELETE")
      return failCleanup
        ? fulfill({ message: "Draft cleanup denied" }, 403)
        : fulfill({});
    if (req.method() !== "GET") messageWrites++;
    return fulfill(includeDraft ? [mail, draft] : [mail]);
  }
  if (url.pathname === "/rest/v1/frankiflow_mail_accounts")
    return fulfill([account, shared]);
  if (url.pathname === "/rest/v1/frankiflow_mail_attachments") {
    attachmentReads++;
    if (failIndex && url.searchParams.get("select") === "message_id")
      return fulfill({ message: "Index unavailable" }, 503);
    if (url.searchParams.get("message_id") === `eq.${draft.id}`)
      return fulfill([]);
    return fulfill([
      {
        id: "file-1",
        message_id: mail.id,
        filename: "contract.txt",
        content_type: "text/plain",
        size_bytes: 13,
        storage_path: "test/contract.txt",
      },
    ]);
  }
  if (url.pathname.startsWith("/storage/v1/object/frankiflow-mail-attachments/")) {
    if (failDownload)
      return fulfill({ message: "Original attachment download denied" }, 403);
    return route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "Contract test",
    });
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/"))
    return failSign
      ? fulfill({ message: "Storage permission denied" }, 403)
      : fulfill({
          signedURL:
            "/object/sign/frankiflow-mail-attachments/test/contract.txt?token=sample",
        });
  if (url.pathname === "/functions/v1/send-mail") {
    sentPayload = req.postDataJSON();
    if (failSend)
      return fulfill({ error: "Transport is temporarily unavailable" }, 503);
    return fulfill({ message_id: mail.id, warning: serverWarning });
  }
  return fulfill({});
});
try {
  await page.goto(base);
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(account.address);
  await page
    .getByLabel("Password", { exact: true })
    .fill("example-not-a-real-password");
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await page.getByRole("heading", { name: "Inbox", exact: false }).waitFor();
  await page
    .getByRole("navigation", { name: "Mail folders" })
    .getByRole("button", { name: /^Sent/ })
    .click();
  const search = page.getByRole("textbox", { name: "Search mail" });
  await search.fill("has:attachment");
  await page.locator(".row-content").filter({ hasText: mail.subject }).waitFor();
  await search.fill("");
  await page.locator(".row-content").filter({ hasText: mail.subject }).click();
  await page.getByRole("button", { name: "Download contract.txt" }).waitFor();
  assert.ok(attachmentReads >= 1);
  console.log(
    "PASS authenticated sent attachment loads even when has_attachments is false",
  );
  await page.getByRole("button", { name: "Download contract.txt" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Storage permission denied" })
    .waitFor();
  failSign = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "Close message" }).click();
  await page.locator(".row-content").filter({ hasText: mail.subject }).click();
  await page.getByRole("button", { name: "Download contract.txt" }).waitFor();
  assert.ok(attachmentReads >= 2);
  console.log(
    "PASS storage errors are visible and attachments reload after reader remount",
  );
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.getByRole("textbox", { name: "Signature text" }).fill("Alex signature");
  await page.getByRole("button", { name: "Save signature", exact: true }).click();
  await page.getByRole("combobox", { name: "Signature sender" }).selectOption(shared.address);
  assert.equal(await page.getByRole("textbox", { name: "Signature text" }).inputValue(), "");
  await page.getByRole("textbox", { name: "Signature text" }).fill("Shared team signature");
  await page.getByRole("button", { name: "Save signature", exact: true }).click();
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.getByRole("button", { name: "New message" }).click();
  await page.getByRole("button", { name: "Insert signature", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Message body" }).inputValue(), "Alex signature");
  await page.getByRole("combobox", { name: "From", exact: true }).selectOption(shared.address);
  await page.getByRole("textbox", { name: "Message body" }).fill("");
  await page.getByRole("button", { name: "Insert signature", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Message body" }).inputValue(), "Shared team signature");
  await page.getByRole("combobox", { name: "From", exact: true }).selectOption(account.address);
  console.log("PASS sender-specific signatures stay separate for personal and shared mailboxes");
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("emma@example.com");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Contract test");
  await page
    .getByRole("textbox", { name: "Message body" })
    .fill("Attached bytes");
  await page.locator("input[type=file]").setInputFiles({
    name: "bytes.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 255, 1, 254, 128]),
  });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Message body" }).inputValue(),
    "Attached bytes",
  );
  assert.deepEqual(sentPayload.to, ["emma@example.com"]);
  assert.deepEqual(
    [...Buffer.from(sentPayload.attachments[0].content, "base64")],
    [0, 255, 1, 254, 128],
  );
  console.log(
    "PASS Edge Function receives exact binary attachment bytes; failed send preserves composer",
  );
  failSend = false;
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("status").filter({ hasText: "Email sent." }).waitFor();
  console.log(
    "PASS successful authenticated send closes composer and refreshes Sent",
  );
  await page.locator(".row-content").filter({ hasText: mail.subject }).click();
  await page.getByRole("button", { name: "Reply all", exact: true }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "To", exact: true }).inputValue(),
    "emma@example.com",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Cc", exact: true }).inputValue(),
    "colleague@example.com",
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Bcc", exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: "From", exact: true })
      .inputValue(),
    shared.address,
  );
  await page
    .getByRole("textbox", { name: "Message body" })
    .fill("A reply in the original thread");
  failSend = true;
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(sentPayload.thread_id, mail.thread_id);
  assert.equal(sentPayload.in_reply_to, mail.provider_message_id);
  assert.equal(sentPayload.fromAddress, shared.address);
  assert.deepEqual(sentPayload.cc, ["colleague@example.com"]);
  await page
    .getByRole("button", { name: "Discard message", exact: true })
    .click();
  console.log(
    "PASS reply-all preserves shared sender and thread headers while excluding our aliases and original Bcc",
  );

  await page
    .getByRole("button", { name: "Forward with attachments", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Could not forward message" })
    .waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  failDownload = false;
  failSend = false;
  await page
    .getByRole("button", { name: "Forward with attachments", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("forward@example.com");
  assert.match(await page.getByRole("textbox",{name:"Message body"}).inputValue(), /Contract test/);
  await page
    .getByRole("button", { name: "Remove contract.txt", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(
    Buffer.from(sentPayload.attachments[0].content, "base64").toString(),
    "Contract test",
  );
  console.log(
    "PASS authenticated forwarding blocks missing files and preserves downloaded attachment bytes",
  );

  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("recover@example.com");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Recover authenticated attachment");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "device.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.from([1, 2, 128, 255]),
    });
  await page
    .getByRole("button", { name: "Close and save draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume draft", exact: false })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Resume draft", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Remove device.bin", exact: true })
    .waitFor();
  assert.equal(messageWrites, 0);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.deepEqual(
    [...Buffer.from(sentPayload.attachments[0].content, "base64")],
    [1, 2, 128, 255],
  );
  console.log(
    "PASS authenticated attachments recover locally without inventing backend draft-storage APIs",
  );

  includeDraft = true;
  failCleanup = true;
  await page
    .getByRole("button", { name: "Refresh mailbox", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Mail folders" })
    .getByRole("button", { name: /^Drafts/ })
    .click();
  await page.locator(".row-content").filter({ hasText: draft.subject }).click();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page
    .getByRole("alert")
    .filter({ hasText: "Email sent, but the old draft could not be removed" })
    .waitFor();
  await page.getByRole("status").filter({ hasText: "Email sent." }).waitFor();
  console.log(
    "PASS draft-cleanup failure remains visible after refresh and does not report delivery as failed",
  );
  failIndex = true;
  await page.getByRole("button", { name: "Refresh mailbox", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Attachment search could not be refreshed" }).waitFor();
  await page.locator(".row-content").filter({ hasText: mail.subject }).click();
  await page.getByRole("button", { name: "Download contract.txt" }).waitFor();
  failIndex = false;
  await page.getByRole("button", { name: "Close message" }).click();
  await page.getByRole("button", { name: "Refresh mailbox", exact: true }).click();
  await search.fill("has:attachment");
  await page.locator(".row-content").filter({ hasText: mail.subject }).waitFor();
  console.log("PASS attachment index failure leaves mailbox and reader usable; refresh restores attachment search");
  serverWarning = "Email accepted by the provider, but its Sent status could not be updated. Its files are saved in Drafts. Do not resend the email.";
  failCleanup = false;
  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page.getByRole("textbox", { name: "To", exact: true }).fill("recipient@example.com");
  await page.getByRole("textbox", { name: "Message body" }).fill("Preserve the server delivery warning");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("alert").filter({ hasText: serverWarning }).waitFor();
  console.log("PASS backend post-delivery warnings remain visible after refresh without encouraging another send");
} finally {
  await browser.close();
}
