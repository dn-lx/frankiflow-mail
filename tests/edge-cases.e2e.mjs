import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const failures = [];
const mail = { id: "edge-message", account_id: "demo-account", thread_id: "edge-thread", provider_message_id: "original-provider-id", from_name: "Taylor", from_address: "taylor@example.com", to_addresses: ["alex@example.com"], subject: "Edge case conversation", text_body: "A test conversation", folder: "inbox", direction: "inbound", is_read: false, is_starred: false, has_attachments: false, created_at: new Date().toISOString() };
const meeting = { id: "edge-event", uid: "edge-event@frankiflow.de", title: "Berlin time regression", start_at: "2026-11-04T09:00:00Z", end_at: "2026-11-04T10:00:00Z", timezone: "Europe/Berlin", required_attendees: ["guest@example.com"], optional_attendees: [], status: "draft", sequence: 0 };
const nav = (page, name) => page.getByRole("navigation", { name: "Mail folders" }).getByRole("button", { name: new RegExp(`^${name}`) });
async function check(name, action, seed = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "UTC", reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage(), errors = [], api = [];
  page.setDefaultTimeout(5000);
  page.on("pageerror", error => errors.push(error.message));
  await context.route("https://*.supabase.co/**", route => { api.push(route.request().url()); return route.abort(); });
  await page.addInitScript(({ messages, tools }) => {
    if (window.top !== window) return;
    if (messages !== undefined) localStorage.setItem("frankiflow-demo-v2", typeof messages === "string" ? messages : JSON.stringify(messages));
    if (tools !== undefined) localStorage.setItem("frankiflow-demo-tools-v2", JSON.stringify(tools));
  }, seed);
  try {
    await page.goto(`${base}/demo`);
    await action(page, context);
    assert.deepEqual(errors, []); assert.deepEqual(api, [], "Demo must not call the live API");
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    await mkdir("test-results/edge-cases", { recursive: true });
    await page.screenshot({ path: `test-results/edge-cases/${failures.length}.png`, fullPage: true, animations: "disabled" }).catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  } finally { await context.close(); }
}
try {
  await check("empty attachments are rejected before compose state changes", async page => {
    await page.getByRole("button", { name: "New message", exact: false }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) });
    assert.equal(await page.getByRole("button", { name: "Remove empty.txt", exact: true }).count(), 0);
    await page.getByRole("dialog").getByRole("alert").filter({ hasText: /empty/i }).waitFor();
  });
  await check("calendar display and prepared mail use the event timezone", async page => {
    await page.locator(".sidebar-tools").getByRole("button", { name: "Calendar", exact: true }).click();
    const card = page.getByRole("dialog", { name: "Workspace tools" }).locator(".tool-card");
    assert.match(await card.innerText(), /10:00/);
    await card.getByRole("button", { name: "Prepare invitation", exact: true }).click();
    assert.match(await page.getByRole("textbox", { name: "Message body", exact: true }).inputValue(), /10:00/);
  }, { tools: { events: [meeting] } });
  await check("meetings with only optional attendees can be addressed and sent", async page => {
    await page.locator(".sidebar-tools").getByRole("button", { name: "Calendar", exact: true }).click();
    await page.getByRole("button", { name: "Prepare invitation", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "To", exact: true }).inputValue(), "guest@example.com");
    assert.equal(await page.getByRole("textbox", { name: "Cc", exact: true }).inputValue(), "other@example.com");
    await page.getByRole("button", { name: "Send in demo", exact: true }).click();
    await page.getByRole("button", { name: /^Download invitation\.ics / }).waitFor();
  }, { tools: { events: [{ ...meeting, required_attendees: [], optional_attendees: ["guest@example.com", "other@example.com"] }] } });
  await check("all-day events require an exclusive end date and export a valid day range", async page => {
    await page.locator(".sidebar-tools").getByRole("button",{name:"Calendar",exact:true}).click();
    await page.getByRole("button",{name:"New event",exact:true}).click();
    await page.getByLabel("Event title",{exact:true}).fill("One-day event regression");
    await page.getByLabel("Event start",{exact:true}).fill("2026-11-04T10:00");await page.getByLabel("Event end",{exact:true}).fill("2026-11-04T11:00");
    await page.getByRole("checkbox",{name:"All day (end date is exclusive)",exact:true}).check();
    await page.getByRole("button",{name:"Save",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"end date after the start date"}).waitFor();
    await page.getByLabel("Event end",{exact:true}).fill("2026-11-05T10:00");await page.getByRole("button",{name:"Save",exact:true}).click();
    const waiting=page.waitForEvent("download");await page.getByRole("button",{name:"Download ICS",exact:true}).click();
    const text=await readFile(await(await waiting).path(),"utf8");assert.match(text,/DTSTART;VALUE=DATE:20261104/);assert.match(text,/DTEND;VALUE=DATE:20261105/);
  });
  await check("reply drafts retain conversation identity through save and reopen", async page => {
    await page.locator(".row-content").filter({ hasText: mail.subject }).click();
    await page.getByRole("button", { name: /Write a thoughtful reply/ }).click();
    await page.getByRole("textbox", { name: "Message body", exact: true }).fill("Reply with a preserved thread");
    await page.getByRole("button", { name: "Close and save draft", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await nav(page, "Drafts").click(); await page.locator(".row-content").filter({ hasText: `Re: ${mail.subject}` }).click();
    await page.getByRole("button", { name: "Send in demo", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    const sent = await page.evaluate(() => JSON.parse(localStorage.getItem("frankiflow-demo-v2")).find(m => m.folder === "sent"));
    assert.equal(sent.thread_id, mail.thread_id);
    assert.equal(sent.in_reply_to, mail.provider_message_id);
  }, { messages: [mail] });
  await check("corrupted sample storage recovers to a usable mailbox", async page => {
    await page.getByRole("button", { name: "New message", exact: false }).waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "New message", exact: false }).click();
    await page.getByRole("textbox", { name: "Message body", exact: true }).fill("Mailbox remains usable");
  }, { messages: "{}" });
  await check("blocked IndexedDB reports recovery failure without breaking composing", async page => {
    await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("Disabled for test", "SecurityError"); } }));
    await page.reload(); await page.getByRole("button", { name: "New message", exact: false }).click();
    await page.getByRole("textbox", { name: "Message body", exact: true }).fill("Keep my text when recovery is unavailable");
    await page.getByRole("dialog").getByRole("alert").filter({ hasText: /recovery is unavailable|could not be saved/i }).waitFor();
    await page.getByRole("button", { name: "Discard message", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
  });
  await check("storage quota failure retains composer and device recovery", async page => {
    await page.getByRole("button", { name: "New message", exact: false }).click();
    await page.getByRole("combobox", { name: "To", exact: true }).fill("guest@example.com");
    await page.getByRole("textbox", { name: "Message body", exact: true }).fill("Must survive failed storage");
    await page.getByText("Draft saved on this device", { exact: true }).waitFor();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === "frankiflow-demo-v2") throw new DOMException("Storage full", "QuotaExceededError"); return original.call(this, key, value); };
    });
    await page.getByRole("button", { name: "Send in demo", exact: true }).click();
    await page.getByRole("dialog").getByRole("alert").filter({ hasText: /storage|space/i }).waitFor({ timeout: 5000 });
    assert.equal(await page.getByRole("textbox", { name: "Message body", exact: true }).inputValue(), "Must survive failed storage");
  });
  await check("HTML reading blocks scripts, forms and tracking images by default", async page => {
    let pixels = 0;
    await page.route("https://tracking.example/**", route => { pixels++; return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }); });
    await page.locator(".row-content").first().click();
    const frame = page.frameLocator('iframe[title="Email: Edge case conversation"]');
    await frame.getByText("Safe body text", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__emailXss), undefined);
    assert.equal(pixels, 0);
    assert.doesNotMatch(await page.locator("iframe").getAttribute("sandbox"), /allow-forms|allow-scripts|allow-same-origin/);
  }, { messages: [{ ...mail, text_body: "", html_body: '<p>Safe body text</p><script>top.__emailXss=true</script><svg onload="top.__emailXss=true"></svg><form action="https://tracking.example/submit"><input autofocus></form><img src="https://tracking.example/pixel.png"><iframe src="https://tracking.example/frame"></iframe>' }] });
  await check("deleting the last sample message persists an empty mailbox", async page => {
    await nav(page, "Trash").click(); await page.locator(".row-content").first().click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete forever", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Message permanently deleted." }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("frankiflow-demo-v2"))), []);
    // Remove the seeding script before reloading so the test exercises persisted data.
    const fresh = await page.context().newPage(); await fresh.goto(`${base}/demo`);
    assert.equal(await fresh.locator(".message-row").count(), 0);
  }, { messages: [{ ...mail, folder: "trash" }] });
  await check("equal filenames retain independent binary bytes through draft and Sent", async page => {
    await page.getByRole("button", { name: "New message", exact: false }).click();
    await page.getByRole("combobox", { name: "To", exact: true }).fill("guest@example.com");
    await page.getByRole("textbox", { name: "Subject", exact: true }).fill("Two same-name attachments");
    const contents=[Buffer.from([0,255,128,1]),Buffer.from("Grüße from the second file")];
    await page.getByLabel("Attachment files", { exact: true }).setInputFiles(contents.map(buffer=>({name:"same-name.bin",mimeType:"application/octet-stream",buffer})));
    await page.getByRole("button", { name: "Close and save draft", exact: true }).click();
    await page.getByRole("dialog").waitFor({state:"detached"});await nav(page,"Drafts").click();await page.locator(".row-content").filter({hasText:"Two same-name attachments"}).click();
    await page.getByRole("button",{name:"Remove same-name.bin",exact:true}).nth(1).waitFor();
    assert.equal(await page.getByRole("button",{name:"Remove same-name.bin",exact:true}).count(),2);
    await page.getByRole("button",{name:"Send in demo",exact:true}).click();await page.getByRole("dialog").waitFor({state:"detached"});
    const buttons=page.getByRole("button",{name:/^Download same-name\.bin/});assert.equal(await buttons.count(),2);
    for(let index=0;index<2;index++){const waiting=page.waitForEvent("download");await buttons.nth(index).click();assert.deepEqual(await readFile(await(await waiting).path()),contents[index]);}
  });
  await check("one thousand messages support search, bulk archive and Undo", async page => {
    await page.locator(".message-row").nth(999).waitFor({timeout:15000});
    assert.equal(await page.locator(".message-row").count(),1000);
    await page.getByRole("textbox",{name:"Search mail",exact:true}).fill('subject:"Batch message 999"');
    assert.equal(await page.locator(".message-row").count(),1);
    await page.getByRole("textbox",{name:"Search mail",exact:true}).fill("");assert.equal(await page.locator(".message-row").count(),1000);
    await page.getByRole("checkbox",{name:"Select all messages",exact:true}).check();
    await page.getByRole("button",{name:"Archive selected",exact:true}).click();
    await page.getByRole("status").filter({hasText:"Moved 1000 messages to archive."}).waitFor();
    assert.equal(await page.locator(".message-row").count(),0);
    await page.getByRole("button",{name:"Undo",exact:true}).click();
    await page.locator(".message-row").nth(999).waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("frankiflow-demo-v2")).length),1000);
  },{messages:Array.from({length:1000},(_,index)=>({...mail,id:`batch-${index}`,thread_id:undefined,subject:`Batch message ${index}`,created_at:new Date(Date.now()-index*60000).toISOString()}))});
  for (const width of [320, 360, 390, 768, 1024]) await check(`compose, settings and tools fit ${width}px without horizontal scrolling`, async page => {
    await page.setViewportSize({ width, height: 844 });
    if (width <= 640) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const fits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollX === 0));
    await page.getByRole("button", { name: "New message", exact: false }).click(); await fits();
    await page.getByRole("button", { name: "Discard message", exact: true }).click();
    await page.getByRole("button", { name: "Open settings", exact: true }).click(); await page.getByText("Reading, accounts & notifications", { exact: true }).click(); await fits();
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    if (width <= 640) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.locator(".sidebar-tools").getByRole("button", { name: "Calendar", exact: true }).click();
    await page.getByRole("button", { name: "New event", exact: true }).click(); await fits();
    await page.getByLabel("Event title", { exact: true }).fill("A mobile meeting");
    const rect = await page.getByRole("button", { name: "Save", exact: true }).boundingBox(); assert.ok(rect.width > 0);
  });
} finally { await browser.close(); }
assert.equal(failures.length, 0, `${failures.length} edge-case groups failed; see test-results/edge-cases/`);
console.log("17 edge-case groups passed");
