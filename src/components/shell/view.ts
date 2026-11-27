import type { Folder } from '@/lib/backend/types';

/** The open view; lives in the query string: /mail/?m=&f=&l=&q=&t= */
export interface MailView {
  /** Mailbox id or 'all'. */
  mailbox: string;
  folder: Folder;
  labelId?: string;
  search?: string;
  threadId?: string;
}

export type ViewPatch = Partial<{ mailbox: string; folder: Folder; labelId: string | null; search: string | null; threadId: string | null }>;

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
  return {
    mailbox: sp.get('m') || 'all',
    // A label view shows the label across all folders unless a folder is given.
    folder: isFolder(f) ? f : l ? 'all' : 'inbox',
    labelId: l,
    search: sp.get('q') || undefined,
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
