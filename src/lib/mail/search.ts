// Search query parser for the mailbox search field. Pure TypeScript: no JSX,
// no path aliases (unit tests import this file directly in Node).
//
// Supported operators (SPEC): from: to: subject: is:unread|read|starred|unstarred|pinned
// has:attachment label: before:YYYY-MM-DD after:YYYY-MM-DD. Values may be
// quoted ("Anna Schmidt"). Everything else is free text.

export type SearchOperator = 'from' | 'to' | 'subject' | 'is' | 'has' | 'label' | 'before' | 'after';
export type SearchTokenKind = SearchOperator | 'text';

export interface SearchToken {
  kind: SearchTokenKind;
  /** Unquoted value (for operators: the part after the colon). */
  value: string;
  /** False for operators with an unsupported value, e.g. `is:foo` or `before:yesterday`. */
  valid: boolean;
}

export type IsValue = 'unread' | 'read' | 'starred' | 'unstarred' | 'pinned';

export interface ParsedSearch {
  tokens: SearchToken[];
  text: string[];
  from: string[];
  to: string[];
  subject: string[];
  is: IsValue[];
  hasAttachment: boolean;
  labels: string[];
  before?: string;
  after?: string;
}

export const SEARCH_OPERATORS: readonly SearchOperator[] = ['from', 'to', 'subject', 'is', 'has', 'label', 'before', 'after'];
const IS_VALUES: readonly IsValue[] = ['unread', 'read', 'starred', 'unstarred', 'pinned'];

function isOperator(key: string): key is SearchOperator {
  return (SEARCH_OPERATORS as readonly string[]).includes(key);
}

/** True for a real calendar date in the form YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function validate(kind: SearchOperator, value: string): boolean {
  if (!value) return false;
  switch (kind) {
    case 'is':
      return (IS_VALUES as readonly string[]).includes(value.toLowerCase());
    case 'has':
      return /^attachments?$/i.test(value);
    case 'before':
    case 'after':
      return isIsoDate(value);
    default:
      return true;
  }
}

/** Splits on whitespace, keeping quoted parts ("a b" or key:"a b") together. Quotes are removed. */
function splitRaw(input: string): { raw: string; quotedValue: boolean }[] {
  const out: { raw: string; quotedValue: boolean }[] = [];
  let i = 0;
  const len = input.length;
  while (i < len) {
    while (i < len && /\s/.test(input[i] as string)) i++;
    if (i >= len) break;
    let token = '';
    let quoted = false;
    while (i < len && !/\s/.test(input[i] as string)) {
      if (input[i] === '"') {
        quoted = true;
        i++;
        while (i < len && input[i] !== '"') token += input[i++];
        if (i < len) i++; // closing quote
      } else {
        token += input[i++];
      }
    }
    if (token) out.push({ raw: token, quotedValue: quoted });
  }
  return out;
}

export function tokenizeSearch(input: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  for (const { raw } of splitRaw(input)) {
    const colon = raw.indexOf(':');
    if (colon > 0) {
      const key = raw.slice(0, colon).toLowerCase();
      const value = raw.slice(colon + 1).trim();
      if (isOperator(key)) {
        const normalized = key === 'is' || key === 'has' ? value.toLowerCase() : value;
        tokens.push({ kind: key, value: normalized, valid: validate(key, normalized) });
        continue;
      }
    }
    tokens.push({ kind: 'text', value: raw, valid: true });
  }
  return tokens;
}

export function parseSearch(input: string): ParsedSearch {
  const tokens = tokenizeSearch(input);
  const parsed: ParsedSearch = {
    tokens,
    text: [],
    from: [],
    to: [],
    subject: [],
    is: [],
    hasAttachment: false,
    labels: [],
  };
  for (const tok of tokens) {
    if (tok.kind === 'text') {
      parsed.text.push(tok.value);
      continue;
    }
    if (!tok.valid) continue;
    switch (tok.kind) {
      case 'from':
        parsed.from.push(tok.value);
        break;
      case 'to':
        parsed.to.push(tok.value);
        break;
      case 'subject':
        parsed.subject.push(tok.value);
        break;
      case 'label':
        parsed.labels.push(tok.value);
        break;
      case 'is':
        if (!parsed.is.includes(tok.value as IsValue)) parsed.is.push(tok.value as IsValue);
        break;
      case 'has':
        parsed.hasAttachment = true;
        break;
      case 'before':
        parsed.before = tok.value;
        break;
      case 'after':
        parsed.after = tok.value;
        break;
    }
  }
  return parsed;
}

function quoteIfNeeded(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
}

export function formatToken(tok: SearchToken): string {
  if (tok.kind === 'text') return quoteIfNeeded(tok.value);
  return `${tok.kind}:${quoteIfNeeded(tok.value)}`;
}

/** Turns tokens (or a parsed search) back into a query string. */
export function formatSearch(tokens: readonly SearchToken[] | ParsedSearch): string {
  const list: readonly SearchToken[] = 'tokens' in tokens ? tokens.tokens : tokens;
  return list
    .filter((t) => t.value !== '')
    .map(formatToken)
    .join(' ');
}

/** Removes the token at `index` (index into `tokenizeSearch(query)`) and returns the new query. */
export function removeToken(query: string, index: number): string {
  const tokens = tokenizeSearch(query);
  if (index < 0 || index >= tokens.length) return formatSearch(tokens);
  return formatSearch(tokens.filter((_, i) => i !== index));
}

/** Valid operator tokens are shown as chips; free text and invalid operators stay in the input. */
export function isChipToken(tok: SearchToken): boolean {
  return tok.kind !== 'text' && tok.valid;
}

/** The part of `query` the search input shows: free text and invalid operators (chips carry the rest). */
export function freeText(query: string): string {
  return formatSearch(tokenizeSearch(query).filter((t) => !isChipToken(t)));
}

/** Only the chip (valid operator) part of `query`, as a query string. */
export function chipQuery(query: string): string {
  return formatSearch(tokenizeSearch(query).filter(isChipToken));
}

/**
 * Combines the chip part `chips` with what the user typed into the input.
 * Operators typed again that are already chips are not duplicated.
 */
export function combineQuery(chips: string, text: string): string {
  const base = tokenizeSearch(chips).filter(isChipToken);
  const seen = new Set(base.map(formatToken));
  const typed = tokenizeSearch(text).filter((t) => {
    if (!isChipToken(t)) return true;
    const key = formatToken(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return formatSearch([...base, ...typed]);
}

/** Operator tokens with their index, for rendering filter chips. */
export function filterTokens(query: string): { index: number; token: SearchToken }[] {
  return tokenizeSearch(query)
    .map((token, index) => ({ index, token }))
    .filter((e) => e.token.kind !== 'text');
}
