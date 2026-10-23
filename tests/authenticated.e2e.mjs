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
  text_body: "Contract test",
  folder: "sent",
  direction: "outbound",
  is_read: true,
  is_starred: false,
  has_attachments: false,
  created_at: new Date().toISOString(),
};
const account = {
  id: "22222222-2222-4222-8222-222222222222",
  address: "alex@example.com",
  display_name: "Alex",
  is_primary: true,
};
let sentPayload,
  failSend = true,
  failSign = true,
  attachmentReads = 0;
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
  if (url.pathname === "/rest/v1/frankiflow_mail_messages")
    return fulfill([mail]);
  if (url.pathname === "/rest/v1/frankiflow_mail_accounts")
    return fulfill([account]);
  if (url.pathname === "/rest/v1/frankiflow_mail_attachments") {
    attachmentReads++;
    return fulfill([
      {
        id: "file-1",
        filename: "contract.txt",
        content_type: "text/plain",
        size_bytes: 13,
        storage_path: "test/contract.txt",
      },
    ]);
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
    return fulfill({ message_id: mail.id });
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
  await page.getByRole("button", { name: "New message" }).click();
  await page
    .getByRole("textbox", { name: "To", exact: true })
    .fill("emma@example.com");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Contract test");
  await page
    .getByRole("textbox", { name: "Message body" })
    .fill("Attached bytes");
  await page
    .locator("input[type=file]")
    .setInputFiles({
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
} finally {
  await browser.close();
}
