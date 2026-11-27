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
import { bytesToBase64, createAttachmentUrl } from './attachments.ts';
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
  type DemoState,
  type DemoUserRecord,
} from './store.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

function messageTimestamp(m: Message): string {
  return m.sentAt ?? m.receivedAt ?? m.createdAt;
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
  newMessageId: string,
  state: DemoState
): AttachmentMeta[] {
  return attachments.map((att) => {
    const newAttId = generateId();
    const existingCustom = state.customAttachments[att.id];
    if (existingCustom) {
      state.customAttachments[newAttId] = { ...existingCustom };
    }
    return {
      id: newAttId,
      messageId: newMessageId,
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
    };
  });
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
      attachments: cloneAttachmentsForCopy(outbound.attachments, copyId, state),
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

  async function maybeDelay(): Promise<void> {
    if (skipLatency) return;
    const ms = 120 + Math.floor(Math.random() * 181);
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

  async function ensureState(): Promise<DemoState> {
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
          html: `<p>Mit freundlichen Grüßen<br><strong>${mb.displayName}</strong><br>${mb.address}</p>`,
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

  async function persistDraftAttachments(
    state: DemoState,
    messageId: string,
    items: (OutgoingAttachment | AttachmentMeta)[]
  ): Promise<AttachmentMeta[]> {
    const metas: AttachmentMeta[] = [];
    for (const item of items) {
      if (isOutgoingAttachment(item)) {
        const id = generateId();
        const buffer = await item.data.arrayBuffer();
        state.customAttachments[id] = {
          contentType: item.contentType || 'application/octet-stream',
          base64: bytesToBase64(new Uint8Array(buffer)),
        };
        metas.push({
          id,
          messageId,
          filename: item.filename,
          contentType: item.contentType || 'application/octet-stream',
          size: item.size,
        });
      } else {
        metas.push({
          ...item,
          messageId,
        });
      }
    }
    return metas;
  }

  function messageMatchesFolder(m: Message, folder: Folder): boolean {
    if (folder === 'starred') return m.isStarred;
    if (folder === 'all') return m.folder !== 'spam' && m.folder !== 'trash';
    return m.folder === folder;
  }

  return {
    mode: 'demo',

    async getSession(): Promise<UserSession | null> {
      await maybeDelay();
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
      const state = await ensureState();
      const normalized = email.trim().toLowerCase();
      const user = state.users.find(
        (u) => u.email.toLowerCase() === normalized
      );
      if (!user) {
        throw new Error('auth:invalid');
      }
      const hash = await hashPassword(password);
      if (hash !== user.passwordHash) {
        throw new Error('auth:invalid');
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
    },

    async signOut(): Promise<void> {
      await maybeDelay();
      saveSession(store, null);
      notify();
    },

    async changePassword(
      newPassword: string
    ): Promise<{ ok: boolean; error?: string }> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      if (newPassword.length < 8) {
        throw new Error('auth:invalid');
      }
      user.passwordHash = await hashPassword(newPassword);
      saveState(store, state);
      return { ok: true };
    },

    onChange(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1 && schedulerTimer === null) {
        schedulerTimer = setInterval(() => {
          void ensureState();
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
      await maybeDelay();
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

      for (const [threadId, msgs] of byThread.entries()) {
        if (!msgs.some((m) => messageMatchesFolder(m, q.folder))) continue;
        if (q.labelId && !msgs.some((m) => m.labelIds.includes(q.labelId!))) {
          continue;
        }
        if (
          parsedSearch &&
          !msgs.some((m) => matchesSearch(m, parsedSearch, labelsByName))
        ) {
          continue;
        }

        const sorted = [...msgs].sort((a, b) =>
          messageTimestamp(a).localeCompare(messageTimestamp(b))
        );
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

        summaries.push({
          id: threadId,
          subject: latest.subject,
          lastMessageAt: messageTimestamp(latest),
          messageCount: sorted.length,
          unreadCount,
          participants: Array.from(participantSet),
          preview: latest.preview,
          isStarred: sorted.some((m) => m.isStarred),
          isPinned: sorted.some((m) => m.isPinned),
          priority: highestPriority(sorted),
          hasAttachments: sorted.some(
            (m) => m.hasAttachments || m.attachments.length > 0
          ),
          labelIds: Array.from(labelSet),
          mailboxIds: Array.from(mailboxSet),
          latestMessageId: latest.id,
        });
      }

      summaries.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      });

      const filtered = q.before
        ? summaries.filter((t) => t.lastMessageAt < q.before!)
        : summaries;

      const limit = q.limit ?? 50;
      const page = filtered.slice(0, limit);
      const nextBefore =
        filtered.length > limit && page.length > 0
          ? page[page.length - 1].lastMessageAt
          : undefined;

      return { threads: page, nextBefore };
    },

    async getThread(threadId: string): Promise<Message[]> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const allInThread = state.messages.filter((m) => m.threadId === threadId);
      if (allInThread.length === 0) {
        throw new Error('not-found');
      }

      const visible = allInThread.filter((m) => visibleIds.has(m.mailboxId));
      if (visible.length === 0) {
        throw new Error('permission:denied');
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
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const targets: Message[] = [];
      for (const id of messageIds) {
        const msg = state.messages.find((m) => m.id === id);
        if (!msg) throw new Error('not-found');
        if (!visibleIds.has(msg.mailboxId)) {
          throw new Error('permission:denied');
        }
        targets.push(msg);
      }

      const nowIso = new Date().toISOString();
      for (const msg of targets) {
        if (patch.isRead !== undefined) msg.isRead = patch.isRead;
        if (patch.isStarred !== undefined) msg.isStarred = patch.isStarred;
        if (patch.isPinned !== undefined) msg.isPinned = patch.isPinned;
        if (patch.priority !== undefined) msg.priority = patch.priority;
        if (patch.folder !== undefined) msg.folder = patch.folder;
        if (patch.snoozedUntil !== undefined) {
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
    },

    async deleteForever(messageIds: string[]): Promise<void> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const deleteSet = new Set<string>();
      for (const id of messageIds) {
        const msg = state.messages.find((m) => m.id === id);
        if (!msg) throw new Error('not-found');
        if (!visibleIds.has(msg.mailboxId)) {
          throw new Error('permission:denied');
        }
        if (msg.folder !== 'trash' && msg.folder !== 'spam') {
          throw new Error('permission:denied');
        }
        deleteSet.add(id);
      }

      state.messages = state.messages.filter((m) => !deleteSet.has(m.id));
      saveState(store, state);
      notify();
    },

    async counts(mailboxId?: string): Promise<Partial<Record<Folder, number>>> {
      await maybeDelay();
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
      await maybeDelay();
      const state = await ensureState();
      requireUser(state);
      return state.labels.map((l) => ({ ...l }));
    },

    async createLabel(name: string, color: string): Promise<Label> {
      await maybeDelay();
      const state = await ensureState();
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
    },

    async deleteLabel(id: string): Promise<void> {
      await maybeDelay();
      const state = await ensureState();
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
    },

    async saveDraft(d: Draft): Promise<{ id: string }> {
      await maybeDelay();
      const state = await ensureState();
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
        const attachments = await persistDraftAttachments(
          state,
          existing.id,
          d.attachments
        );
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

      const attachments = await persistDraftAttachments(state, id, d.attachments);
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
    },

    async deleteDraft(id: string): Promise<void> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      const visibleIds = getVisibleMailboxIds(state, user);

      const idx = state.messages.findIndex((m) => m.id === id);
      if (idx === -1) throw new Error('not-found');
      const msg = state.messages[idx];
      if (!visibleIds.has(msg.mailboxId) || msg.direction !== 'draft') {
        throw new Error('permission:denied');
      }

      state.messages.splice(idx, 1);
      saveState(store, state);
      notify();
    },

    async send(d: Draft): Promise<SendResult> {
      await maybeDelay();
      const state = await ensureState();
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
      const attachments = await persistDraftAttachments(
        state,
        messageId,
        d.attachments
      );

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

      if (d.id) {
        const draftIdx = state.messages.findIndex(
          (m) =>
            m.id === d.id &&
            m.direction === 'draft' &&
            visibleIds.has(m.mailboxId)
        );
        if (draftIdx !== -1) {
          state.messages.splice(draftIdx, 1);
        }
      }

      if (!isScheduled) {
        deliverToLocalMailboxes(state, sentMsg, nowIso);
      }

      saveState(store, state);
      notify();
      return { ok: true, messageId };
    },

    async attachmentUrl(a: AttachmentMeta): Promise<string> {
      await maybeDelay();
      const state = await ensureState();
      requireUser(state);
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
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      ensureUserDefaults(state, user);
      return { ...state.settingsByUser[user.id] };
    },

    async saveSettings(s: Settings): Promise<void> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      state.settingsByUser[user.id] = { ...s };
      saveState(store, state);
      notify();
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
      const state = await ensureState();
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
      const state = await ensureState();
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
    },

    async deleteTemplate(id: string): Promise<void> {
      await maybeDelay();
      const state = await ensureState();
      const { user } = requireUser(state);
      ensureUserDefaults(state, user);
      const list = state.templatesByUser[user.id];
      const idx = list.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error('not-found');
      list.splice(idx, 1);
      saveState(store, state);
      notify();
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
      const state = await ensureState();
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

      const exists = state.users.some(
        (existing) => existing.email.toLowerCase() === email.toLowerCase()
      );
      if (exists) {
        throw new Error('demo:user-exists');
      }

      const mailboxAddresses: string[] = [];
      for (const rawAddr of u.mailboxAddresses) {
        const addr = rawAddr.trim().toLowerCase();
        if (!EMAIL_RE.test(addr)) {
          throw new Error('demo:invalid-user');
        }
        mailboxAddresses.push(addr);
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

      const passwordHash = await hashPassword(u.password);
      const newUser: DemoUserRecord = {
        id: `user-${generateId()}`,
        email,
        name,
        role: u.role,
        mailboxAddresses,
        passwordHash,
      };

      state.users.push(newUser);
      ensureUserDefaults(state, newUser);
      saveState(store, state);
      notify();
    },

    async resetDemo(): Promise<void> {
      await maybeDelay();
      const fresh = await createSeedState();
      saveState(store, fresh);
      saveSession(store, null);
      notify();
    },
  };
}
