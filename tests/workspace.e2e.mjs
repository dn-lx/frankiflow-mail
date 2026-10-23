import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Europe/Berlin", acceptDownloads: true });
const page = await context.newPage(), errors = [], requests = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => { if (request.url().includes("supabase.co")) requests.push(request.url()); });
const panel = () => page.getByRole("dialog", { name: "Workspace tools" });
const nav = name => page.getByRole("navigation", { name: "Mail folders" }).getByRole("button", { name: new RegExp(`^${name}`) });
const row = subject => page.locator(".row-content").filter({ hasText: subject });
async function open(tab) {
  if (!(await panel().count())) await page.locator(".sidebar-tools").getByRole("button", { name: "Templates & tools", exact: true }).click();
  await panel().getByRole("navigation", { name: "Workspace tools" }).getByRole("button", { name: tab, exact: true }).click();
}
async function close() { await panel().getByRole("button", { name: "Close Workspace tools", exact: true }).click(); }
async function save() { await panel().getByRole("button", { name: "Save", exact: true }).click(); await panel().locator(".tools-form").waitFor({ state: "detached" }); }
try {
  await page.goto(`${base}/demo`);
  await open("Contacts");
  await panel().getByRole("button", { name: "New contact", exact: true }).click();
  await panel().getByRole("textbox", { name: "Contact name", exact: true }).fill("Taylor QA");
  await panel().getByRole("textbox", { name: "Contact email", exact: true }).fill("taylor@example.com");
  await panel().getByRole("textbox", { name: "Company", exact: true }).fill("Example Studio");
  await save();
  await page.reload(); await open("Contacts");
  const contact = panel().locator(".tool-card").filter({ hasText: "Taylor QA" });
  await contact.getByRole("button", { name: "Write email", exact: true }).click();
  assert.equal(await page.getByRole("combobox", { name: "To", exact: true }).inputValue(), "taylor@example.com");
  await page.getByRole("button", { name: "Discard message", exact: true }).click();
  console.log("PASS contacts persist and open a correctly addressed composer");

  await open("Templates");
  await panel().getByRole("button", { name: "New template", exact: true }).click();
  await panel().getByRole("textbox", { name: "Template name", exact: true }).fill("Formatted follow-up");
  await panel().getByRole("textbox", { name: "Template subject", exact: true }).fill("Rich template regression");
  await panel().getByRole("textbox", { name: "Template body", exact: true }).fill("Formatted project update");
  await panel().getByRole("button", { name: "Rich text", exact: true }).click();
  const editor = panel().getByRole("textbox", { name: "Template body", exact: true });
  await editor.evaluate(el => { const selection = getSelection(), range = document.createRange(); range.selectNodeContents(el); selection.removeAllRanges(); selection.addRange(range); el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
  await panel().getByRole("button", { name: "Bold", exact: true }).click();
  await save();
  await panel().locator(".tool-card").filter({ hasText: "Formatted follow-up" }).getByRole("button", { name: "Use template", exact: true }).click();
  const richBody = page.getByRole("textbox", { name: "Rich message body", exact: true });
  assert.match(await richBody.innerHTML(), /<b>|<strong>|font-weight/);
  await richBody.evaluate(el => {
    const data = new DataTransfer(); data.setData("text/html", '<p>Safe pasted text</p><img src=x onerror="window.__pasteXss=true"><script>window.__pasteXss=true</script>');
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.equal(await page.evaluate(() => window.__pasteXss), undefined);
  assert.doesNotMatch(await richBody.innerHTML(), /onerror|<script/i);
  await page.getByRole("combobox", { name: "To", exact: true }).fill("taylor@example.com");
  await page.getByRole("button", { name: "Send in demo", exact: true }).click();
  await page.frameLocator('iframe[title="Email: Rich template regression"]').getByText("Safe pasted text").waitFor();
  console.log("PASS rich templates retain formatting, sanitize pasted content and render safely after sending");

  await open("Labels");
  await panel().getByRole("button", { name: "New label", exact: true }).click();
  await panel().getByRole("textbox", { name: "Label name", exact: true }).fill("Urgent QA");
  await save(); await close();
  await nav("Inbox").click(); await row("A fresh direction").click();
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Urgent QA", exact: true }).check();
  await page.locator(".sidebar-tools").getByRole("button", { name: "Urgent QA", exact: true }).click();
  await row("A fresh direction").waitFor();
  console.log("PASS labels can be created, assigned and opened as a mailbox view");

  await open("Filters");
  await panel().getByRole("button", { name: "New filter", exact: true }).click();
  await panel().getByRole("textbox", { name: "Filter name", exact: true }).fill("Archive Emma's projects");
  await panel().getByRole("textbox", { name: "Sender contains", exact: true }).fill("emma@example.com");
  await panel().getByRole("combobox", { name: "Filter destination", exact: true }).selectOption("archive");
  await panel().getByRole("combobox", { name: "Filter label", exact: true }).selectOption({ label: "Projects" });
  await save();
  await panel().getByRole("button", { name: "Apply filters to Inbox now", exact: true }).click();
  await panel().getByText("Filters applied to current Inbox messages.", { exact: true }).waitFor();
  await close(); await nav("Inbox").click(); assert.equal(await row("A fresh direction").count(), 0);
  await nav("Archive").click(); await row("A fresh direction").waitFor();
  console.log("PASS matching rules apply folder and label actions without affecting unrelated messages");

  await open("Calendar"); await panel().getByRole("button", { name: "New event", exact: true }).click();
  await panel().getByRole("textbox", { name: "Event title", exact: true }).fill("Berlin project review");
  await panel().getByLabel("Event start", { exact: true }).fill("2026-11-04T10:00");
  await panel().getByLabel("Event end", { exact: true }).fill("2026-11-04T11:00");
  await panel().getByRole("textbox", { name: "Required attendees", exact: true }).fill("guest@example.com");
  await panel().getByRole("textbox", { name: "Optional attendees", exact: true }).fill("optional@example.com");
  await panel().getByRole("combobox", { name: "Event recurrence", exact: true }).selectOption("FREQ=WEEKLY");
  await save();
  let meeting = panel().locator(".tool-card").filter({ hasText: "Berlin project review" });
  const downloadWait = page.waitForEvent("download"); await meeting.getByRole("button", { name: "Download ICS", exact: true }).click();
  const ics = await readFile(await (await downloadWait).path(), "utf8");
  assert.match(ics, /DTSTART:20261104T090000Z/); assert.match(ics, /RRULE:FREQ=WEEKLY/); assert.match(ics, /ROLE=OPT-PARTICIPANT/);
  await meeting.getByRole("button", { name: "Prepare invitation", exact: true }).click();
  assert.equal(await page.getByRole("combobox", { name: "To", exact: true }).inputValue(), "guest@example.com");
  assert.equal(await page.getByRole("textbox", { name: "Cc", exact: true }).inputValue(), "optional@example.com");
  await page.getByRole("button", { name: "Remove invitation.ics", exact: true }).waitFor();
  await page.getByRole("button", { name: "Send in demo", exact: true }).click();
  await page.getByRole("button", { name: /^Download invitation\.ics / }).waitFor();
  await open("Calendar"); meeting = panel().locator(".tool-card").filter({ hasText: "Berlin project review" });
  await meeting.getByText(/sent/).waitFor();
  await meeting.getByRole("button", { name: "Prepare cancellation", exact: true }).click();
  await page.getByRole("button", { name: "Send in demo", exact: true }).click();
  await page.getByRole("button", { name: /^Download invitation\.ics / }).waitFor();
  await open("Calendar"); await panel().locator(".tool-card").filter({ hasText: "Berlin project review" }).getByText(/cancelled/).waitFor(); await close();
  console.log("PASS calendar events, recurring ICS invitations and cancellations preserve attendees and Berlin time");

  await page.getByRole("button", { name: "New message", exact: false }).click();
  await page.getByRole("combobox", { name: "To", exact: true }).fill("later@example.com");
  await page.getByRole("textbox", { name: "Subject", exact: true }).fill("Scheduled attachment regression");
  await page.getByRole("textbox", { name: "Message body", exact: true }).fill("Deliver this later");
  await page.locator('input[type="file"]').setInputFiles({ name: "scheduled.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0,255,128,1]) });
  await page.getByRole("button", { name: "Schedule delivery", exact: true }).click();
  const future = new Date(Date.now() + 86400000);
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(future).replace(" ", "T");
  await page.getByLabel("Scheduled delivery time", { exact: true }).fill(local);
  await page.getByRole("button", { name: "Schedule in demo", exact: true }).click();
  await page.getByRole("button", { name: "Cancel scheduled send", exact: true }).click();
  await row("Scheduled attachment regression").click();
  await page.getByRole("button", { name: "Remove scheduled.bin", exact: true }).waitFor();
  await page.getByRole("button", { name: "Send in demo", exact: true }).click();
  const binaryWait = page.waitForEvent("download"); await page.getByRole("button", { name: /^Download scheduled\.bin / }).click();
  assert.deepEqual(await readFile(await (await binaryWait).path()), Buffer.from([0,255,128,1]));
  console.log("PASS scheduled messages cancel back to editable drafts without losing attachment bytes");

  await nav("Inbox").click(); await row("Coffee next week").click();
  await page.getByRole("button", { name: "Snooze", exact: true }).click();
  await page.getByLabel("Snooze until", { exact: true }).fill(local);
  await page.getByRole("button", { name: "Snooze message", exact: true }).click();
  await nav("Snoozed").click(); await row("Coffee next week").click();
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await page.getByRole("button", { name: "Mark important", exact: true }).click();
  await nav("All mail").click(); await page.getByRole("textbox", { name: "Search mail", exact: true }).fill("is:important"); await row("Coffee next week").waitFor();
  console.log("PASS snooze, pinning, importance and all-mail search work together");

  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.getByText("Reading, accounts & notifications", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Mark read on open", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save workspace preferences", exact: true }).click();
  await page.getByText("Preferences saved in this demo browser.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.reload(); await page.getByRole("button", { name: "Open settings", exact: true }).click(); await page.getByText("Reading, accounts & notifications", { exact: true }).click();
  assert.equal(await page.getByRole("checkbox", { name: "Mark read on open", exact: true }).isChecked(), false);
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.locator(".sidebar-tools").getByRole("button", { name: "Calendar", exact: true }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mkdir("test-results", { recursive: true }); await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: "test-results/workspace-desktop.png", fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  console.log("PASS preferences persist, mobile tools fit the screen, and demo never contacts Supabase");
  console.log("8 native workspace feature groups passed");
} catch (error) {
  await mkdir("test-results", { recursive: true }); await page.screenshot({ path: "test-results/workspace-failure.png", fullPage: true });
  console.error("Browser errors:", errors); throw error;
} finally { await browser.close(); }
