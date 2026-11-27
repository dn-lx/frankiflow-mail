// Pure address helpers for the composer. No JSX, no path aliases: tested directly in Node.

import type { Message } from '../backend/types.ts';

export interface ParsedAddress {
  /** Display name ('' when none was given). */
  name: string;
  /** Bare address as typed (trimmed, without `mailto:` and angle brackets). May be invalid. */
  address: string;
  /** The original token. */
  raw: string;
}

export type ReplyMode = 'reply' | 'replyAll' | 'forward';
export type SubjectLang = 'de' | 'en';

/** Why an address is not valid; null when it is. */
export type EmailProblem = 'empty' | 'missing-at' | 'missing-local' | 'missing-domain' | 'spaces' | 'too-long' | 'invalid';

const SEPARATORS = new Set([',', ';', '\n', '\r']);

/**
 * Splits a recipient text on commas, semicolons and newlines, ignoring
 * separators inside double quotes or angle brackets.
 */
export function splitAddressText(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let inAngle = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      current += ch;
      if (ch === '\\' && i + 1 < text.length) {
        current += text[++i];
      } else if (ch === '"') {
        inQuote = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      current += ch;
      continue;
    }
    if (ch === '<') inAngle = true;
    else if (ch === '>') inAngle = false;
    if (!inAngle && SEPARATORS.has(ch)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function unquote(name: string): string {
  let s = name.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/\\(.)/g, '$1');
  } else if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1);
  }
  return s.replace(/\s+/g, ' ').trim();
}

function cleanAddress(address: string): string {
  return address.trim().replace(/^mailto:/i, '').trim();
}

function parseToken(token: string): ParsedAddress[] {
  const raw = token.trim();
  if (!raw) return [];
  const angle = /^([\s\S]*?)<([^<>]*)>\s*$/.exec(raw);
  if (angle) {
    return [{ name: unquote(angle[1]), address: cleanAddress(angle[2]), raw }];
  }
  // Several bare addresses separated by whitespace: "a@b.de c@d.de".
  if (!raw.includes('"') && /\s/.test(raw)) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every((w) => w.includes('@'))) {
      return words.map((w) => ({ name: '', address: cleanAddress(w), raw: w }));
    }
  }
  return [{ name: '', address: cleanAddress(raw), raw }];
}

/**
 * Parses a list like `Anna Muster <anna@x.de>, "Doe, John" <j@d.de>; bob@y.com`.
 * Separators: comma, semicolon, newline (and whitespace between bare addresses).
 * Returns every token, valid or not, in order; empty tokens are dropped.
 */
export function parseAddressList(text: string): ParsedAddress[] {
  const out: ParsedAddress[] = [];
  for (const token of splitAddressText(text)) out.push(...parseToken(token));
  return out.filter((p) => p.address !== '' || p.name !== '');
}

const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;

/** Explains why `value` is not a usable email address, or returns null when it is. */
export function emailProblem(value: string): EmailProblem | null {
  const s = value.trim();
  if (!s) return 'empty';
  if (s.length > 254) return 'too-long';
  if (/\s/.test(s)) return 'spaces';
  const at = s.lastIndexOf('@');
  if (at === -1) return 'missing-at';
  if (at === 0) return 'missing-local';
  if (at === s.length - 1) return 'missing-domain';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length > 64 || !LOCAL_RE.test(local)) return 'invalid';
  const labels = domain.split('.');
  if (labels.length < 2) return 'missing-domain';
  for (const label of labels) if (!LABEL_RE.test(label)) return 'invalid';
  if (!TLD_RE.test(labels[labels.length - 1])) return 'invalid';
  return null;
}

/** Pragmatic address check (ASCII local part, dotted domain with a real TLD). */
export function isValidEmail(value: string): boolean {
  return emailProblem(value) === null;
}

/**
 * When Enter/Tab is pressed while a suggestion list is open: keep what was typed
 * (instead of the highlighted suggestion) when it already looks like an address.
 * `navigated` is true when the user moved through the suggestions with the arrow keys.
 */
export function preferTypedAddress(typed: string, navigated = false): boolean {
  if (navigated) return false;
  // Every complete address contains "@", so this also covers complete addresses.
  return typed.trim().includes('@');
}

/**
 * Display names known from a message's headers (From, To, Cc), keyed by lower-case address.
 * Used to show "Katrin Weber" instead of the bare address on reply chips.
 */
export function namesFromMessage(message: Pick<Message, 'from' | 'to' | 'cc'>): Map<string, string> {
  const names = new Map<string, string>();
  const add = (address: string, name: string) => {
    const key = cleanAddress(address).toLowerCase();
    const n = name.replace(/\s+/g, ' ').trim();
    if (key && n && n.toLowerCase() !== key && !names.has(key)) names.set(key, n);
  };
  add(message.from.address, message.from.name ?? '');
  for (const entry of [...message.to, ...message.cc]) {
    for (const p of parseAddressList(entry)) add(p.address, p.name);
  }
  return names;
}

/** `Name <address>`, quoting the name when needed; just the address when there is no distinct name. */
export function formatAddress(input: { name?: string; address: string }): string {
  const address = input.address.trim();
  const name = (input.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name || name.toLowerCase() === address.toLowerCase()) return address;
  const needsQuotes = /[",;<>@()[\]:\\.]/.test(name);
  const shown = needsQuotes ? `"${name.replace(/(["\\])/g, '\\$1')}"` : name;
  return `${shown} <${address}>`;
}

function normalize(address: string): string {
  return cleanAddress(address).toLowerCase();
}

/** Plain addresses from `lists`, in order, deduplicated case-insensitively, skipping `exclude`. */
function collect(lists: string[], seen: Set<string>): string[] {
  const out: string[] = [];
  for (const entry of lists) {
    for (const parsed of parseAddressList(entry)) {
      const key = normalize(parsed.address);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(parsed.address);
    }
  }
  return out;
}

type ReplySource = Pick<Message, 'from' | 'to' | 'cc' | 'replyTo'>;

function isOwn(source: ReplySource, own: Set<string>): boolean {
  return own.has(normalize(source.from.address));
}

/** Recipients for a plain reply: Reply-To or sender; for one's own sent mail, its original To. */
export function replyRecipients(message: ReplySource, ownAddresses: string[]): string[] {
  const own = new Set(ownAddresses.map(normalize));
  const seen = new Set(own);
  if (isOwn(message, own)) return collect(message.to, seen);
  return collect([message.replyTo || message.from.address], seen);
}

/**
 * Recipients for reply all: sender (or Reply-To) plus everyone in To in `to`,
 * everyone in Cc in `cc`; the user's own mailbox addresses are removed and
 * duplicates are dropped case-insensitively (an address appears only once overall).
 */
export function replyAllRecipients(message: ReplySource, ownAddresses: string[]): { to: string[]; cc: string[] } {
  const own = new Set(ownAddresses.map(normalize));
  const seen = new Set(own);
  const primary = isOwn(message, own) ? [] : [message.replyTo || message.from.address];
  const to = collect([...primary, ...message.to], seen);
  const cc = collect(message.cc, seen);
  return { to, cc };
}

const PREFIX_RE = /^\s*(?:(?:re|aw|antw|sv|fw|fwd|wg|wtr)\s*(?:\[\d+\]|\(\d+\))?\s*[:：]\s*)+/i;

/** Subject without leading reply/forward prefixes (Re:, AW:, Fwd:, WG:, Re[2]: …). */
export function stripSubjectPrefixes(subject: string): string {
  return subject.replace(PREFIX_RE, '').trim();
}

/** `Re:`/`Fwd:` (English) or `AW:`/`WG:` (German), never stacking prefixes. */
export function replySubject(subject: string, mode: ReplyMode, lang: SubjectLang): string {
  const base = stripSubjectPrefixes(subject ?? '');
  const prefix = mode === 'forward' ? (lang === 'de' ? 'WG:' : 'Fwd:') : lang === 'de' ? 'AW:' : 'Re:';
  return base ? `${prefix} ${base}` : prefix;
}
