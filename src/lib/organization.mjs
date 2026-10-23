export function matchesRule(message, rule, accounts = []) {
  const c = rule.conditions || {};
  const contains = (value, needle) => !needle || String(value || "").toLowerCase().includes(String(needle).toLowerCase());
  return rule.active !== false &&
    contains(message.from_address, c.from_contains) &&
    contains([...(message.to_addresses || []), ...(message.cc_addresses || [])].join(" "), c.to_contains) &&
    contains(message.subject, c.subject_contains) && contains(message.text_body || message.preview, c.body_contains) &&
    (!c.account_address || accounts.some(a => a.id === message.account_id && a.address.toLowerCase() === c.account_address.toLowerCase())) &&
    (c.has_attachment !== "yes" || message.has_attachments || message.attachments?.length > 0) &&
    (c.has_attachment !== "no" || (!message.has_attachments && !message.attachments?.length));
}
export function rulePatch(message, rule) {
  const result = {};
  const a = rule.actions || {};
  for (const key of ["folder", "is_read", "is_starred", "priority", "is_pinned"]) if (a[key] !== undefined && a[key] !== message[key]) result[key] = a[key];
  if (result.folder) result.trashed_at = result.folder === "trash" ? new Date().toISOString() : null;
  return result;
}
function icsEscape(value = "") { return String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function instant(value) { return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function fold(line) {
  const parts = []; let current = "", size = 0;
  for (const c of line) { const bytes = new TextEncoder().encode(c).length; if (size + bytes > 75) { parts.push(current); current = " "; size = 1; } current += c; size += bytes; }
  return [...parts, current].join("\r\n");
}
export function calendarText(event, from, method = "REQUEST") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FrankiFlow//Mail v2//EN", "CALSCALE:GREGORIAN", `METHOD:${method}`, "BEGIN:VEVENT",
    `UID:${icsEscape(event.uid)}`, `DTSTAMP:${instant(new Date())}`, `SEQUENCE:${Number(event.sequence || 0)}`];
  if (event.all_day) {
    const day = value => new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone || "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)).replaceAll("-", "");
    lines.push(`DTSTART;VALUE=DATE:${day(event.start_at)}`, `DTEND;VALUE=DATE:${day(event.end_at)}`);
  } else lines.push(`DTSTART:${instant(event.start_at)}`, `DTEND:${instant(event.end_at)}`);
  lines.push(`SUMMARY:${icsEscape(event.title)}`, `ORGANIZER:mailto:${icsEscape(from)}`);
  for (const address of event.required_attendees || []) lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=${event.response_requested === false ? "FALSE" : "TRUE"}:mailto:${icsEscape(address)}`);
  for (const address of event.optional_attendees || []) lines.push(`ATTENDEE;ROLE=OPT-PARTICIPANT;RSVP=${event.response_requested === false ? "FALSE" : "TRUE"}:mailto:${icsEscape(address)}`);
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
  if (event.meeting_url) lines.push(`URL:${icsEscape(event.meeting_url)}`);
  if (event.description || event.meeting_url) lines.push(`DESCRIPTION:${icsEscape([event.description, event.meeting_url].filter(Boolean).join("\n\n"))}`);
  if (event.recurrence_rule) lines.push(`RRULE:${String(event.recurrence_rule).replace(/[\r\n]/g, "")}`);
  lines.push(`TRANSP:${event.show_as === "free" ? "TRANSPARENT" : "OPAQUE"}`, `STATUS:${method === "CANCEL" ? "CANCELLED" : event.show_as === "tentative" ? "TENTATIVE" : "CONFIRMED"}`);
  for (const minutes of event.reminder_minutes || []) if (Number(minutes) >= 0) lines.push("BEGIN:VALARM", `TRIGGER:-PT${Number(minutes)}M`, "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(event.title)}`, "END:VALARM");
  lines.push("END:VEVENT", "END:VCALENDAR"); return lines.map(fold).join("\r\n") + "\r\n";
}
export function localToInstant(value, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid date and time.");
  const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = time => Object.fromEntries(format.formatToParts(new Date(time)).map(x => [x.type, x.value]));
  let time = desired;
  for (let i = 0; i < 4; i++) { const p = parts(time); const actual = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); const delta = desired - actual; time += delta; if (!delta) break; }
  const p = parts(time);
  if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` !== value) throw new Error("That local time does not exist in this timezone. Choose another time.");
  return new Date(time).toISOString();
}
export function instantToLocal(value, zone = "Europe/Berlin") {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Format event wall time in its declared timezone, independent of the viewer's device. */
export function eventTime(value, timezone = "Europe/Berlin", allDay = false, locale = undefined) {
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "medium", ...(allDay ? {} : { timeStyle: "short" }) }).format(new Date(value));
}
