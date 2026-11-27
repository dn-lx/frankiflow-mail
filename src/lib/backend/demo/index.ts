import type {
  AttachmentMeta,
  Contact,
  DemoUser,
  Draft,
  Folder,
  Label,
  MailBackend,
  Mailbox,
  Message,
  MessagePatch,
  OutgoingAttachment,
  Priority,
  SendResult,
  Settings,
  Signature,
  Template,
  ThreadQuery,
  ThreadSummary,
  UserSession,
} from '../types.ts';
import {
  bytesToBase64,
  clearAttachmentUrlCache,
  createAttachmentUrl,
  revokeAttachmentUrl,
} from './attachments.ts';
import { matchesSearch, parseSearch } from './search.ts';
import { createSeedState } from './seed.ts';
import {
  DEFAULT_SETTINGS,
  generateId,
  hashPassword,
  loadSession,
  loadState,
  resolveStorage,
  saveSession,
  saveState,
  verifyPassword,
  type DemoState,
  type DemoUserRecord,
} from './store.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_MOVE_FOLDERS = new Set<Message['folder']>([
  'inbox',
  'archive',
  'spam',
  'trash',
  'snoozed',
]);

const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

function messageTimestamp(m: Message): string {
  return m.sentAt ?? m.receivedAt ?? m.createdAt;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildPreview(text: string, html: string): string {
  const src = (text || stripHtml(html)).replace(/\s+/g, ' ').trim();
  return src.length > 130 ? `${src.slice(0, 127)}...` : src;
}

function isOutgoingAttachment(
  att: OutgoingAttachment | AttachmentMeta
): att is OutgoingAttachment {
  return 'data' in att;
}

type PreparedAttachment =
  | {
      kind: 'new';
      id: string;
      filename: string;
      contentType: string;
      size: number;
      base64: string;
    }
  | {
      kind: 'existing';
      meta: AttachmentMeta;
    };

async function prepareAttachments(
  items: (OutgoingAttachment | AttachmentMeta)[]
): Promise<PreparedAttachment[]> {
  const prepared: PreparedAttachment[] = [];
  for (const item of items) {
    if (isOutgoingAttachment(item)) {
      const buffer = await item.data.arrayBuffer();
      prepared.push({
        kind: 'new',
        id: generateId(),
        filename: item.filename,
        contentType: item.contentType || 'application/octet-stream',
        size: item.size,
        base64: bytesToBase64(new Uint8Array(buffer)),
      });
    } else {
      prepared.push({ kind: 'existing', meta: item });
    }
  }
  return prepared;
}

function applyPreparedAttachments(
  state: DemoState,
  messageId: string,
  prepared: PreparedAttachment[]
): AttachmentMeta[] {
  return prepared.map((item) => {
    if (item.kind === 'new') {
      state.customAttachments[item.id] = {
        contentType: item.contentType,
        base64: item.base64,
      };
      return {
        id: item.id,
        messageId,
        filename: item.filename,
        contentType: item.contentType,
        size: item.size,
      };
    }
    return {
      ...item.meta,
      messageId,
    };
  });
}

function pruneUnusedCustomAttachments(
  state: DemoState,
  candidateIds: Iterable<string>
): void {
  const stillReferenced = new Set<string>();
  for (const msg of state.messages) {
    for (const att of msg.attachments) {
      stillReferenced.add(att.id);
    }
  }
  for (const id of candidateIds) {
    if (!stillReferenced.has(id)) {
      delete state.customAttachments[id];
      revokeAttachmentUrl(id);
    }
  }
}

function highestPriority(messages: Message[]): Priority {
  let best: Priority = 'low';
  for (const m of messages) {
    if (PRIORITY_RANK[m.priority] > PRIORITY_RANK[best]) {
      best = m.priority;
    }
  }
  return best;
}

function cloneAttachmentsForCopy(
  attachments: AttachmentMeta[],
  newMessageId: string
): AttachmentMeta[] {
  return attachments.map((att) => ({
    ...att,
    messageId: newMessageId,
  }));
}

function compareThreadsDesc(a: ThreadSummary, b: ThreadSummary): number {
  if (a.lastMessageAt !== b.lastMessageAt) {
    return a.lastMessageAt > b.lastMessageAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id > b.id ? -1 : 1;
  }
  return 0;
}

function deliverToLocalMailboxes(
  state: DemoState,
  outbound: Message,
  nowIso: string
): void {
  const recipients = new Set(
    [...outbound.to, ...outbound.cc, ...outbound.bcc].map((a) =>
      a.trim().toLowerCase()
    )
  );
  for (const mb of state.mailboxes) {
    if (!recipients.has(mb.address.toLowerCase())) continue;
    const copyId = generateId();
    const copy: Message = {
      id: copyId,
      threadId: outbound.threadId,
      mailboxId: mb.id,
      direction: 'inbound',
      folder: 'inbox',
      from: { ...outbound.from },
      to: [...outbound.to],
      cc: [...outbound.cc],
      bcc: [],
      replyTo: outbound.replyTo,
      subject: outbound.subject,
      textBody: outbound.textBody,
      htmlBody: outbound.htmlBody,
      preview: outbound.preview,
      isRead: false,
      isStarred: false,
      isPinned: false,
      priority: outbound.priority,
      hasAttachments: outbound.attachments.length > 0,
      attachments: cloneAttachmentsForCopy(outbound.attachments, copyId),
      labelIds: [],
      receivedAt: nowIso,
      inReplyTo: outbound.inReplyTo,
      references: outbound.references,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.messages.push(copy);
  }
}

export function createDemoBackend(storage?: Storage): MailBackend {
  const store = resolveStorage(storage);
  const skipLatency = storage !== undefined;
  const listeners = new Set<() => void>();
  let schedulerTimer: ReturnType<typeof setInterval> | null = null;
  let chain: Promise<void> = Promise.resolve();

  function mutate<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async function maybeDelay(): Promise<void> {
    if (skipLatency) return;
    const ms = 40 + Math.floor(Math.random() * 81);
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  function notify(): void {
    for (const listener of Array.from(listeners)) {
      listener();
    }
  }

  function processDueTimers(state: DemoState): boolean {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let changed = false;

    for (const msg of state.messages) {
      if (
        msg.folder === 'snoozed' &&
        msg.snoozedUntil &&
        Date.parse(msg.snoozedUntil) <= nowMs
      ) {
        msg.folder = 'inbox';
        delete msg.snoozedUntil;
        msg.updatedAt = nowIso;
        changed = true;
      } else if (
        msg.folder === 'scheduled' &&
        msg.scheduledAt &&
        Date.parse(msg.scheduledAt) <= nowMs
      ) {
        const sentTime = msg.scheduledAt;
        msg.folder = 'sent';
        msg.direction = 'outbound';
        msg.sentAt = sentTime;
        delete msg.scheduledAt;
        msg.updatedAt = nowIso;
        deliverToLocalMailboxes(state, msg, sentTime);
        changed = true;
      }
    }

    return changed;
  }

  async function ensureStateUnlocked(): Promise<DemoState> {
    let state = loadState(store);
    if (!state) {
      state = await createSeedState();
      saveState(store, state);
    }
    if (processDueTimers(state)) {
      saveState(store, state);
      notify();
    }
    return state;
  }

  function ensureState(): Promise<DemoState> {
    return mutate(() => ensureStateUnlocked());
  }

  function requireUser(state: DemoState): {
    session: UserSession;
    user: DemoUserRecord;
  } {
    const session = loadSession(store);
    if (!session) {
      throw new Error('auth:required');
    }
    const user = state.users.find((u) => u.id === session.userId);
    if (!user) {
      throw new Error('auth:required');
    }
    return { session, user };
  }

  function getVisibleMailboxIds(
    state: DemoState,
    user: DemoUserRecord
  ): Set<string> {
    const allowedAddrs = new Set(
      user.mailboxAddresses.map((a) => a.toLowerCase())
    );
    const ids = new Set<string>();
    for (const mb of state.mailboxes) {
      if (allowedAddrs.has(mb.address.toLowerCase())) {
        ids.add(mb.id);
      }
    }
    return ids;
  }

  function ensureUserDefaults(state: DemoState, user: DemoUserRecord): void {
    if (!state.settingsByUser[user.id]) {
      state.settingsByUser[user.id] = { ...DEFAULT_SETTINGS };
    }
    if (!state.signaturesByUser[user.id]) {
      const visibleIds = getVisibleMailboxIds(state, user);
      state.signaturesByUser[user.id] = state.mailboxes
        .filter((mb) => visibleIds.has(mb.id))
        .map((mb) => ({
          id: generateId(),
          mailboxId: mb.id,
          html: `<p>Mit freundlichen Grüßen<br><strong>${escapeHtml(mb.displayName)}</strong><br>${escapeHtml(mb.address)}</p>`,
          isDefault: true,
        }));
    }
    if (!state.templatesByUser[user.id]) {
      const firstUserId = state.users[0]?.id;
      const baseTemplates = firstUserId
        ? state.templatesByUser[firstUserId] ?? []
        : [];
      state.templatesByUser[user.id] = baseTemplates.map((t) => ({
        ...t,
        id: generateId(),
      }));
    }
  }

  function messageMatchesFolder(m: Message, folder: Folder): boolean {
    if (folder === 'starred') return m.isStarred;
    if (folder === 'all') {
      return m.folder !== 'spam' && m.folder !== 'trash' && m.folder !== 'drafts';
    }
    return m.folder === folder;
  }

  return {
    mode: 'demo',

    async getSession(): Promise<UserSession | null> {
      const state = await ensureState();
      const session = loadSession(store);
      if (!session) return null;
      const exists = state.users.some((u) => u.id === session.userId);
      if (!exists) {
        saveSession(store, null);
        return null;
      }
      return session;
    },

    async signIn(
      email: string,
      password: string
    ): Promise<{ ok: boolean; error?: string }> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const normalized = email.trim().toLowerCase();
        const user = state.users.find(
          (u) => u.email.toLowerCase() === normalized
        );
        if (!user) {
          return { ok: false, error: 'auth:invalid' };
        }
        const ok = await verifyPassword(
          password,
          user.passwordSalt,
          user.passwordHash
        );
        if (!ok) {
          return { ok: false, error: 'auth:invalid' };
        }
        const session: UserSession = {
          userId: user.id,
          email: user.email,
          role: user.role,
          mode: 'demo',
        };
        saveSession(store, session);
        notify();
        return { ok: true };
      });
    },

    async signOut(): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        saveSession(store, null);
        notify();
      });
    },

    async changePassword(
      newPassword: string
    ): Promise<{ ok: boolean; error?: string }> {
      await maybeDelay();
      return mutate(async () => {
        if (!newPassword || newPassword.length < 8) {
          const preSession = loadSession(store);
          if (!preSession) {
            return { ok: false, error: 'auth:required' };
          }
          return { ok: false, error: 'auth:weak-password' };
        }
        const { salt, hash } = await hashPassword(newPassword);
        const state = await ensureStateUnlocked();
        const session = loadSession(store);
        const user = session
          ? state.users.find((u) => u.id === session.userId)
          : undefined;
        if (!session || !user) {
          return { ok: false, error: 'auth:required' };
        }
        user.passwordSalt = salt;
        user.passwordHash = hash;
        saveState(store, state);
        return { ok: true };
      });
    },

    onChange(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1 && schedulerTimer === null) {
        schedulerTimer = setInterval(() => {
          mutate(() => ensureStateUnlocked()).catch(() => {});
        }, 30_000);
        if (
          typeof schedulerTimer === 'object' &&
          schedulerTimer !== null &&
          'unref' in schedulerTimer &&
          typeof schedulerTimer.unref === 'function'
        ) {
          schedulerTimer.unref();
        }
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && schedulerTimer !== null) {
          clearInterval(schedulerTimer);
          schedulerTimer = null;
        }
      };
    },

    async listMailboxes(): Promise<Mailbox[]> {
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);
      return state.mailboxes
        .filter((mb) => visibleIds.has(mb.id))
        .map((mb) => ({ ...mb }));
    },

    async listThreads(
      q: ThreadQuery
    ): Promise<{ threads: ThreadSummary[]; nextBefore?: string }> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const visibleMessages = state.messages.filter((m) => {
        if (!visibleIds.has(m.mailboxId)) return false;
        if (q.mailboxId && m.mailboxId !== q.mailboxId) return false;
        return true;
      });

      const byThread = new Map<string, Message[]>();
      for (const msg of visibleMessages) {
        const list = byThread.get(msg.threadId);
        if (list) {
          list.push(msg);
        } else {
          byThread.set(msg.threadId, [msg]);
        }
      }

      const labelsByName = new Map<string, string>();
      for (const lbl of state.labels) {
        labelsByName.set(lbl.name, lbl.id);
      }

      const parsedSearch =
        q.search && q.search.trim().length > 0 ? parseSearch(q.search) : null;

      const summaries: ThreadSummary[] = [];

      // Trash, spam and drafts are listed by their own messages. Every other
      // folder shows the whole conversation, minus trash, spam and drafts.
      const ownFolderOnly =
        q.folder === 'trash' || q.folder === 'spam' || q.folder === 'drafts';

      for (const [threadId, msgs] of byThread.entries()) {
        const folderMsgs = msgs.filter((m) => messageMatchesFolder(m, q.folder));
        if (folderMsgs.length === 0) continue;
        if (q.labelId && !folderMsgs.some((m) => m.labelIds.includes(q.labelId!))) {
          continue;
        }
        if (
          parsedSearch &&
          !folderMsgs.some((m) => matchesSearch(m, parsedSearch, labelsByName))
        ) {
          continue;
        }

        const conversationMsgs = ownFolderOnly
          ? folderMsgs
          : msgs.filter(
              (m) =>
                m.folder !== 'trash' &&
                m.folder !== 'spam' &&
                m.direction !== 'draft'
            );
        // A thread listed in a folder always has at least its folder messages.
        const summaryMsgs =
          conversationMsgs.length > 0 ? conversationMsgs : folderMsgs;

        const sorted = [...summaryMsgs].sort((a, b) => {
          const tsA = messageTimestamp(a);
          const tsB = messageTimestamp(b);
          if (tsA !== tsB) return tsA < tsB ? -1 : 1;
          if (a.id !== b.id) return a.id < b.id ? -1 : 1;
          return 0;
        });
        const latest = sorted[sorted.length - 1];

        const participantSet = new Set<string>();
        const labelSet = new Set<string>();
        const mailboxSet = new Set<string>();
        let unreadCount = 0;

        for (const m of sorted) {
          participantSet.add(m.from.name || m.from.address);
          if (!m.isRead) unreadCount += 1;
          for (const lid of m.labelIds) labelSet.add(lid);
          mailboxSet.add(m.mailboxId);
        }

        // Flags keep the folder messages in the mix, so e.g. a starred trash
        // message still marks the thread as starred in the starred list.
        const flagMsgs = [...sorted, ...folderMsgs];

        summaries.push({
          id: threadId,
          subject: latest.subject,
          lastMessageAt: messageTimestamp(latest),
          messageCount: sorted.length,
          unreadCount,
          participants: Array.from(participantSet),
          preview: latest.preview,
          isStarred: flagMsgs.some((m) => m.isStarred),
          isPinned: flagMsgs.some((m) => m.isPinned),
          priority: highestPriority(flagMsgs),
          hasAttachments: flagMsgs.some(
            (m) => m.hasAttachments || m.attachments.length > 0
          ),
          labelIds: Array.from(labelSet),
          mailboxIds: Array.from(mailboxSet),
          latestMessageId: latest.id,
        });
      }

      const pinned = summaries.filter((t) => t.isPinned).sort(compareThreadsDesc);
      const unpinned = summaries
        .filter((t) => !t.isPinned)
        .sort(compareThreadsDesc);

      const limit = q.limit ?? 50;
      let page: ThreadSummary[];
      let hasMore: boolean;
      let cursorSource: ThreadSummary | undefined;

      if (!q.before) {
        const unpinnedLimit = Math.max(0, limit - pinned.length);
        const unpinnedPage = unpinned.slice(0, unpinnedLimit);
        page = [...pinned.slice(0, limit), ...unpinnedPage];
        hasMore = unpinned.length > unpinnedLimit;
        cursorSource = unpinnedPage[unpinnedPage.length - 1];
      } else {
        const sepIdx = q.before.indexOf('|');
        const beforeIso = sepIdx >= 0 ? q.before.slice(0, sepIdx) : q.before;
        const beforeId = sepIdx >= 0 ? q.before.slice(sepIdx + 1) : '';
        const filtered = unpinned.filter((t) => {
          if (t.lastMessageAt !== beforeIso) {
            return t.lastMessageAt < beforeIso;
          }
          return sepIdx >= 0 ? t.id < beforeId : false;
        });
        page = filtered.slice(0, limit);
        hasMore = filtered.length > limit;
        cursorSource = page[page.length - 1];
      }

      const nextBefore = hasMore
        ? cursorSource
          ? `${cursorSource.lastMessageAt}|${cursorSource.id}`
          : '~|'
        : undefined;

      return { threads: page, nextBefore };
    },

    async getThread(threadId: string): Promise<Message[]> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const visible = state.messages.filter(
        (m) => m.threadId === threadId && visibleIds.has(m.mailboxId)
      );
      if (visible.length === 0) {
        throw new Error('not-found');
      }

      return [...visible]
        .sort((a, b) => messageTimestamp(a).localeCompare(messageTimestamp(b)))
        .map((m) => ({
          ...m,
          from: { ...m.from },
          to: [...m.to],
          cc: [...m.cc],
          bcc: [...m.bcc],
          attachments: m.attachments.map((a) => ({ ...a })),
          labelIds: [...m.labelIds],
        }));
    },

    async updateMessages(
      messageIds: string[],
      patch: MessagePatch
    ): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        const visibleIds = getVisibleMailboxIds(state, user);

        const targets: Message[] = [];
        for (const id of messageIds) {
          const msg = state.messages.find((m) => m.id === id);
          if (!msg || !visibleIds.has(msg.mailboxId)) {
            throw new Error('not-found');
          }
          targets.push(msg);
        }

        if (patch.folder !== undefined) {
          if (patch.folder === 'drafts') {
            if (targets.some((m) => m.direction !== 'draft')) {
              throw new Error('invalid:folder');
            }
          } else if (!ALLOWED_MOVE_FOLDERS.has(patch.folder)) {
            throw new Error('invalid:folder');
          }

          if (patch.folder === 'snoozed') {
            if (
              typeof patch.snoozedUntil !== 'string' ||
              patch.snoozedUntil.trim().length === 0 ||
              Number.isNaN(Date.parse(patch.snoozedUntil))
            ) {
              throw new Error('invalid:snoozed-until');
            }
          }
        }

        if (patch.labelIdsAdd && patch.labelIdsAdd.length > 0) {
          const validLabelIds = new Set(state.labels.map((l) => l.id));
          for (const lid of patch.labelIdsAdd) {
            if (!validLabelIds.has(lid)) {
              throw new Error('invalid:label');
            }
          }
        }

        const nowIso = new Date().toISOString();
        for (const msg of targets) {
          if (patch.isRead !== undefined) msg.isRead = patch.isRead;
          if (patch.isStarred !== undefined) msg.isStarred = patch.isStarred;
          if (patch.isPinned !== undefined) msg.isPinned = patch.isPinned;
          if (patch.priority !== undefined) msg.priority = patch.priority;
          if (patch.folder !== undefined) {
            msg.folder = patch.folder;
            if (patch.folder === 'snoozed') {
              msg.snoozedUntil = patch.snoozedUntil as string;
            } else {
              delete msg.snoozedUntil;
            }
          } else if (patch.snoozedUntil !== undefined) {
            if (patch.snoozedUntil === null) {
              delete msg.snoozedUntil;
            } else {
              msg.snoozedUntil = patch.snoozedUntil;
            }
          }
          if (patch.labelIdsAdd && patch.labelIdsAdd.length > 0) {
            const set = new Set(msg.labelIds);
            for (const lid of patch.labelIdsAdd) set.add(lid);
            msg.labelIds = Array.from(set);
          }
          if (patch.labelIdsRemove && patch.labelIdsRemove.length > 0) {
            const removeSet = new Set(patch.labelIdsRemove);
            msg.labelIds = msg.labelIds.filter((lid) => !removeSet.has(lid));
          }
          msg.updatedAt = nowIso;
        }

        saveState(store, state);
        notify();
      });
    },

    async deleteForever(messageIds: string[]): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        const visibleIds = getVisibleMailboxIds(state, user);

        const deleteSet = new Set<string>();
        const removedAttIds: string[] = [];
        for (const id of messageIds) {
          const msg = state.messages.find((m) => m.id === id);
          if (!msg || !visibleIds.has(msg.mailboxId)) {
            throw new Error('not-found');
          }
          if (msg.folder !== 'trash' && msg.folder !== 'spam') {
            throw new Error('permission:denied');
          }
          deleteSet.add(id);
          for (const att of msg.attachments) {
            removedAttIds.push(att.id);
          }
        }

        state.messages = state.messages.filter((m) => !deleteSet.has(m.id));
        pruneUnusedCustomAttachments(state, removedAttIds);
        saveState(store, state);
        notify();
      });
    },

    async counts(mailboxId?: string): Promise<Partial<Record<Folder, number>>> {
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const msgs = state.messages.filter((m) => {
        if (!visibleIds.has(m.mailboxId)) return false;
        if (mailboxId && m.mailboxId !== mailboxId) return false;
        return true;
      });

      const result: Partial<Record<Folder, number>> = {
        inbox: 0,
        sent: 0,
        drafts: 0,
        scheduled: 0,
        snoozed: 0,
        archive: 0,
        spam: 0,
        trash: 0,
        starred: 0,
        all: 0,
      };

      for (const m of msgs) {
        if (m.folder === 'drafts') {
          result.drafts = (result.drafts ?? 0) + 1;
        } else if (m.folder === 'scheduled') {
          result.scheduled = (result.scheduled ?? 0) + 1;
        } else if (!m.isRead) {
          result[m.folder] = (result[m.folder] ?? 0) + 1;
        }

        if (m.isStarred && !m.isRead) {
          result.starred = (result.starred ?? 0) + 1;
        }
        if (m.folder !== 'spam' && m.folder !== 'trash' && !m.isRead) {
          result.all = (result.all ?? 0) + 1;
        }
      }

      return result;
    },

    async listLabels(): Promise<Label[]> {
      const state = await ensureState();
      requireUser(state);
      return state.labels.map((l) => ({ ...l }));
    },

    async createLabel(name: string, color: string): Promise<Label> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        requireUser(state);
        const label: Label = {
          id: `lbl-${generateId()}`,
          name: name.trim(),
          color,
        };
        state.labels.push(label);
        saveState(store, state);
        notify();
        return { ...label };
      });
    },

    async deleteLabel(id: string): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        requireUser(state);
        const idx = state.labels.findIndex((l) => l.id === id);
        if (idx === -1) throw new Error('not-found');
        state.labels.splice(idx, 1);
        for (const m of state.messages) {
          if (m.labelIds.includes(id)) {
            m.labelIds = m.labelIds.filter((lid) => lid !== id);
          }
        }
        saveState(store, state);
        notify();
      });
    },

    async saveDraft(d: Draft): Promise<{ id: string }> {
      await maybeDelay();
      return mutate(async () => {
        const prepared = await prepareAttachments(d.attachments);
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        const visibleIds = getVisibleMailboxIds(state, user);

        if (!visibleIds.has(d.mailboxId)) {
          throw new Error('permission:denied');
        }
        const mailbox = state.mailboxes.find((mb) => mb.id === d.mailboxId);
        if (!mailbox) throw new Error('not-found');

        const nowIso = new Date().toISOString();

        if (d.id) {
          const existing = state.messages.find((m) => m.id === d.id);
          if (!existing) throw new Error('not-found');
          if (!visibleIds.has(existing.mailboxId) || existing.direction !== 'draft') {
            throw new Error('permission:denied');
          }
          const oldAttIds = existing.attachments.map((a) => a.id);
          const attachments = applyPreparedAttachments(state, existing.id, prepared);
          existing.mailboxId = d.mailboxId;
          existing.from = { address: mailbox.address, name: mailbox.displayName };
          existing.to = [...d.to];
          existing.cc = [...d.cc];
          existing.bcc = [...d.bcc];
          existing.subject = d.subject;
          existing.textBody = d.text;
          existing.htmlBody = d.html;
          existing.preview = buildPreview(d.text, d.html);
          existing.attachments = attachments;
          existing.hasAttachments = attachments.length > 0;
          existing.scheduledAt = d.scheduledAt;
          existing.inReplyTo = d.inReplyToMessageId;
          existing.updatedAt = nowIso;

          pruneUnusedCustomAttachments(state, oldAttIds);
          saveState(store, state);
          notify();
          return { id: existing.id };
        }

        const id = generateId();
        let threadId = generateId();
        if (d.inReplyToMessageId) {
          const parent = state.messages.find(
            (m) => m.id === d.inReplyToMessageId && visibleIds.has(m.mailboxId)
          );
          if (parent) threadId = parent.threadId;
        }

        const attachments = applyPreparedAttachments(state, id, prepared);
        const draftMsg: Message = {
          id,
          threadId,
          mailboxId: mailbox.id,
          direction: 'draft',
          folder: 'drafts',
          from: { address: mailbox.address, name: mailbox.displayName },
          to: [...d.to],
          cc: [...d.cc],
          bcc: [...d.bcc],
          subject: d.subject,
          textBody: d.text,
          htmlBody: d.html,
          preview: buildPreview(d.text, d.html),
          isRead: true,
          isStarred: false,
          isPinned: false,
          priority: 'normal',
          hasAttachments: attachments.length > 0,
          attachments,
          labelIds: [],
          scheduledAt: d.scheduledAt,
          inReplyTo: d.inReplyToMessageId,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        state.messages.push(draftMsg);
        saveState(store, state);
        notify();
        return { id };
      });
    },

    async deleteDraft(id: string): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        const visibleIds = getVisibleMailboxIds(state, user);

        const idx = state.messages.findIndex((m) => m.id === id);
        if (idx === -1) throw new Error('not-found');
        const msg = state.messages[idx];
        if (!visibleIds.has(msg.mailboxId) || msg.direction !== 'draft') {
          throw new Error('permission:denied');
        }

        const removedAttIds = msg.attachments.map((a) => a.id);
        state.messages.splice(idx, 1);
        pruneUnusedCustomAttachments(state, removedAttIds);
        saveState(store, state);
        notify();
      });
    },

    async send(d: Draft): Promise<SendResult> {
      await maybeDelay();
      return mutate(async () => {
        const prepared = await prepareAttachments(d.attachments);
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        const visibleIds = getVisibleMailboxIds(state, user);

        if (!visibleIds.has(d.mailboxId)) {
          throw new Error('permission:denied');
        }
        const mailbox = state.mailboxes.find((mb) => mb.id === d.mailboxId);
        if (!mailbox || !mailbox.canSend) {
          throw new Error('permission:denied');
        }

        const allRecipients = [...d.to, ...d.cc, ...d.bcc]
          .map((a) => a.trim())
          .filter((a) => a.length > 0);
        if (
          allRecipients.length === 0 ||
          allRecipients.some((addr) => !EMAIL_RE.test(addr))
        ) {
          throw new Error('compose:invalid-recipient');
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const isScheduled =
          Boolean(d.scheduledAt) && Date.parse(d.scheduledAt!) > nowMs;

        let threadId = generateId();
        if (d.inReplyToMessageId) {
          const parent = state.messages.find(
            (m) => m.id === d.inReplyToMessageId && visibleIds.has(m.mailboxId)
          );
          if (parent) threadId = parent.threadId;
        }

        const messageId = generateId();
        const attachments = applyPreparedAttachments(state, messageId, prepared);

        const sentMsg: Message = {
          id: messageId,
          threadId,
          mailboxId: mailbox.id,
          direction: 'outbound',
          folder: isScheduled ? 'scheduled' : 'sent',
          from: { address: mailbox.address, name: mailbox.displayName },
          to: d.to.map((a) => a.trim()).filter(Boolean),
          cc: d.cc.map((a) => a.trim()).filter(Boolean),
          bcc: d.bcc.map((a) => a.trim()).filter(Boolean),
          subject: d.subject,
          textBody: d.text,
          htmlBody: d.html,
          preview: buildPreview(d.text, d.html),
          isRead: true,
          isStarred: false,
          isPinned: false,
          priority: 'normal',
          hasAttachments: attachments.length > 0,
          attachments,
          labelIds: [],
          sentAt: isScheduled ? undefined : nowIso,
          scheduledAt: isScheduled ? d.scheduledAt : undefined,
          inReplyTo: d.inReplyToMessageId,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        state.messages.push(sentMsg);

        const removedDraftAttIds: string[] = [];
        if (d.id) {
          const draftIdx = state.messages.findIndex(
            (m) =>
              m.id === d.id &&
              m.direction === 'draft' &&
              visibleIds.has(m.mailboxId)
          );
          if (draftIdx !== -1) {
            for (const att of state.messages[draftIdx].attachments) {
              removedDraftAttIds.push(att.id);
            }
            state.messages.splice(draftIdx, 1);
          }
        }

        if (!isScheduled) {
          deliverToLocalMailboxes(state, sentMsg, nowIso);
        }

        if (removedDraftAttIds.length > 0) {
          pruneUnusedCustomAttachments(state, removedDraftAttIds);
        }

        saveState(store, state);
        notify();
        return { ok: true, messageId };
      });
    },

    async attachmentUrl(a: AttachmentMeta): Promise<string> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);
      const belongsToVisible = state.messages.some(
        (m) =>
          visibleIds.has(m.mailboxId) &&
          m.id === a.messageId &&
          m.attachments.some((att) => att.id === a.id)
      );
      if (!belongsToVisible) {
        throw new Error('not-found');
      }
      const custom = state.customAttachments[a.id];
      return createAttachmentUrl(a, custom);
    },

    async suggestContacts(prefix: string): Promise<Contact[]> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const byAddr = new Map<string, Contact>();

      const upsert = (addr: string, name: string, ts?: string): void => {
        const cleanAddr = addr.trim();
        if (!cleanAddr) return;
        const key = cleanAddr.toLowerCase();
        const existing = byAddr.get(key);
        if (!existing) {
          byAddr.set(key, {
            address: cleanAddr,
            name: name.trim() || cleanAddr,
            lastUsedAt: ts,
          });
          return;
        }
        if (name.trim() && existing.name === existing.address) {
          existing.name = name.trim();
        }
        if (
          ts &&
          (!existing.lastUsedAt || ts > existing.lastUsedAt)
        ) {
          existing.lastUsedAt = ts;
        }
      };

      for (const c of state.contacts) {
        upsert(c.address, c.name, c.lastUsedAt);
      }

      for (const m of state.messages) {
        if (!visibleIds.has(m.mailboxId)) continue;
        const ts = messageTimestamp(m);
        upsert(m.from.address, m.from.name, ts);
        for (const addr of [...m.to, ...m.cc, ...m.bcc]) {
          upsert(addr, '', ts);
        }
      }

      const needle = prefix.trim().toLowerCase();
      const all = Array.from(byAddr.values());
      const matched = needle
        ? all.filter(
            (c) =>
              c.address.toLowerCase().includes(needle) ||
              c.name.toLowerCase().includes(needle)
          )
        : all;

      matched.sort((a, b) => {
        if (needle) {
          const aPrefix =
            a.address.toLowerCase().startsWith(needle) ||
            a.name.toLowerCase().startsWith(needle);
          const bPrefix =
            b.address.toLowerCase().startsWith(needle) ||
            b.name.toLowerCase().startsWith(needle);
          if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
        }
        const aTs = a.lastUsedAt ?? '';
        const bTs = b.lastUsedAt ?? '';
        return bTs.localeCompare(aTs);
      });

      return matched.slice(0, 8);
    },

    async getSettings(): Promise<Settings> {
      const state = await ensureState();
      const { user } = requireUser(state);
      ensureUserDefaults(state, user);
      return { ...state.settingsByUser[user.id] };
    },

    async saveSettings(s: Settings): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        state.settingsByUser[user.id] = { ...s };
        saveState(store, state);
        notify();
      });
    },

    async listSignatures(): Promise<Signature[]> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      ensureUserDefaults(state, user);
      return state.signaturesByUser[user.id].map((sig) => ({ ...sig }));
    },

    async saveSignature(s: Signature): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        ensureUserDefaults(state, user);
        const list = state.signaturesByUser[user.id];
        const idx = list.findIndex((item) => item.id === s.id);
        if (idx >= 0) {
          list[idx] = { ...s };
        } else {
          list.push({ ...s, id: s.id || generateId() });
        }
        saveState(store, state);
        notify();
      });
    },

    async listTemplates(): Promise<Template[]> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      ensureUserDefaults(state, user);
      return state.templatesByUser[user.id].map((t) => ({ ...t }));
    },

    async saveTemplate(t: Template): Promise<Template> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        ensureUserDefaults(state, user);
        const list = state.templatesByUser[user.id];
        const idx = list.findIndex((item) => item.id === t.id);
        const saved: Template = {
          id: t.id || generateId(),
          name: t.name,
          subject: t.subject,
          html: t.html,
        };
        if (idx >= 0) {
          list[idx] = saved;
        } else {
          list.push(saved);
        }
        saveState(store, state);
        notify();
        return { ...saved };
      });
    },

    async deleteTemplate(id: string): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const state = await ensureStateUnlocked();
        const { user } = requireUser(state);
        ensureUserDefaults(state, user);
        const list = state.templatesByUser[user.id];
        const idx = list.findIndex((t) => t.id === id);
        if (idx === -1) throw new Error('not-found');
        list.splice(idx, 1);
        saveState(store, state);
        notify();
      });
    },

    async listDemoUsers(): Promise<DemoUser[]> {
      await maybeDelay();
      const state = await ensureState();
      return state.users.map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role,
        mailboxAddresses: [...u.mailboxAddresses],
      }));
    },

    async createDemoUser(u: DemoUser & { password: string }): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const email = u.email.trim();
        const name = u.name.trim();
        if (
          !EMAIL_RE.test(email) ||
          name.length === 0 ||
          u.password.length < 8 ||
          (u.role !== 'admin' && u.role !== 'member')
        ) {
          throw new Error('demo:invalid-user');
        }

        const parsedAddresses: string[] = [];
        for (const rawAddr of u.mailboxAddresses) {
          const addr = rawAddr.trim().toLowerCase();
          if (!EMAIL_RE.test(addr)) {
            throw new Error('demo:invalid-user');
          }
          parsedAddresses.push(addr);
        }

        const { salt: passwordSalt, hash: passwordHash } = await hashPassword(
          u.password
        );
        const state = await ensureStateUnlocked();

        const exists = state.users.some(
          (existing) => existing.email.toLowerCase() === email.toLowerCase()
        );
        if (exists) {
          throw new Error('demo:user-exists');
        }

        for (const addr of parsedAddresses) {
          const mbExists = state.mailboxes.some(
            (mb) => mb.address.toLowerCase() === addr
          );
          if (!mbExists) {
            state.mailboxes.push({
              id: `mb-${generateId()}`,
              address: addr,
              displayName: name,
              isPrimary: false,
              canSend: true,
            });
          }
        }

        const newUser: DemoUserRecord = {
          id: `user-${generateId()}`,
          email,
          name,
          role: u.role,
          mailboxAddresses: parsedAddresses,
          passwordSalt,
          passwordHash,
        };

        state.users.push(newUser);
        ensureUserDefaults(state, newUser);
        saveState(store, state);
        notify();
      });
    },

    async resetDemo(): Promise<void> {
      await maybeDelay();
      return mutate(async () => {
        const fresh = await createSeedState();
        clearAttachmentUrlCache();
        saveState(store, fresh);
        saveSession(store, null);
        notify();
      });
    },
  };
}
