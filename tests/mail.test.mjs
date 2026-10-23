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

test("display-name recipients and case-insensitive duplicates preserve valid addresses", () => {
  assert.deepEqual(
    recipients(
      '"Wilson, Emma" <emma@example.com>; EMMA@example.com, Team <team@example.com>',
    ),
    ["emma@example.com", "team@example.com"],
  );
  assert.equal(validRecipients("Emma Wilson <emma@example.com>"), true);
  assert.deepEqual(recipients(null), []);
});

test("reply-all excludes all authorized aliases, duplicates and original Bcc recipients", async () => {
  const { replyRecipients } = await import("../src/lib/mail-utils.mjs");
  const mail = {
    ...message,
    direction: "inbound",
    from_address: "sender@example.com",
    reply_to: "reply@example.com",
    to_addresses: ["info@example.com", "guest@example.com"],
    cc_addresses: [
      "ALEX@example.com",
      "guest@example.com",
      "other@example.com",
    ],
    bcc_addresses: ["hidden@example.com"],
  };
  assert.deepEqual(
    replyRecipients(
      mail,
      [{ address: "alex@example.com" }, { address: "info@example.com" }],
      true,
    ),
    {
      to: ["reply@example.com"],
      cc: ["guest@example.com", "other@example.com"],
    },
  );
});

test("replies use the original authorized shared account before the default account", async () => {
  const { fromAddressForMessage } = await import("../src/lib/mail-utils.mjs");
  const accounts = [
    { id: "personal", address: "alex@example.com", is_primary: true },
    { id: "shared", address: "info@example.com" },
  ];
  assert.equal(
    fromAddressForMessage({ ...message, account_id: "shared" }, accounts),
    "info@example.com",
  );
  assert.equal(
    fromAddressForMessage(
      {
        ...message,
        from_address: "guest@example.com",
        to_addresses: ["INFO@example.com"],
      },
      accounts,
    ),
    "info@example.com",
  );
});

test("search supports quoted subject phrases, read status and date boundaries", () => {
  const mail = {
    ...message,
    subject: "Q4 project proposal",
    created_at: "2026-10-01T12:00:00Z",
  };
  assert.equal(
    filterMessages(
      [mail],
      "sent",
      'subject:"project proposal" is:read after:2026-10-01 before:2026-10-02',
    ).length,
    1,
  );
  assert.equal(
    filterMessages([mail], "sent", 'subject:"proposal project"').length,
    0,
  );
  assert.equal(filterMessages([mail], "sent", "before:2026-10-01").length, 0);
});

test("empty files fail before provider submission while small binary files remain valid", () => {
  assert.match(validateFiles([{ size: 0 }]), /empty/i);
  assert.equal(validateFiles([{ size: 1 }]), "");
  assert.equal(validateFiles([{ size: 8 * 1024 * 1024 }]), "");
});

test("SDK errors retain useful messages without exposing generic object serialization", async () => {
  const { errorText } = await import("../src/lib/mail-utils.mjs");
  assert.equal(errorText({ message: "Permission denied", code: "42501" }), "Permission denied");
  assert.equal(errorText(new Error("Upload interrupted")), "Upload interrupted");
  assert.equal(errorText("Offline"), "Offline");
  assert.match(errorText(null), /try again/i);
});
