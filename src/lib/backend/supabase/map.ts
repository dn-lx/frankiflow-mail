import type {
  AttachmentMeta, Draft, Label, Mailbox, Message, MessagePatch, Settings, ThreadSummary,
} from '../types.ts';

export type Row = Record<string, unknown>;

export function row(value: unknown): Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Row : {};
}

export function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(row) : [];
}

export function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optional(value: unknown): string | undefined {
  return string(value) || undefined;
}

function boolean(value: unknown, fallback = false): boolean {
  if (value === true || value === 'true' || value === 1) return true;
  if (value === false || value === 'false' || value === 0) return false;
  return fallback;
}

export function addresses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => string(v).trim()).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return addresses(parsed);
  } catch { /* Older clients may supply a delimited string. */ }
  return value.replace(/^\{|\}$/g, '').split(/[;,]/)
    .map(v => v.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

export function mailboxFromRow(account: Row, grant?: Row): Mailbox {
  return {
    id: string(account.id), address: string(account.address),
    displayName: string(account.display_name) || 'FrankiFlow',
    isPrimary: boolean(account.is_primary), canSend: boolean(grant?.can_send, true),
  };
}

export function mailboxToRow(mailbox: Mailbox): Row {
  return { id: mailbox.id, address: mailbox.address, display_name: mailbox.displayName,
    is_primary: mailbox.isPrimary };
}

export function labelFromRow(label: Row): Label {
  return { id: string(label.id), name: string(label.name), color: string(label.color) || '#0c3447' };
}

export function labelToRow(label: Label): Row {
  return { id: label.id, name: label.name, color: label.color };
}

export function attachmentFromRow(attachment: Row): AttachmentMeta {
  const size = Number(attachment.size_bytes ?? 0);
  return {
    id: string(attachment.id), messageId: string(attachment.message_id),
    filename: string(attachment.filename) || 'attachment',
    contentType: string(attachment.content_type) || 'application/octet-stream',
    size: Number.isFinite(size) ? Math.max(0, size) : 0,
  };
}

export function attachmentToRow(attachment: AttachmentMeta, storagePath: string): Row {
  return { id: attachment.id, message_id: attachment.messageId, filename: attachment.filename,
    content_type: attachment.contentType, size_bytes: attachment.size, storage_path: storagePath };
}

const storedFolders = new Set(['inbox', 'sent', 'drafts', 'scheduled', 'snoozed', 'archive', 'spam', 'trash']);

export function messageFromRow(
  message: Row,
  attachments: AttachmentMeta[] = [],
  labelIds: string[] = [],
  mailboxes: Mailbox[] = [],
  now = Date.now(),
): Message {
  const direction = message.direction === 'draft' ? 'draft'
    : message.direction === 'outbound' ? 'outbound' : 'inbound';
  const fallbackFolder = direction === 'draft' ? 'drafts' : direction === 'outbound' ? 'sent' : 'inbox';
  let folder = (storedFolders.has(string(message.folder)) ? message.folder : fallbackFolder) as Message['folder'];
  const snoozedUntil = optional(message.snoozed_until);
  if (folder === 'snoozed' && snoozedUntil && Date.parse(snoozedUntil) <= now) folder = 'inbox';
  const account = mailboxes.find(m => m.id === message.account_id)
    ?? mailboxes.find(m => m.address === message.from_address)
    ?? mailboxes.find(m => m.isPrimary);
  const createdAt = string(message.created_at) || string(message.received_at)
    || string(message.sent_at) || '1970-01-01T00:00:00.000Z';
  return {
    id: string(message.id), threadId: string(message.thread_id) || string(message.id),
    mailboxId: account?.id || string(message.account_id), direction, folder,
    from: { address: string(message.from_address), name: string(message.from_name) },
    to: addresses(message.to_addresses), cc: addresses(message.cc_addresses), bcc: addresses(message.bcc_addresses),
    replyTo: optional(message.reply_to), subject: string(message.subject),
    textBody: string(message.text_body), htmlBody: string(message.html_body), preview: string(message.preview),
    isRead: boolean(message.is_read), isStarred: boolean(message.is_starred), isPinned: boolean(message.is_pinned),
    priority: message.priority === 'high' ? 'high' : message.priority === 'low' ? 'low' : 'normal',
    hasAttachments: boolean(message.has_attachments) || attachments.length > 0,
    attachments, labelIds: [...new Set(labelIds)],
    sentAt: optional(message.sent_at), receivedAt: optional(message.received_at), snoozedUntil,
    scheduledAt: optional(message.scheduled_at), inReplyTo: optional(message.in_reply_to),
    references: optional(message.references_header), createdAt,
    updatedAt: string(message.updated_at) || createdAt,
  };
}

export function messageToRow(message: Message): Row {
  return {
    id: message.id, thread_id: message.threadId === message.id ? null : message.threadId,
    account_id: message.mailboxId, direction: message.direction, folder: message.folder,
    from_address: message.from.address, from_name: message.from.name,
    to_addresses: message.to, cc_addresses: message.cc, bcc_addresses: message.bcc,
    reply_to: message.replyTo ?? null, subject: message.subject,
    text_body: message.textBody, html_body: message.htmlBody, preview: message.preview,
    is_read: message.isRead, is_starred: message.isStarred, is_pinned: message.isPinned,
    priority: message.priority, has_attachments: message.hasAttachments,
    sent_at: message.sentAt ?? null, received_at: message.receivedAt ?? null,
    snoozed_until: message.snoozedUntil ?? null, scheduled_at: message.scheduledAt ?? null,
    in_reply_to: message.inReplyTo ?? null, references_header: message.references ?? null,
    created_at: message.createdAt, updated_at: message.updatedAt,
  };
}

export function messagePatchToRow(patch: MessagePatch, now = new Date().toISOString()): Row {
  const result: Row = { updated_at: now };
  if (patch.isRead !== undefined) result.is_read = patch.isRead;
  if (patch.isStarred !== undefined) result.is_starred = patch.isStarred;
  if (patch.isPinned !== undefined) result.is_pinned = patch.isPinned;
  if (patch.priority !== undefined) result.priority = patch.priority;
  if (patch.folder !== undefined) {
    result.folder = patch.folder;
    result.trashed_at = patch.folder === 'trash' ? now : null;
  }
  if (patch.snoozedUntil !== undefined) {
    result.snoozed_until = patch.snoozedUntil;
    if (patch.snoozedUntil && patch.folder === undefined) result.folder = 'snoozed';
    if (patch.snoozedUntil && result.folder !== 'trash') result.trashed_at = null;
  }
  return result;
}

export function draftToRow(draft: Draft, mailbox: Mailbox, threadId: string | null): Row {
  // Legacy deliberately saves neither attachments nor reply headers in a draft.
  return {
    account_id: mailbox.id, thread_id: threadId, direction: 'draft', folder: 'drafts',
    from_address: mailbox.address, to_addresses: draft.to, cc_addresses: draft.cc, bcc_addresses: draft.bcc,
    subject: draft.subject || '', text_body: draft.text || '', html_body: draft.html || '',
    preview: (draft.text || '').replace(/\s+/g, ' ').slice(0, 180),
    is_read: true, updated_at: new Date().toISOString(),
  };
}

// Summaries come from messages; the browser never reads/writes the threads table.
export function threadsFromMessages(messages: Message[]): ThreadSummary[] {
  const groups = new Map<string, Message[]>();
  for (const message of messages) {
    const group = groups.get(message.threadId) ?? [];
    group.push(message);
    groups.set(message.threadId, group);
  }
  return [...groups.entries()].map(([id, group]) => {
    const latest = group[0]; // The server page is ordered by created_at descending.
    return {
      id, subject: latest.subject, lastMessageAt: latest.createdAt, messageCount: group.length,
      unreadCount: group.filter(m => !m.isRead).length,
      participants: [...new Set(group.flatMap(m => [m.from.address, ...m.to]).filter(Boolean))],
      preview: latest.preview, isStarred: group.some(m => m.isStarred), isPinned: group.some(m => m.isPinned),
      priority: group.some(m => m.priority === 'high') ? 'high' as const
        : group.every(m => m.priority === 'low') ? 'low' as const : 'normal' as const,
      hasAttachments: group.some(m => m.hasAttachments), labelIds: [...new Set(group.flatMap(m => m.labelIds))],
      mailboxIds: [...new Set(group.map(m => m.mailboxId))], latestMessageId: latest.id,
    };
  });
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system', density: 'comfortable', readingPane: 'right', conversationView: true,
  loadRemoteImages: 'ask', undoSendSeconds: 5, language: 'de',
};

export function settingsFromRow(settings: Row = {}, local: Row = {}): Settings {
  const pane = settings.preview_pane === 'off' ? 'off'
    : settings.preview_pane === 'bottom' || local.readingPane === 'bottom' ? 'bottom' : 'right';
  return {
    theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : 'system',
    density: settings.density === 'compact' ? 'compact' : 'comfortable', readingPane: pane,
    conversationView: boolean(settings.conversation_view, true),
    loadRemoteImages: local.loadRemoteImages === 'always' ? 'always' : 'ask',
    undoSendSeconds: local.undoSendSeconds === 0 || local.undoSendSeconds === 10 ? local.undoSendSeconds : 5,
    language: local.language === 'en' ? 'en' : 'de',
  };
}

export function settingsToRow(settings: Settings, previous: Row = {}): Row {
  const result: Row = {
    ...previous, theme: settings.theme, density: settings.density,
    preview_pane: settings.readingPane === 'bottom' ? 'right' : settings.readingPane,
    conversation_view: settings.conversationView, updated_at: new Date().toISOString(),
  };
  delete result.created_at;
  return result;
}

export function settingsToLocal(settings: Settings): Row {
  return { readingPane: settings.readingPane, loadRemoteImages: settings.loadRemoteImages,
    undoSendSeconds: settings.undoSendSeconds, language: settings.language };
}
