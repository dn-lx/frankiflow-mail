export type Folder = 'inbox' | 'sent' | 'drafts' | 'scheduled' | 'snoozed' | 'archive' | 'spam' | 'trash' | 'starred' | 'all';
export type Priority = 'low' | 'normal' | 'high';
export interface Mailbox { id: string; address: string; displayName: string; isPrimary: boolean; canSend: boolean }
export interface Label { id: string; name: string; color: string }
export interface AttachmentMeta { id: string; messageId: string; filename: string; contentType: string; size: number }
export interface Message {
  id: string; threadId: string; mailboxId: string; direction: 'inbound' | 'outbound' | 'draft';
  folder: Exclude<Folder, 'starred' | 'all'>;
  from: { address: string; name: string }; to: string[]; cc: string[]; bcc: string[]; replyTo?: string;
  subject: string; textBody: string; htmlBody: string; preview: string;
  isRead: boolean; isStarred: boolean; isPinned: boolean; priority: Priority;
  hasAttachments: boolean; attachments: AttachmentMeta[]; labelIds: string[];
  sentAt?: string; receivedAt?: string; snoozedUntil?: string; scheduledAt?: string;
  inReplyTo?: string; references?: string; createdAt: string; updatedAt: string;
}
export interface ThreadSummary {
  id: string; subject: string; lastMessageAt: string; messageCount: number; unreadCount: number;
  participants: string[]; preview: string; isStarred: boolean; isPinned: boolean; priority: Priority;
  hasAttachments: boolean; labelIds: string[]; mailboxIds: string[]; latestMessageId: string;
}
export interface ThreadQuery { mailboxId?: string; folder: Folder; labelId?: string; search?: string; limit?: number; before?: string }
export interface MessagePatch { isRead?: boolean; isStarred?: boolean; isPinned?: boolean; priority?: Priority; folder?: Message['folder']; snoozedUntil?: string | null; labelIdsAdd?: string[]; labelIdsRemove?: string[] }
export interface OutgoingAttachment { filename: string; contentType: string; size: number; data: Blob }
export interface Draft { id?: string; mailboxId: string; to: string[]; cc: string[]; bcc: string[]; subject: string; html: string; text: string; inReplyToMessageId?: string; attachments: (OutgoingAttachment | AttachmentMeta)[]; scheduledAt?: string }
export interface SendResult { ok: boolean; messageId?: string; error?: string; queued?: boolean }
export interface UserSession { userId: string; email: string; role: 'admin' | 'member'; mode: 'demo' | 'live' }
export interface Settings { theme: 'system' | 'light' | 'dark'; density: 'comfortable' | 'compact'; readingPane: 'right' | 'bottom' | 'off'; conversationView: boolean; loadRemoteImages: 'ask' | 'always'; undoSendSeconds: 0 | 5 | 10; language: 'de' | 'en' }
export interface Signature { id: string; mailboxId: string; html: string; isDefault: boolean }
export interface Template { id: string; name: string; subject: string; html: string }
export interface Contact { address: string; name: string; lastUsedAt?: string }
export interface DemoUser { email: string; name: string; role: 'admin' | 'member'; mailboxAddresses: string[] }

export interface MailBackend {
  readonly mode: 'demo' | 'live';
  // auth
  getSession(): Promise<UserSession | null>;
  signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  changePassword(newPassword: string): Promise<{ ok: boolean; error?: string }>;
  onChange(listener: () => void): () => void; // realtime or demo updates; returns unsubscribe
  // mail
  listMailboxes(): Promise<Mailbox[]>;
  listThreads(q: ThreadQuery): Promise<{ threads: ThreadSummary[]; nextBefore?: string }>;
  getThread(threadId: string): Promise<Message[]>; // oldest first
  updateMessages(messageIds: string[], patch: MessagePatch): Promise<void>;
  deleteForever(messageIds: string[]): Promise<void>; // only from trash/spam
  counts(mailboxId?: string): Promise<Partial<Record<Folder, number>>>; // unread per folder
  // labels
  listLabels(): Promise<Label[]>; createLabel(name: string, color: string): Promise<Label>; deleteLabel(id: string): Promise<void>;
  // compose
  saveDraft(d: Draft): Promise<{ id: string }>; deleteDraft(id: string): Promise<void>;
  send(d: Draft): Promise<SendResult>;
  attachmentUrl(a: AttachmentMeta): Promise<string>;
  suggestContacts(prefix: string): Promise<Contact[]>;
  // settings
  getSettings(): Promise<Settings>; saveSettings(s: Settings): Promise<void>;
  listSignatures(): Promise<Signature[]>; saveSignature(s: Signature): Promise<void>;
  listTemplates(): Promise<Template[]>; saveTemplate(t: Template): Promise<Template>; deleteTemplate(id: string): Promise<void>;
  // demo only (live implementation throws 'not available in live mode')
  listDemoUsers(): Promise<DemoUser[]>; createDemoUser(u: DemoUser & { password: string }): Promise<void>; resetDemo(): Promise<void>;
}
