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
page.on("pageerror", error => console.error("Browser error:", error.message));
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
const savedMessages = [], savedFiles = [], storedBytes = new Map();
const workspaceRows = Object.fromEntries(["contacts", "labels", "templates", "signatures", "filters", "events", "settings", "message_labels"].map(key => [key, []]));
let sendAttempts = 0;
let aiPayload, uncertainSend = false;
let downloadBody = Buffer.from("Contract test");
let failUpload = false;
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
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (req.method() === "DELETE") {
      if (failCleanup) return fulfill({ message: "Draft cleanup denied" }, 403);
      for (let i = savedMessages.length - 1; i >= 0; i--) if (savedMessages[i].id === id) savedMessages.splice(i, 1);
      for (let i = savedFiles.length - 1; i >= 0; i--) if (savedFiles[i].message_id === id) savedFiles.splice(i, 1);
      return fulfill({});
    }
    if (req.method() === "POST") {
      messageWrites++;
      const body = req.postDataJSON(); savedMessages.push(...(Array.isArray(body) ? body : [body]).map(row => ({ created_at: new Date().toISOString(), from_name: "Alex", is_starred: false, ...row })));
      return fulfill({});
    }
    let rows = [...(includeDraft ? [mail, draft] : [mail]), ...savedMessages];
    if (id) rows = rows.filter(row => row.id === id);
    return fulfill(req.headers().accept?.includes("vnd.pgrst.object") ? rows[0] || null : rows);
  }
  if (url.pathname === "/rest/v1/frankiflow_mail_accounts") return fulfill([account, shared]);
  if (url.pathname === "/rest/v1/frankiflow_mail_attachments") {
    if (req.method() === "POST") {
      const body = req.postDataJSON(); savedFiles.push(...(Array.isArray(body) ? body : [body])); return fulfill({});
    }
    attachmentReads++;
    if (failIndex && url.searchParams.get("select") === "message_id") return fulfill({ message: "Index unavailable" }, 503);
    const id = url.searchParams.get("message_id")?.replace(/^eq\./, "");
    const rows = [{ id: "file-1", message_id: mail.id, filename: "contract.txt", content_type: "text/plain", size_bytes: 13, storage_path: "test/contract.txt" }, ...savedFiles];
    return fulfill(id && !id.startsWith("in.(") ? rows.filter(row => row.message_id === id) : rows);
  }
  const bucketPath = "/storage/v1/object/frankiflow-mail-attachments";
  if (url.pathname === bucketPath && req.method() === "DELETE") {
    for (const path of req.postDataJSON().prefixes) storedBytes.delete(path);
    return fulfill([]);
  }
  if (url.pathname.startsWith(bucketPath + "/")) {
    const path = decodeURIComponent(url.pathname.slice(bucketPath.length + 1));
    if (req.method() === "POST") {
      if (failUpload) return fulfill({ message: "Upload interrupted" }, 503);
      const form = await new Response(req.postDataBuffer(), { headers: { "content-type": req.headers()["content-type"] } }).formData();
      const file = [...form.values()].find(value => typeof value !== "string");
      storedBytes.set(path, Buffer.from(await file.arrayBuffer()));
      return fulfill({ Key: path, Id: "test-object" });
    }
    if (storedBytes.has(path)) return route.fulfill({ status: 200, contentType: "application/octet-stream", body: storedBytes.get(path) });
    if (failDownload) return fulfill({ message: "Original attachment download denied" }, 403);
    return route.fulfill({ status: 200, contentType: "text/plain", body: downloadBody });
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/")) return failSign
    ? fulfill({ message: "Storage permission denied" }, 403)
    : fulfill({ signedURL: url.pathname.replace("/storage/v1", "") + "?token=sample" });
  if (url.pathname === "/functions/v1/send-mail") {
    sendAttempts++;
    sentPayload = req.postDataJSON();
    if (uncertainSend) return fulfill({ error: "Provider status is unknown. Check delivery before retrying.", delivery_unconfirmed: true }, 503);
    if (failSend)
      return fulfill({ error: "Transport is temporarily unavailable" }, 503);
    return fulfill({ message_id: mail.id, warning: serverWarning });
  }
  if (url.pathname === "/functions/v1/mail-ai") {
    aiPayload = req.postDataJSON();
    return fulfill({ ok: true, subject: "Reviewed assistant suggestion", html: '<p><strong>Polished text</strong></p><img src=x onerror="window.__aiXss=true"><script>window.__aiXss=true</script>' });
  }
  const kind = url.pathname.match(/^\/rest\/v1\/frankiflow_mail_(contacts|labels|templates|signatures|filters|events|settings|message_labels)$/)?.[1];
  if (kind) {
    const records = workspaceRows[kind], id = url.searchParams.get("id")?.replace(/^eq\./, "");
    let result;
    if (["POST", "PATCH"].includes(req.method())) {
      const body = req.postDataJSON(), row = Array.isArray(body) ? body[0] : body;
      const old = records.find(value => value.id === (row.id || id) || kind === "settings" && value.user_id === row.user_id);
      if (old) Object.assign(old, row); else records.push(row);
      result = old || row;
    } else if (req.method() === "DELETE") {
      const index = records.findIndex(value => value.id === id); if (index >= 0) records.splice(index, 1);
      result = null;
    } else result = req.headers().accept?.includes("vnd.pgrst.object") ? records[0] || null : records;
    return fulfill(req.headers().accept?.includes("vnd.pgrst.object") ? result : Array.isArray(result) ? result : result ? [result] : []);
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
    .getByRole("combobox", { name: "To", exact: true })
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
    await page.getByRole("combobox", { name: "To", exact: true }).inputValue(),
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

  await page.locator(".row-content").filter({ hasText: mail.subject }).click();
  await page.getByRole("button", { name: "Reply all", exact: true }).click();
  failSend = false;
  await page.getByRole("textbox", { name: "Message body", exact: true }).fill("A reply saved before delivery");
  await page.getByRole("button", { name: "Close and save draft", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(savedMessages[0].thread_id, mail.thread_id);
  assert.equal(savedMessages[0].in_reply_to, mail.provider_message_id);
  await page.getByRole("navigation", { name: "Mail folders" }).getByRole("button", { name: /^Drafts/ }).click();
  await page.locator(".row-content").filter({ hasText: `Re: ${mail.subject}` }).click();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(sentPayload.thread_id, mail.thread_id);
  assert.equal(sentPayload.in_reply_to, mail.provider_message_id);
  console.log("PASS saved authenticated reply drafts preserve thread and reply headers when reopened and sent");
  await page.locator(".row-content").filter({ hasText: mail.subject }).click();

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
    .getByRole("combobox", { name: "To", exact: true })
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

  downloadBody = Buffer.from("Bad");
  await page.locator(".row-content").filter({ hasText: mail.subject }).click();
  await page.getByRole("button", { name: "Forward with attachments", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "could not be downloaded completely" }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  downloadBody = Buffer.from("Contract test");
  console.log("PASS forwarding rejects truncated downloads before opening or sending an incomplete message");

  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page
    .getByRole("combobox", { name: "To", exact: true })
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
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(savedMessages.length, 1);
  const durableId = savedMessages[0].id;
  assert.ok(savedFiles[0].storage_path.startsWith(`${account.id}/${durableId}/`));
  assert.deepEqual([...storedBytes.get(savedFiles[0].storage_path)], [1, 2, 128, 255]);
  await page.reload();
  await page.getByRole("navigation", { name: "Mail folders" }).getByRole("button", { name: /^Drafts/ }).click();
  await page.locator(".row-content").filter({ hasText: "Recover authenticated attachment" }).click();
  await page.getByRole("button", { name: "Remove device.bin", exact: true }).waitFor();
  failUpload = true;
  await page.getByRole("textbox", { name: "Subject", exact: true }).fill("Keep original if replacement upload fails");
  await page.getByRole("button", { name: "Close and save draft", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").filter({ hasText: "Upload interrupted" }).waitFor();
  assert.ok(savedMessages.some(row => row.id === durableId), "Original draft survives replacement failure");
  await page.getByRole("button", { name: "Remove device.bin", exact: true }).waitFor();
  failUpload = false;
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.deepEqual([...Buffer.from(sentPayload.attachments[0].content, "base64")], [1, 2, 128, 255]);
  assert.equal(savedMessages.length, 0);
  assert.equal(storedBytes.size, 0, "Sending removes the superseded draft's file objects");
  console.log("PASS authenticated drafts upload exact file bytes, reopen after reload, retain originals on failed replacement and clean up after delivery");

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
  await page.getByRole("combobox", { name: "To", exact: true }).fill("recipient@example.com");
  await page.getByRole("textbox", { name: "Message body" }).fill("Preserve the server delivery warning");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("alert").filter({ hasText: serverWarning }).waitFor();
  console.log("PASS backend post-delivery warnings remain visible after refresh without encouraging another send");
  serverWarning = "";
  await page.locator(".sidebar-tools").getByRole("button", { name: "Contacts", exact: true }).click();
  const tools = page.getByRole("dialog", { name: "Workspace tools" });
  await tools.getByRole("button", { name: "New contact", exact: true }).click();
  await tools.getByRole("textbox", { name: "Contact email", exact: true }).fill("native@example.com");
  await tools.getByRole("textbox", { name: "Contact name", exact: true }).fill("Native saved contact");
  await tools.getByRole("button", { name: "Save", exact: true }).click();
  await tools.locator(".tools-form").waitFor({ state: "detached" });
  assert.equal(workspaceRows.contacts[0].email, "native@example.com");
  assert.equal(workspaceRows.contacts[0].created_by, undefined, "Contacts use the actual schema");
  await tools.getByRole("navigation", { name: "Workspace tools" }).getByRole("button", { name: "Signatures", exact: true }).click();
  await tools.getByRole("button", { name: "New signature", exact: true }).click();
  await tools.getByRole("textbox", { name: "Signature name", exact: true }).fill("Server signature");
  await tools.getByRole("textbox", { name: "Saved signature body", exact: true }).fill("Saved team signature");
  await tools.getByRole("button", { name: "Save", exact: true }).click();
  await tools.locator(".tools-form").waitFor({ state: "detached" });
  assert.equal(workspaceRows.signatures[0].user_id, user.id);
  await tools.getByRole("button", { name: "Close Workspace tools", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page.getByRole("button", { name: "Insert saved content", exact: true }).click();
  await page.getByRole("combobox", { name: "Insert contact", exact: true }).selectOption("native@example.com");
  await page.getByRole("combobox", { name: "Insert saved signature", exact: true }).selectOption({ label: "Server signature" });
  assert.equal(await page.getByRole("combobox", { name: "To", exact: true }).inputValue(), "native@example.com");
  assert.match(await page.getByRole("textbox", { name: "Rich message body", exact: true }).innerText(), /Saved team signature/);
  console.log("PASS native contacts and server signatures use existing authenticated tables and survive reload");
  await page.getByRole("button", { name: "Writing assistant", exact: true }).click();
  const assistant = page.getByRole("dialog", { name: "Writing assistant" });
  await assistant.getByRole("textbox", { name: "Writing instructions", exact: true }).fill("Improve this message");
  await assistant.getByRole("button", { name: "Create suggestion", exact: true }).click();
  await assistant.getByRole("button", { name: "Insert suggestion", exact: true }).click();
  assert.equal(aiPayload.action, "improve");
  const editor = page.getByRole("textbox", { name: "Rich message body", exact: true });
  assert.match(await editor.innerHTML(), /<strong>Polished text<\/strong>/);
  assert.doesNotMatch(await editor.innerHTML(), /onerror|<script/);
  assert.equal(await page.evaluate(() => window.__aiXss), undefined);
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBr8AAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Inline image file", { exact: true }).setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: image });
  await editor.locator("img").waitFor();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.match(sentPayload.html, /src="cid:/);
  assert.match(sentPayload.archive_html, /src="data:image\/png;base64,/);
  assert.equal(sentPayload.attachments[0].contentType, "image/png");
  assert.ok(sentPayload.attachments[0].contentId);
  assert.deepEqual(Buffer.from(sentPayload.attachments[0].content, "base64"), image);
  console.log("PASS writing suggestions are sanitized and inline image bytes use CID delivery with readable archived HTML");
  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page.getByRole("combobox", { name: "To", exact: true }).fill("uncertain@example.com");
  await page.getByRole("textbox", { name: "Subject", exact: true }).fill("Protect against duplicate delivery");
  uncertainSend = true;
  const attemptsBefore = sendAttempts;
  await page.getByRole("dialog").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await page.getByRole("dialog").getByRole("alert").filter({ hasText: "Check the provider delivery status before retrying" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Send message", exact: true }).isDisabled(), true);
  assert.equal(sendAttempts, attemptsBefore + 1, "Simultaneous submits must reach the provider only once");
  await page.getByRole("button", { name: "Close and save draft", exact: true }).click();
  await page.getByRole("dialog").getByRole("alert").filter({ hasText: "Check delivery status before saving" }).waitFor();
  await page.getByText("Draft saved on this device", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Resume draft", exact: false }).click();
  assert.equal(await page.getByRole("button", { name: "Send message", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Discard message", exact: true }).click();
  uncertainSend = false;
  savedMessages.push({ ...draft, id: "66666666-6666-4666-8666-666666666666", subject: "Archived uncertain delivery", direction: "outbound" });
  await page.getByRole("button", { name: "Refresh mailbox", exact: true }).click();
  await page.getByRole("navigation", { name: "Mail folders" }).getByRole("button", { name: /^Drafts/ }).click();
  await page.locator(".row-content").filter({ hasText: "Archived uncertain delivery" }).click();
  assert.equal(await page.getByRole("button", { name: "Send message", exact: true }).isDisabled(), true);
  console.log("PASS uncertain delivery prevents duplicate sends, survives recovery and cannot be saved as an unguarded draft");

} catch (error) {
  await page.screenshot({ path: "test-results/contract-failure.png", fullPage: true });
  console.error("Visible state:", (await page.locator("body").innerText()).slice(-2000));
  throw error;
} finally {
  await browser.close();
}
