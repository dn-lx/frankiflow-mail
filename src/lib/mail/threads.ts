// Pure helpers for the thread list. No JSX, no path aliases (tested in Node).

import type { Folder, Message, ThreadSummary } from '../backend/types.ts';

/** Pinned first, then newest first; ties broken by id for a stable order. */
export function compareThreads(a: ThreadSummary, b: ThreadSummary): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  if (a.lastMessageAt !== b.lastMessageAt) return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortThreads(list: readonly ThreadSummary[]): ThreadSummary[] {
  return [...list].sort(compareThreads);
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Shallow value equality of two summaries. */
export function sameThread(a: ThreadSummary, b: ThreadSummary): boolean {
  return (
    a.id === b.id &&
    a.subject === b.subject &&
    a.lastMessageAt === b.lastMessageAt &&
    a.messageCount === b.messageCount &&
    a.unreadCount === b.unreadCount &&
    a.preview === b.preview &&
    a.isStarred === b.isStarred &&
    a.isPinned === b.isPinned &&
    a.priority === b.priority &&
    a.hasAttachments === b.hasAttachments &&
    a.latestMessageId === b.latestMessageId &&
    sameArray(a.participants, b.participants) &&
    sameArray(a.labelIds, b.labelIds) &&
    sameArray(a.mailboxIds, b.mailboxIds)
  );
}

/**
 * Merges a freshly fetched first page into the list the user is looking at.
 * - Threads in `fresh` replace their old version (the old object is kept when
 *   nothing changed, so memoised rows do not re-render).
 * - Threads missing from `fresh` are dropped if they fall inside the fetched
 *   window (or `complete` is true); older ones beyond the window are kept so
 *   pages loaded by infinite scroll survive a live update.
 * - The result is sorted with `compareThreads`.
 * Returns `current` itself when nothing changed.
 */
export function mergeThreads(
  current: readonly ThreadSummary[],
  fresh: readonly ThreadSummary[],
  complete: boolean,
): ThreadSummary[] {
  const byId = new Map(current.map((t) => [t.id, t] as const));
  const freshIds = new Set(fresh.map((t) => t.id));
  let cutoff: string | null = null;
  if (!complete) {
    for (const t of fresh) if (!t.isPinned && (cutoff === null || t.lastMessageAt < cutoff)) cutoff = t.lastMessageAt;
  }
  const out: ThreadSummary[] = [];
  for (const t of fresh) {
    const old = byId.get(t.id);
    out.push(old && sameThread(old, t) ? old : t);
  }
  for (const t of current) {
    if (freshIds.has(t.id)) continue;
    if (complete || cutoff === null) continue;
    if (!t.isPinned && t.lastMessageAt < cutoff) out.push(t);
  }
  out.sort(compareThreads);
  if (out.length === current.length && out.every((t, i) => t === current[i])) return current as ThreadSummary[];
  return out;
}

/** Appends a further page, skipping threads already in the list. */
export function appendThreads(current: readonly ThreadSummary[], page: readonly ThreadSummary[]): ThreadSummary[] {
  const seen = new Set(current.map((t) => t.id));
  return [...current, ...page.filter((t) => !seen.has(t.id))];
}

export function removeThreads(list: readonly ThreadSummary[], ids: Iterable<string>): ThreadSummary[] {
  const drop = new Set(ids);
  return list.filter((t) => !drop.has(t.id));
}

export function patchThreads(
  list: readonly ThreadSummary[],
  ids: Iterable<string>,
  patch: (t: ThreadSummary) => Partial<ThreadSummary>,
): ThreadSummary[] {
  const set = new Set(ids);
  let changed = false;
  const out = list.map((t) => {
    if (!set.has(t.id)) return t;
    const next = { ...t, ...patch(t) };
    if (sameThread(t, next)) return t;
    changed = true;
    return next;
  });
  return changed ? out.sort(compareThreads) : (list as ThreadSummary[]);
}

/** Ids from `a` to `b` inclusive in list order (for Shift-click). */
export function rangeIds(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return j >= 0 ? [b] : [];
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  return order.slice(lo, hi + 1);
}

/** The thread after (`next`) or before (`prev`) `id`; undefined at the ends. */
export function neighbourId(order: readonly string[], id: string | undefined, dir: 'next' | 'prev'): string | undefined {
  if (order.length === 0) return undefined;
  const i = id ? order.indexOf(id) : -1;
  if (i < 0) return dir === 'next' ? order[0] : order[order.length - 1];
  return order[dir === 'next' ? i + 1 : i - 1];
}

/** Which thread to show after `ids` disappear: the next one below, else the one above. */
export function successorId(order: readonly string[], ids: readonly string[]): string | undefined {
  const gone = new Set(ids);
  let last = -1;
  for (let i = 0; i < order.length; i++) if (gone.has(order[i] as string)) last = i;
  if (last < 0) return undefined;
  for (let i = last + 1; i < order.length; i++) if (!gone.has(order[i] as string)) return order[i];
  for (let i = last - 1; i >= 0; i--) if (!gone.has(order[i] as string)) return order[i];
  return undefined;
}

export type ConcreteFolder = Message['folder'];

/** Whether a thread moved to `target` still belongs in a list showing `view`. */
export function staysInView(view: Folder, target: ConcreteFolder): boolean {
  if (view === 'all' || view === 'starred') return target !== 'trash' && target !== 'spam';
  return view === target;
}

export function isConcreteFolder(f: Folder): f is ConcreteFolder {
  return f !== 'all' && f !== 'starred';
}

/**
 * Messages of a thread that a folder move should touch.
 * In a concrete folder view only the messages in that folder move (so archiving
 * from the inbox leaves sent replies in Sent). Elsewhere: archive and snooze
 * take inbox messages; trash, spam and explicit moves take everything except
 * drafts and scheduled messages.
 */
export function messagesToMove(
  messages: readonly Message[],
  view: Folder,
  target: ConcreteFolder | 'snooze',
): Message[] {
  const dest = target === 'snooze' ? 'snoozed' : target;
  const notThere = messages.filter((m) => m.folder !== dest);
  if (isConcreteFolder(view) && view !== dest) {
    const inView = notThere.filter((m) => m.folder === view);
    if (inView.length) return inView;
  }
  if (target === 'archive' || target === 'snooze') {
    return notThere.filter((m) => m.folder === 'inbox');
  }
  return notThere.filter((m) => m.folder !== 'drafts' && m.folder !== 'scheduled');
}

/** Groups messages by a key so each group can be reverted with one update call. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export interface SnoozePresets {
  /** Undefined when "later today" would fall after 21:00 or past midnight. */
  laterToday?: Date;
  tomorrow: Date;
  nextMonday: Date;
}

/**
 * Snooze presets relative to `now` (local time):
 * later today = three hours from now, rounded up to the full hour (only offered
 * if that is still today and no later than 21:00); tomorrow 08:00; next Monday
 * 08:00 (always a future Monday, a week ahead when today is Monday).
 */
export function snoozePresets(now: Date = new Date()): SnoozePresets {
  const later = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  if (later.getMinutes() || later.getSeconds() || later.getMilliseconds()) {
    later.setHours(later.getHours() + 1, 0, 0, 0);
  }
  const sameDay =
    later.getFullYear() === now.getFullYear() && later.getMonth() === now.getMonth() && later.getDate() === now.getDate();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMonday, 8, 0, 0, 0);
  return {
    laterToday: sameDay && later.getHours() <= 21 ? later : undefined,
    tomorrow,
    nextMonday,
  };
}

/** Selection presets of the list header menu (like Gmail). */
export type SelectFilter = 'all' | 'none' | 'read' | 'unread' | 'starred' | 'unstarred';

export const SELECT_FILTERS: readonly SelectFilter[] = ['all', 'none', 'read', 'unread', 'starred', 'unstarred'];

/**
 * Ids (in list order) of the loaded threads matching `filter`:
 * read = no unread messages, unread = at least one, starred / unstarred by `isStarred`;
 * `all` = every thread, `none` = nothing.
 */
export function selectByFilter(threads: readonly ThreadSummary[], filter: SelectFilter): string[] {
  const match = (t: ThreadSummary): boolean => {
    switch (filter) {
      case 'all':
        return true;
      case 'none':
        return false;
      case 'read':
        return t.unreadCount === 0;
      case 'unread':
        return t.unreadCount > 0;
      case 'starred':
        return t.isStarred;
      case 'unstarred':
        return !t.isStarred;
    }
  };
  return threads.filter(match).map((t) => t.id);
}

/** Folders whose rows show the recipients ("To: …") instead of the sender. */
export function showsRecipients(folder: Folder): boolean {
  return folder === 'sent' || folder === 'drafts' || folder === 'scheduled';
}

const NAME_ADDR_RE = /^\s*"?([^"<]*?)"?\s*<([^<>]*)>\s*$/;

/** The display part of `Name <addr>` (or the bare address / name as given). */
export function displayNameOf(entry: string): string {
  const m = NAME_ADDR_RE.exec(entry);
  if (m) return (m[1] ?? '').trim() || (m[2] ?? '').trim();
  return entry.trim();
}

function addressOf(entry: string): string {
  const m = NAME_ADDR_RE.exec(entry);
  return (m ? (m[2] ?? '') : entry).trim().toLowerCase();
}

export interface OwnIdentity {
  address: string;
  displayName?: string;
}

/**
 * Thread participants that are not the user's own mailboxes (matched case-insensitively
 * by address or display name), as display names, without duplicates.
 */
export function otherParticipants(participants: readonly string[], own: readonly OwnIdentity[]): string[] {
  const ownKeys = new Set<string>();
  for (const o of own) {
    if (o.address) ownKeys.add(o.address.trim().toLowerCase());
    if (o.displayName) ownKeys.add(o.displayName.trim().toLowerCase());
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of participants) {
    const name = displayNameOf(p);
    if (!name) continue;
    if (ownKeys.has(name.toLowerCase()) || ownKeys.has(addressOf(p))) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Recipients (To, then Cc) of the latest outbound or draft message, as display names. */
export function outboundRecipients(messages: readonly Pick<Message, 'direction' | 'to' | 'cc'>[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as Pick<Message, 'direction' | 'to' | 'cc'>;
    if (m.direction !== 'outbound' && m.direction !== 'draft') continue;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const entry of [...m.to, ...m.cc]) {
      const name = displayNameOf(entry);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push(name);
    }
    return out;
  }
  return [];
}

/** `YYYY-MM-DDTHH:mm` in local time, for `<input type="datetime-local">`. */
export function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Parses a `datetime-local` value as local time; null if invalid. */
export function fromLocalInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}
