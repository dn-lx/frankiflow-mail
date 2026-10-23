export function recipients(value = "") {
  const items = Array.isArray(value) ? value : String(value).split(/[,;\n]+/);
  return [...new Set(items.map((x) => String(x).trim()).filter(Boolean))];
}
export function validRecipients(value) {
  const list = recipients(value);
  return (
    list.length > 0 &&
    list.every((x) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x))
  );
}
export function filterMessages(messages, folder, query = "", unread = false) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return messages
    .filter((m) => {
      if (
        folder === "starred"
          ? !m.is_starred || ["trash", "spam"].includes(m.folder)
          : m.folder !== folder
      )
        return false;
      if (unread && m.is_read) return false;
      return tokens.every((token) => {
        if (token === "is:unread") return !m.is_read;
        if (token === "is:starred") return m.is_starred;
        if (token === "has:attachment")
          return m.has_attachments || m.attachments?.length > 0;
        if (token.startsWith("from:"))
          return m.from_address.toLowerCase().includes(token.slice(5));
        if (token.startsWith("to:"))
          return m.to_addresses
            .join(" ")
            .toLowerCase()
            .includes(token.slice(3));
        if (token.startsWith("subject:"))
          return m.subject.toLowerCase().includes(token.slice(8));
        return [
          m.subject,
          m.from_name,
          m.from_address,
          m.text_body,
          ...m.to_addresses,
        ]
          .join(" ")
          .toLowerCase()
          .includes(token);
      });
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
export function validateFiles(files) {
  if (files.some((f) => f.size > 8 * 1024 * 1024))
    return "Each attachment must be 8 MB or smaller.";
  if (files.reduce((n, f) => n + f.size, 0) > 18 * 1024 * 1024)
    return "Attachments must total 18 MB or less.";
  return "";
}
export function formatBytes(size = 0) {
  return size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1048576).toFixed(1)} MB`;
}
export function replyTargets(message, accounts) {
  const own = new Set(accounts.map((a) => a.address.toLowerCase()));
  if (
    own.has(message.from_address.toLowerCase()) ||
    message.direction === "outbound"
  )
    return recipients(message.to_addresses).filter(
      (a) => !own.has(a.toLowerCase()),
    );
  return recipients(message.reply_to || message.from_address).filter(
    (a) => !own.has(a.toLowerCase()),
  );
}
