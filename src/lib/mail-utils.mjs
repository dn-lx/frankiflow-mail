/** @param {string | string[] | null | undefined} value */
export function recipients(value = "") {
  const values = Array.isArray(value) ? value : [value];
  const result = [],
    seen = new Set();
  for (const value of values) {
    const tokens =
      String(value ?? "").match(/(?:"[^"]*"|<[^>]*>|[^,;\n])+/g) || [];
    for (const token of tokens) {
      const address = (token.match(/<([^<>]+)>/)?.[1] || token).trim();
      if (address && !seen.has(address.toLowerCase())) {
        seen.add(address.toLowerCase());
        result.push(address);
      }
    }
  }
  return result;
}
export function validRecipients(value) {
  const list = recipients(value);
  return (
    list.length > 0 &&
    list.every((x) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x))
  );
}
export function filterMessages(messages, folder, query = "", unread = false) {
  const tokens = (query.toLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g) || []).map(
    (token) => token.replaceAll('"', ""),
  );
  return messages
    .filter((m) => {
      if (
        folder === "starred"
          ? !m.is_starred || ["trash", "spam"].includes(m.folder)
          : folder === "all" ? ["trash", "spam"].includes(m.folder) : m.folder !== folder
      )
        return false;
      if (unread && m.is_read) return false;
      const to = recipients(m.to_addresses).join(" ").toLowerCase();
      const from = String(m.from_address || "").toLowerCase();
      const subject = String(m.subject || "").toLowerCase();
      return tokens.every((token) => {
        if (token === "is:unread") return !m.is_read;
        if (token === "is:read") return m.is_read;
        if (token === "is:starred") return m.is_starred;
        if (token === "is:important") return m.priority === "high";
        if (token === "has:attachment")
          return m.has_attachments || m.attachments?.length > 0;
        if (token.startsWith("label:")) return (m.label_names || []).some(name => name.toLowerCase().includes(token.slice(6)));
        if (token.startsWith("from:")) return from.includes(token.slice(5));
        if (token.startsWith("to:")) return to.includes(token.slice(3));
        if (token.startsWith("subject:"))
          return subject.includes(token.slice(8));
        if (token.startsWith("before:"))
          return Date.parse(m.created_at) < Date.parse(token.slice(7));
        if (token.startsWith("after:"))
          return Date.parse(m.created_at) >= Date.parse(token.slice(6));
        return [subject, m.from_name, from, m.text_body, to]
          .join(" ")
          .toLowerCase()
          .includes(token);
      });
    })
    .sort((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || Date.parse(b.created_at) - Date.parse(a.created_at));
}
export function validateFiles(files) {
  if (files.length > 14) return "Attach at most 14 files, including inline images.";
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
export function replyRecipients(message, accounts, all = false) {
  const own = new Set(accounts.map((a) => a.address.toLowerCase()));
  const outgoing =
    own.has(String(message.from_address || "").toLowerCase()) ||
    message.direction === "outbound";
  const to = recipients(
    outgoing ? message.to_addresses : message.reply_to || message.from_address,
  ).filter((a) => !own.has(a.toLowerCase()));
  const toSet = new Set(to.map((a) => a.toLowerCase()));
  const cc = all
    ? recipients([
        ...(outgoing ? [] : recipients(message.to_addresses)),
        ...recipients(message.cc_addresses),
      ]).filter((a) => !own.has(a.toLowerCase()) && !toSet.has(a.toLowerCase()))
    : [];
  return { to, cc };
}
export function replyTargets(message, accounts) {
  return replyRecipients(message, accounts).to;
}
export function fromAddressForMessage(message, accounts) {
  return (
    accounts.find((a) => a.id === message.account_id)?.address ||
    accounts.find(
      (a) =>
        a.address.toLowerCase() ===
        String(message.from_address || "").toLowerCase(),
    )?.address ||
    accounts.find((a) =>
      recipients([
        ...recipients(message.to_addresses),
        ...recipients(message.cc_addresses),
      ]).some((address) => address.toLowerCase() === a.address.toLowerCase()),
    )?.address ||
    accounts.find((a) => a.is_primary)?.address ||
    accounts[0]?.address ||
    ""
  );
}
