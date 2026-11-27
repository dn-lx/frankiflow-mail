import type { Message } from '../types.ts';

export interface ParsedSearch {
  from: string[];
  to: string[];
  subject: string[];
  isUnread?: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  hasAttachment?: boolean;
  labels: string[];
  before?: string;
  after?: string;
  textTerms: string[];
}

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

function tokenizeQuery(raw: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = raw.length;

  while (i < len) {
    while (i < len && /\s/.test(raw[i])) i += 1;
    if (i >= len) break;

    let token = '';
    if (raw[i] === '"') {
      i += 1;
      while (i < len && raw[i] !== '"') {
        token += raw[i];
        i += 1;
      }
      if (i < len && raw[i] === '"') i += 1;
      if (token.length > 0) tokens.push(token);
      continue;
    }

    while (i < len && !/\s/.test(raw[i])) {
      if (raw[i] === '"') {
        i += 1;
        while (i < len && raw[i] !== '"') {
          token += raw[i];
          i += 1;
        }
        if (i < len && raw[i] === '"') i += 1;
      } else {
        token += raw[i];
        i += 1;
      }
    }
    if (token.length > 0) tokens.push(token);
  }

  return tokens;
}

export function parseSearch(q: string): ParsedSearch {
  const parsed: ParsedSearch = {
    from: [],
    to: [],
    subject: [],
    labels: [],
    textTerms: [],
  };

  const tokens = tokenizeQuery(q.trim());
  for (const token of tokens) {
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const key = token.slice(0, colonIdx).toLowerCase();
      const val = token.slice(colonIdx + 1);
      if (val.length > 0) {
        if (key === 'from') {
          parsed.from.push(normalizeSearchText(val));
          continue;
        }
        if (key === 'to') {
          parsed.to.push(normalizeSearchText(val));
          continue;
        }
        if (key === 'subject') {
          parsed.subject.push(normalizeSearchText(val));
          continue;
        }
        if (key === 'label') {
          parsed.labels.push(normalizeSearchText(val));
          continue;
        }
        if (key === 'before') {
          parsed.before = val;
          continue;
        }
        if (key === 'after') {
          parsed.after = val;
          continue;
        }
        if (key === 'is') {
          const v = val.toLowerCase();
          if (v === 'unread') {
            parsed.isUnread = true;
            continue;
          }
          if (v === 'read') {
            parsed.isUnread = false;
            continue;
          }
          if (v === 'starred') {
            parsed.isStarred = true;
            continue;
          }
          if (v === 'unstarred') {
            parsed.isStarred = false;
            continue;
          }
          if (v === 'pinned') {
            parsed.isPinned = true;
            continue;
          }
        }
        if (key === 'has') {
          const v = val.toLowerCase();
          if (v === 'attachment' || v === 'attachments') {
            parsed.hasAttachment = true;
            continue;
          }
        }
      }
    }

    const norm = normalizeSearchText(token);
    if (norm.length > 0) {
      parsed.textTerms.push(norm);
    }
  }

  return parsed;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

function resolveLabelId(
  name: string,
  labelsByName: Map<string, string> | Record<string, string>
): string | undefined {
  const target = normalizeSearchText(name);
  if (labelsByName instanceof Map) {
    for (const [k, v] of labelsByName.entries()) {
      if (normalizeSearchText(k) === target) return v;
    }
    return undefined;
  }
  for (const [k, v] of Object.entries(labelsByName)) {
    if (normalizeSearchText(k) === target) return v;
  }
  return undefined;
}

export function matchesSearch(
  message: Message,
  parsed: ParsedSearch,
  labelsByName: Map<string, string> | Record<string, string>
): boolean {
  if (parsed.isUnread !== undefined && message.isRead === parsed.isUnread) {
    return false;
  }
  if (parsed.isStarred !== undefined && message.isStarred !== parsed.isStarred) {
    return false;
  }
  if (parsed.isPinned && !message.isPinned) {
    return false;
  }
  if (parsed.hasAttachment && !message.hasAttachments && message.attachments.length === 0) {
    return false;
  }

  const fromCombined = normalizeSearchText(`${message.from.name} ${message.from.address}`);
  for (const f of parsed.from) {
    if (!fromCombined.includes(f)) return false;
  }

  const toCombined = normalizeSearchText(
    [...message.to, ...message.cc, ...message.bcc].join(' ')
  );
  for (const t of parsed.to) {
    if (!toCombined.includes(t)) return false;
  }

  const subjectNorm = normalizeSearchText(message.subject);
  for (const s of parsed.subject) {
    if (!subjectNorm.includes(s)) return false;
  }

  for (const labelName of parsed.labels) {
    const labelId = resolveLabelId(labelName, labelsByName);
    if (!labelId || !message.labelIds.includes(labelId)) {
      return false;
    }
  }

  const msgTimestampStr = message.sentAt ?? message.receivedAt ?? message.createdAt;
  const msgTime = Date.parse(msgTimestampStr);
  if (parsed.before) {
    const beforeMs = Date.parse(`${parsed.before}T00:00:00.000Z`);
    if (!Number.isNaN(beforeMs) && !Number.isNaN(msgTime) && msgTime >= beforeMs) {
      return false;
    }
  }
  if (parsed.after) {
    const afterMs = Date.parse(`${parsed.after}T00:00:00.000Z`);
    if (!Number.isNaN(afterMs) && !Number.isNaN(msgTime) && msgTime < afterMs) {
      return false;
    }
  }

  if (parsed.textTerms.length > 0) {
    const bodyText = message.textBody || stripHtmlTags(message.htmlBody);
    const haystack = normalizeSearchText(
      `${message.subject} ${bodyText} ${message.from.name} ${message.from.address}`
    );
    for (const term of parsed.textTerms) {
      if (!haystack.includes(term)) return false;
    }
  }

  return true;
}
