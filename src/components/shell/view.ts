import type { Folder } from '../../lib/backend/types.ts';

/** The open view; lives in the query string: /mail/?m=&f=&l=&q=&r=&t= */
export type ListFilter = 'unread' | 'read' | 'starred' | 'unstarred';

export const LIST_FILTERS: readonly ListFilter[] = ['unread', 'read', 'starred', 'unstarred'];

export function isListFilter(v: string | null | undefined): v is ListFilter {
  return !!v && (LIST_FILTERS as readonly string[]).includes(v);
}

const FILTER_OPERATORS: Record<ListFilter, string> = {
  unread: 'is:unread',
  read: 'is:read',
  starred: 'is:starred',
  unstarred: 'is:unstarred',
};

/** Appends the search operator for an active list filter to the user's search text. */
export function buildSearchQuery(search: string | undefined, filter: ListFilter | undefined): string | undefined {
  const trimmed = search?.trim();
  const op = filter ? FILTER_OPERATORS[filter] : undefined;
  if (trimmed && op) return `${trimmed} ${op}`;
  return trimmed || op || undefined;
}

/**
 * Conversation-level check for a list filter. The search operator only narrows the
 * candidates per message (a conversation with one starred and one unstarred message
 * matches `is:unstarred`), so rows are filtered again on the conversation's own state:
 * "unstarred" means no starred message, "read" means no unread message.
 */
export function matchesListFilter(
  thread: { unreadCount: number; isStarred: boolean },
  filter: ListFilter | undefined,
): boolean {
  switch (filter) {
    case 'unread': return thread.unreadCount > 0;
    case 'read': return thread.unreadCount === 0;
    case 'starred': return thread.isStarred;
    case 'unstarred': return !thread.isStarred;
    default: return true;
  }
}

export interface MailView {
  /** Mailbox id or 'all'. */
  mailbox: string;
  folder: Folder;
  labelId?: string;
  search?: string;
  filter?: ListFilter;
  threadId?: string;
}

export type ViewPatch = Partial<{
  mailbox: string;
  folder: Folder;
  labelId: string | null;
  search: string | null;
  filter: ListFilter | null;
  threadId: string | null;
}>;

export const FOLDERS: readonly Folder[] = ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'scheduled', 'archive', 'spam', 'trash', 'all'];

/** Folders listed in the sidebar, in order. */
export const NAV_FOLDERS: readonly Folder[] = ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'scheduled', 'archive', 'spam', 'trash'];

export function isFolder(v: string | null | undefined): v is Folder {
  return !!v && (FOLDERS as readonly string[]).includes(v);
}

interface ParamsLike {
  get(name: string): string | null;
  toString(): string;
}

export function parseView(sp: ParamsLike): MailView {
  const f = sp.get('f');
  const l = sp.get('l') || undefined;
  const r = sp.get('r');
  return {
    mailbox: sp.get('m') || 'all',
    // A label view shows the label across all folders unless a folder is given.
    folder: isFolder(f) ? f : l ? 'all' : 'inbox',
    labelId: l,
    search: sp.get('q') || undefined,
    filter: isListFilter(r) ? r : undefined,
    threadId: sp.get('t') || undefined,
  };
}

/** Builds the /mail/ URL for `view` + `patch`, keeping unrelated params (e.g. demo=1). */
export function viewHref(current: ParamsLike, view: MailView, patch: ViewPatch): string {
  const next = new URLSearchParams(current.toString());
  const set = (key: string, value: string | null | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  const mailbox = patch.mailbox ?? view.mailbox;
  set('m', mailbox === 'all' ? null : mailbox);
  const folder = patch.folder ?? view.folder;
  const labelId = patch.labelId === undefined ? view.labelId : patch.labelId;
  set('f', labelId ? (folder === 'all' ? null : folder) : folder === 'inbox' ? null : folder);
  set('l', labelId);
  set('q', patch.search === undefined ? view.search : patch.search);
  set('r', patch.filter === undefined ? view.filter : patch.filter);
  set('t', patch.threadId === undefined ? view.threadId : patch.threadId);
  const qs = next.toString();
  return qs ? `/mail/?${qs}` : '/mail/';
}

export const FOLDER_ICONS = {
  inbox: 'inbox',
  starred: 'star',
  snoozed: 'alarm',
  sent: 'send',
  drafts: 'file',
  scheduled: 'clock',
  archive: 'archive',
  spam: 'alert',
  trash: 'trash',
  all: 'list',
} as const satisfies Record<Folder, string>;
