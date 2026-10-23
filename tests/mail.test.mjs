import test from "node:test";
import assert from "node:assert/strict";
import {
  filterMessages,
  recipients,
  validRecipients,
  validateFiles,
  replyTargets,
  formatBytes,
} from "../src/lib/mail-utils.mjs";
const message = {
  id: "1",
  folder: "sent",
  direction: "outbound",
  from_name: "Alex",
  from_address: "alex@example.com",
  to_addresses: ["emma@example.com"],
  subject: "Proposal",
  text_body: "Hello",
  has_attachments: false,
  attachments: [{ filename: "brief.pdf" }],
  created_at: "2026-10-01T12:00:00Z",
  is_read: true,
  is_starred: true,
};
test("attachment search uses actual attachment metadata even when the flag is stale", () =>
  assert.equal(filterMessages([message], "sent", "has:attachment").length, 1));
test("folder and search operators combine without leaking other folders", () => {
  assert.equal(
    filterMessages([message], "sent", "to:emma subject:proposal").length,
    1,
  );
  assert.equal(filterMessages([message], "inbox", "proposal").length, 0);
  assert.equal(filterMessages([message], "sent", "is:unread").length, 0);
});
test("starred excludes trash and spam", () =>
  assert.equal(
    filterMessages(
      [
        { ...message, folder: "trash" },
        { ...message, folder: "spam" },
      ],
      "starred",
    ).length,
    0,
  ));
test("recipient parsing deduplicates and validates every address", () => {
  assert.deepEqual(recipients("a@example.com; b@example.com,a@example.com"), [
    "a@example.com",
    "b@example.com",
  ]);
  assert.equal(validRecipients("a@example.com,broken"), false);
  assert.equal(validRecipients(""), false);
  assert.equal(validRecipients("a@example.com,b@example.com"), true);
});
test("outbound replies target the recipient rather than our own mailbox", () =>
  assert.deepEqual(replyTargets(message, [{ address: "alex@example.com" }]), [
    "emma@example.com",
  ]));
test("inbound reply respects Reply-To", () =>
  assert.deepEqual(
    replyTargets(
      {
        ...message,
        direction: "inbound",
        from_address: "robot@example.com",
        reply_to: "team@example.com",
      },
      [{ address: "alex@example.com" }],
    ),
    ["team@example.com"],
  ));
test("file limits reject individual and combined oversized attachments", () => {
  assert.match(validateFiles([{ size: 9 * 1048576 }]), /8 MB/);
  assert.match(validateFiles(Array(3).fill({ size: 7 * 1048576 })), /18 MB/);
  assert.equal(
    validateFiles([{ size: 8 * 1048576 }, { size: 8 * 1048576 }]),
    "",
  );
});
test("byte formatting handles small and large attachments", () => {
  assert.equal(formatBytes(34), "34 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1048576), "1.0 MB");
});
