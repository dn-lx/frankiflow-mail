import test from "node:test";
import assert from "node:assert/strict";
import { localToInstant, instantToLocal, calendarText, matchesRule, rulePatch } from "../src/lib/organization.mjs";
import { filterMessages, validateFiles } from "../src/lib/mail-utils.mjs";
test("calendar timezone conversion follows Berlin daylight saving and rejects nonexistent times", () => {
  assert.equal(localToInstant("2026-10-23T10:00", "Europe/Berlin"), "2026-10-23T08:00:00.000Z");
  assert.equal(localToInstant("2026-11-02T10:00", "Europe/Berlin"), "2026-11-02T09:00:00.000Z");
  assert.equal(instantToLocal("2026-11-02T09:00:00Z", "Europe/Berlin"), "2026-11-02T10:00");
  assert.throws(() => localToInstant("2026-03-29T02:30", "Europe/Berlin"), /does not exist/);
});
test("calendar invitations preserve recipients, sequence, Unicode folding and cancellation", () => {
  const event = { uid: "test-uid", title: "Grüße ".repeat(30), start_at: "2026-11-02T09:00:00Z", end_at: "2026-11-02T10:00:00Z", timezone: "Europe/Berlin", sequence: 3, required_attendees: ["guest@example.com"], optional_attendees: ["optional@example.com"], recurrence_rule: "FREQ=WEEKLY", description: "Line one\nLine two", reminder_minutes: [15] };
  const text = calendarText(event, "sender@example.com", "CANCEL");
  assert.match(text, /METHOD:CANCEL/); assert.match(text, /STATUS:CANCELLED/); assert.match(text, /SEQUENCE:3/);
  assert.match(text, /DTSTART:20261102T090000Z/); assert.match(text, /RRULE:FREQ=WEEKLY/);
  assert.match(text, /ROLE=OPT-PARTICIPANT/); assert.match(text, /TRIGGER:-PT15M/);
  assert.match(text, /DESCRIPTION:Line one\\nLine two/);
  for (const line of text.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
});
test("filters match all specified conditions and leave unchanged actions out of writes", () => {
  const message = { id: "one", account_id: "team", from_address: "Emma@example.com", to_addresses: ["team@example.com"], subject: "Project review", text_body: "Please review the proposal", has_attachments: true, folder: "inbox", is_read: false };
  const rule = { conditions: { from_contains: "emma", subject_contains: "project", has_attachment: "yes", account_address: "team@example.com" }, actions: { folder: "archive", is_read: true } };
  assert.equal(matchesRule(message, rule, [{ id: "team", address: "team@example.com" }]), true);
  assert.equal(matchesRule({ ...message, has_attachments: false }, rule, [{ id: "team", address: "team@example.com" }]), false);
  assert.deepEqual(rulePatch(message, rule), { folder: "archive", is_read: true, trashed_at: null });
  assert.deepEqual(rulePatch({ ...message, folder: "archive", is_read: true }, rule), {});
});
test("all-mail and label search exclude spam/trash, and pinned messages come first", () => {
  const base = { id: "one", folder: "inbox", is_read: true, is_starred: false, from_address: "a@example.com", to_addresses: [], subject: "Example", created_at: "2026-10-23T10:00:00Z", label_names: ["Projects"] };
  const messages = [base, { ...base, id: "old", is_pinned: true, created_at: "2026-01-01T00:00:00Z" }, { ...base, id: "trash", folder: "trash" }];
  assert.deepEqual(filterMessages(messages, "all", "label:projects").map(m => m.id), ["old", "one"]);
  assert.match(validateFiles(Array(15).fill({ size: 1 })), /at most 14/);
});
