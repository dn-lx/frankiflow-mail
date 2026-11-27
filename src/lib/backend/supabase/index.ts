import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import type {
  AttachmentMeta, Draft, Folder, MailBackend, Mailbox, Message, OutgoingAttachment,
  SendResult, Settings, Signature, Template, ThreadQuery, UserSession,
} from '../types.ts';
import { supabase } from './client.ts';
import { ATTACHMENT_BUCKET, CONFIG } from './config.ts';
import {
  attachmentFromRow, draftToRow, labelFromRow, mailboxFromRow, messageFromRow,
  messagePatchToRow, row, rows, settingsFromRow, settingsToLocal, settingsToRow,
  string, threadsFromMessages, type Row,
} from './map.ts';

const TABLE = {
  users: 'frankiflow_mail_users', accounts: 'frankiflow_mail_accounts',
  userAccounts: 'frankiflow_mail_user_accounts', messages: 'frankiflow_mail_messages',
  attachments: 'frankiflow_mail_attachments', labels: 'frankiflow_mail_labels',
  messageLabels: 'frankiflow_mail_message_labels', contacts: 'frankiflow_mail_contacts',
  settings: 'frankiflow_mail_settings', signatures: 'frankiflow_mail_signatures',
  templates: 'frankiflow_mail_templates',
} as const;

const FOLDERS: Folder[] = ['inbox', 'sent', 'drafts', 'scheduled', 'snoozed', 'archive', 'spam', 'trash', 'starred', 'all'];
const PAGE_SIZE = 1000;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 18 * 1024 * 1024;
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// Return codes only: provider/DB messages can contain addresses or message content.
function errorFor(value: unknown, fallback = 'db:unknown'): Error {
  const detail = row(value);
  const message = value instanceof Error ? value.message : string(detail.message);
  if (/^(auth:(invalid|not-authorized|required)|network:offline|permission:denied|send:(failed|unconfirmed)|not-found|mode:live-only|db:[\w-]+)$/.test(message)) {
    return new Error(message);
  }
  const code = string(detail.code);
  const status = Number(detail.status ?? detail.statusCode);
  if (offline() || value instanceof TypeError || /fetch|network|load failed/i.test(message)) return new Error('network:offline');
  if (code === '42501' || status === 403) return new Error('permission:denied');
  if (code === 'PGRST116' || status === 404) return new Error('not-found');
  if (code === 'PGRST301' || code === 'PGRST302' || status === 401
    || code === 'session_not_found' || code === 'refresh_token_not_found') return new Error('auth:required');
  if (code === 'invalid_credentials' || code === 'user_banned' || code === 'email_not_confirmed') return new Error('auth:invalid');
  return new Error(code ? `db:${code.replace(/[^\w-]/g, '')}` : fallback);
}

function authFailure(value: unknown): string {
  const code = errorFor(value, 'auth:invalid').message;
  return code.startsWith('db:') ? 'auth:invalid' : code;
}

async function successful<T extends { error: unknown }>(request: PromiseLike<T>): Promise<T> {
  try {
    const result = await request;
    if (result.error) throw result.error;
    return result;
  } catch (error) { throw errorFor(error); }
}

async function checked<T>(request: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  return (await successful(request)).data;
}

async function readRows(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  return rows(await checked(request));
}

async function readRow(request: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row | null> {
  const data = await checked(request);
  return data === null ? null : row(data);
}

async function readAll(
  page: (first: number, last: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const result: Row[] = [];
  for (let first = 0; ; first += PAGE_SIZE) {
    const batch = await readRows(page(first, first + PAGE_SIZE - 1));
    result.push(...batch);
    if (batch.length < PAGE_SIZE) return result;
  }
}

function required(value: Row | null): Row {
  if (!value) throw new Error('not-found');
  return value;
}

function quoted(value: string): string {
  // PostgREST quoted values protect commas, parentheses, quotes and backslashes.
  return JSON.stringify(value);
}

function like(value: string): string {
  return value.replace(/[\\%_,()]/g, character => `\\${character}`);
}

function pattern(value: string): string { return `%${like(value)}%`; }

function selectMessages(selection = '*', head = false) {
  return supabase.from(TABLE.messages).select(selection, head ? { count: 'exact', head: true } : {});
}
type MessageQuery = ReturnType<typeof selectMessages>;

function inFolder(query: MessageQuery, folder: Folder, now: string): MessageQuery {
  if (folder === 'all') return query; // Legacy has no All view; v2 includes every visible folder.
  if (folder === 'starred') return query.eq('is_starred', true).or('folder.neq.trash,folder.is.null');
  if (folder === 'inbox') {
    return query.or(`folder.eq.inbox,and(folder.eq.snoozed,snoozed_until.lte.${quoted(now)})`);
  }
  if (folder === 'snoozed') {
    return query.eq('folder', 'snoozed').or(`snoozed_until.is.null,snoozed_until.gt.${quoted(now)}`);
  }
  return query.eq('folder', folder);
}

function byMessageDate(query: MessageQuery, operator: 'lt' | 'gt', date: string): MessageQuery {
  const value = quoted(date);
  return query.or(`received_at.${operator}.${value},and(received_at.is.null,sent_at.${operator}.${value}),and(received_at.is.null,sent_at.is.null,created_at.${operator}.${value})`);
}

interface SearchToken { key: string; value: string }
function searchTokens(search = ''): SearchToken[] {
  return (search.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map(raw => {
    const token = raw.replace(/"/g, '');
    const separator = token.indexOf(':');
    return separator > 0 ? { key: token.slice(0, separator).toLowerCase(), value: token.slice(separator + 1) }
      : { key: '', value: token };
  }).filter(token => token.value.length > 0);
}

function searchProjection(tokens: SearchToken[], labelId?: string): string {
  const selection = ['*'];
  if (labelId) selection.push('view_label:frankiflow_mail_message_labels!inner(label_id)');
  tokens.forEach((token, index) => {
    if (token.key === 'label') selection.push(`search_label_${index}:frankiflow_mail_message_labels!inner(label:frankiflow_mail_labels!inner(name))`);
  });
  if (tokens.some(t => t.key === 'has' && t.value.toLowerCase() === 'attachment')) {
    selection.push('attachment_match:frankiflow_mail_attachments(id)');
  }
  return selection.join(',');
}

function applySearch(query: MessageQuery, tokens: SearchToken[], now: string): MessageQuery {
  tokens.forEach((token, index) => {
    const { key, value } = token;
    const lower = value.toLowerCase();
    if (key === 'from') query = query.ilike('from_address', pattern(value));
    else if (key === 'subject') query = query.ilike('subject', pattern(value));
    // text[] has no ilike operator. Array containment is exact, safely encoded by the SDK.
    else if (key === 'to') query = query.contains('to_addresses', [value]);
    else if (key === 'label') query = query.ilike(`search_label_${index}.label.name`, pattern(value));
    else if (key === 'is') {
      if (lower === 'unread') query = query.or('is_read.eq.false,is_read.is.null');
      if (lower === 'read') query = query.eq('is_read', true);
      if (lower === 'starred') query = query.eq('is_starred', true);
      if (lower === 'pinned') query = query.eq('is_pinned', true);
      if (lower === 'important') query = query.eq('priority', 'high');
      if (lower === 'muted') query = query.eq('is_muted', true);
    } else if (key === 'has' && lower === 'attachment') {
      // A left embed plus a not-null filter also finds stale has_attachments flags.
      query = query.or('has_attachments.eq.true,attachment_match.not.is.null');
    } else if (key === 'in' && FOLDERS.includes(lower as Folder)) {
      query = inFolder(query, lower as Folder, now);
    } else if (key === 'before' || key === 'after') {
      const stamp = Date.parse(value);
      if (Number.isFinite(stamp)) query = byMessageDate(query, key === 'before' ? 'lt' : 'gt', new Date(stamp).toISOString());
    } else if (!key) {
      const valuePattern = quoted(pattern(value));
      query = query.or(['subject', 'from_address', 'from_name', 'preview', 'text_body']
        .map(column => `${column}.ilike.${valuePattern}`).join(','));
    }
  });
  return query;
}

function beforeCursor(query: MessageQuery, cursor?: string): MessageQuery {
  if (!cursor) return query;
  const [stamp, id] = cursor.split('|');
  if (!Number.isFinite(Date.parse(stamp))) throw new Error('db:22007');
  if (!id) return query.lt('created_at', stamp);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('db:22P02');
  return query.or(`created_at.lt.${quoted(stamp)},and(created_at.eq.${quoted(stamp)},id.lt.${quoted(id)})`);
}

function localSettingsKey(userId: string): string { return `ffmail.live.settings.v1:${userId}`; }
function readLocalSettings(userId: string): Row {
  try { return row(JSON.parse(window.localStorage.getItem(localSettingsKey(userId)) || '{}')); }
  catch { return {}; }
}

function htmlFromText(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)
    .replace(/\r?\n/g, '<br>');
}

function textFromHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  template.content.querySelectorAll('p,div,li').forEach(element => element.append('\n'));
  return (template.content.textContent || '').trim();
}

function templateFromRow(value: Row): Template {
  return { id: string(value.id), name: string(value.name), subject: string(value.subject),
    html: string(value.html_body) || htmlFromText(string(value.text_body)) };
}

interface FilePayload { filename: string; content: string; contentType: string; contentId?: string }
function encodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function extractInlineImages(html: string): { html: string; attachments: FilePayload[] } {
  const template = document.createElement('template');
  template.innerHTML = html;
  const attachments: FilePayload[] = [];
  template.content.querySelectorAll('img').forEach((image, index) => {
    const match = (image.getAttribute('src') || '').match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i);
    if (!match) return;
    const contentType = match[1].toLowerCase();
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp'
      : contentType.includes('gif') ? 'gif' : 'jpg';
    const contentId = `ff-inline-${Date.now()}-${index}@frankiflow`;
    attachments.push({ filename: `inline-${index + 1}.${extension}`, content: match[2], contentType, contentId });
    image.setAttribute('src', `cid:${contentId}`);
  });
  return { html: template.innerHTML, attachments };
}

function validateFiles(files: FilePayload[]): void {
  if (files.length > 14) throw new Error('send:failed');
  let total = 0;
  for (const file of files) {
    const content = file.content.replace(/\s/g, '');
    if (!file.filename.trim() || !content || content.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('send:failed');
    const size = content.length * 3 / 4 - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0);
    total += size;
    if (size > MAX_FILE || total > MAX_TOTAL) throw new Error('send:failed');
  }
}

export function createSupabaseBackend(): MailBackend {
  const listeners = new Set<() => void>();
  let channel: RealtimeChannel | null = null;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let generation = 0;
  let authSubscription: { unsubscribe(): void } | undefined;

  function notify(): void {
    for (const listener of listeners) {
      try { listener(); } catch { /* One consumer must not break other subscriptions. */ }
    }
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function startPolling(): void {
    if (!listeners.size || pollTimer !== undefined) return;
    pollTimer = setInterval(() => {
      // Consumers refresh their current query on this invalidation, not the entire mailbox.
      if (listeners.size && document.visibilityState === 'visible' && !offline()) notify();
    }, 60_000);
  }

  function removeChannel(): void {
    const previous = channel;
    channel = null;
    if (previous) {
      try { void supabase.removeChannel(previous).catch(() => { /* Already disconnected. */ }); }
      catch { /* Safari can throw even while closing a CSP-blocked socket. */ }
    }
  }

  function stopTransport(): void {
    generation++;
    stopPolling();
    removeChannel();
  }

  async function sessionWithAccess(): Promise<{ session: Session; user: UserSession } | null> {
    const data = await checked<{ session: Session | null }>(supabase.auth.getSession());
    const session = data.session;
    if (!session) return null;
    const profile = await readRow(supabase.from(TABLE.users).select('user_id,email,role,active')
      .eq('user_id', session.user.id).maybeSingle());
    if (!profile || profile.active !== true) {
      stopTransport();
      // The brief deliberately requires the send function's stricter access check at login.
      try { await successful(supabase.auth.signOut({ scope: 'local' })); }
      finally { throw new Error('auth:not-authorized'); }
    }
    return { session, user: { userId: session.user.id,
      email: session.user.email || string(profile.email),
      role: profile.role === 'admin' ? 'admin' : 'member', mode: 'live' } };
  }

  async function requireSession() {
    const result = await sessionWithAccess();
    if (!result) throw new Error('auth:required');
    return result;
  }

  async function connect(): Promise<void> {
    stopTransport();
    const current = generation;
    if (!listeners.size) return;
    startPolling();
    try {
      const auth = await sessionWithAccess();
      if (current !== generation || !listeners.size) return;
      if (!auth) { stopPolling(); return; }
      const next = supabase.channel(`frankiflow-mail-live-${auth.user.userId}`);
      channel = next;
      // Both channel construction and subscribe() can throw synchronously under Safari CSP.
      next.on('postgres_changes', { event: '*', schema: 'public', table: TABLE.messages }, () => notify());
      next.subscribe(status => {
        if (channel !== next || !listeners.size) return;
        if (status === 'SUBSCRIBED') stopPolling();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') startPolling();
      });
    } catch {
      if (current === generation && listeners.size) { removeChannel(); startPolling(); }
    }
  }

  function visible(): void {
    if (document.visibilityState === 'visible' && !offline()) notify();
  }
  function online(): void {
    visible();
    if (!channel) void connect();
  }

  async function mailboxesFor(userId: string): Promise<Mailbox[]> {
    const [accounts, grants] = await Promise.all([
      readRows(supabase.from(TABLE.accounts).select('*').order('is_primary', { ascending: false })),
      readRows(supabase.from(TABLE.userAccounts)
        .select('account_id,can_send,is_default,account:frankiflow_mail_accounts(*)').eq('user_id', userId))
        .catch(error => {
          // This select was never exercised by legacy; accounts RLS remains authoritative.
          if (errorFor(error).message === 'permission:denied') return [];
          throw error;
        }),
    ]);
    const accountMap = new Map(accounts.map(account => [string(account.id), account]));
    for (const grant of grants) {
      const account = row(grant.account);
      if (account.id && !accountMap.has(string(account.id))) accountMap.set(string(account.id), account);
    }
    return [...accountMap.values()].map(account => mailboxFromRow(account,
      grants.find(grant => grant.account_id === account.id)))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }

  async function hydrate(messageRows: Row[], mailboxes: Mailbox[]): Promise<Message[]> {
    const attachments = new Map<string, AttachmentMeta[]>();
    const labels = new Map<string, string[]>();
    const ids = messageRows.map(message => string(message.id));
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      const [fileRows, linkRows] = await Promise.all([
        readAll((first, last) => supabase.from(TABLE.attachments)
          .select('id,message_id,filename,content_type,size_bytes,storage_path,created_at')
          .in('message_id', chunk).order('created_at').order('id').range(first, last)),
        readAll((first, last) => supabase.from(TABLE.messageLabels).select('message_id,label_id')
          .in('message_id', chunk).order('message_id').order('label_id').range(first, last)),
      ]);
      for (const file of fileRows) {
        const attachment = attachmentFromRow(file);
        attachments.set(attachment.messageId, [...(attachments.get(attachment.messageId) ?? []), attachment]);
      }
      for (const link of linkRows) {
        const id = string(link.message_id);
        labels.set(id, [...(labels.get(id) ?? []), string(link.label_id)]);
      }
    }
    const now = Date.now();
    return messageRows.map(message => messageFromRow(message, attachments.get(string(message.id)),
      labels.get(string(message.id)), mailboxes, now));
  }

  async function draftContext(draft: Draft): Promise<{ existing: Row | null; reply: Row | null }> {
    const [existing, reply] = await Promise.all([
      draft.id ? readRow(supabase.from(TABLE.messages).select('id,thread_id,direction,folder')
        .eq('id', draft.id).eq('folder', 'drafts').maybeSingle()) : Promise.resolve(null),
      draft.inReplyToMessageId ? readRow(supabase.from(TABLE.messages)
        .select('id,thread_id,provider_message_id').eq('id', draft.inReplyToMessageId).maybeSingle()) : Promise.resolve(null),
    ]);
    if ((draft.id && !existing) || (draft.inReplyToMessageId && !reply)) throw new Error('not-found');
    return { existing, reply };
  }

  async function storedAttachment(attachment: AttachmentMeta): Promise<Row> {
    return required(await readRow(supabase.from(TABLE.attachments)
      .select('id,message_id,filename,content_type,size_bytes,storage_path')
      .eq('id', attachment.id).eq('message_id', attachment.messageId).maybeSingle()));
  }

  async function filePayload(attachment: OutgoingAttachment | AttachmentMeta): Promise<FilePayload> {
    let blob: Blob;
    let filename = attachment.filename;
    let contentType = attachment.contentType || 'application/octet-stream';
    if ('data' in attachment) blob = attachment.data;
    else {
      const record = await storedAttachment(attachment);
      const storagePath = string(record.storage_path);
      if (!storagePath) throw new Error('not-found');
      const downloaded = await checked(supabase.storage.from(ATTACHMENT_BUCKET).download(storagePath));
      if (!downloaded) throw new Error('not-found');
      blob = downloaded;
      filename = string(record.filename) || filename;
      contentType = string(record.content_type) || contentType;
    }
    if (blob.size > MAX_FILE) throw new Error('send:failed');
    return { filename, contentType, content: encodeBytes(new Uint8Array(await blob.arrayBuffer())) };
  }

  async function rememberContacts(emails: string[]): Promise<void> {
    for (const email of emails) {
      const existing = await readRow(supabase.from(TABLE.contacts).select('id,use_count')
        .ilike('email', like(email)).limit(1).maybeSingle());
      const now = new Date().toISOString();
      if (existing) await checked(supabase.from(TABLE.contacts).update({
        use_count: (Number(existing.use_count) || 0) + 1, last_used_at: now, updated_at: now,
      }).eq('id', string(existing.id)));
      else await checked(supabase.from(TABLE.contacts).insert({ email, use_count: 1, last_used_at: now }));
    }
  }

  async function send(draft: Draft): Promise<SendResult> {
    let requested = false;
    let acceptedMessageId: string | undefined;
    try {
      if (offline()) return { ok: false, error: 'network:offline' };
      const auth = await requireSession();
      const mailboxes = await mailboxesFor(auth.user.userId);
      const mailbox = mailboxes.find(account => account.id === draft.mailboxId);
      if (!mailbox || !mailbox.canSend) return { ok: false, error: 'permission:denied' };
      if (!draft.to.length || draft.attachments.length > 14) return { ok: false, error: 'send:failed' };
      if (draft.scheduledAt && (!Number.isFinite(Date.parse(draft.scheduledAt))
        || Date.parse(draft.scheduledAt) < Date.now() + 60_000)) return { ok: false, error: 'send:failed' };
      const context = await draftContext(draft);
      // Composer sanitizes HTML before calling the backend. Parsing here only extracts CID files.
      const inline = extractInlineImages(draft.html);
      const attachments: FilePayload[] = [];
      for (const attachment of draft.attachments) attachments.push(await filePayload(attachment));
      attachments.push(...inline.attachments);
      validateFiles(attachments);
      const body = {
        fromAddress: mailbox.address, to: draft.to, cc: draft.cc, bcc: draft.bcc,
        subject: draft.subject, text: draft.text, html: inline.html,
        thread_id: string(context.reply?.thread_id) || string(context.existing?.thread_id) || null,
        in_reply_to: string(context.reply?.provider_message_id) || null,
        scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
        attachments, ...(draft.id ? { draft_id: draft.id } : {}),
      };
      requested = true;
      // Exactly one request. A transport failure after dispatch can mean delivery succeeded.
      const response = await fetch(CONFIG.sendFunctionUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.session.access_token}`, apikey: CONFIG.supabasePublishableKey },
        body: JSON.stringify(body),
      });
      const responseBody = await response.text();
      let payload: Row;
      try { payload = row(JSON.parse(responseBody)); }
      catch { return { ok: false, error: response.ok || response.status >= 500 ? 'send:unconfirmed' : 'send:failed' }; }
      acceptedMessageId = string(payload.mail_message_id) || undefined;
      const result = { messageId: acceptedMessageId, queued: Boolean(payload.scheduled_at) };
      if (payload.delivery_unconfirmed || payload.warning) return { ...result, ok: false, error: 'send:unconfirmed' };
      if (!response.ok || payload.error || payload.ok !== true) {
        return { ...result, ok: false, error: response.status === 401 ? 'auth:required'
          : response.status === 403 ? 'permission:denied' : 'send:failed' };
      }
      // The Edge Function already created the thread, message and archived attachments.
      try {
        if (draft.id) await checked(supabase.from(TABLE.messages).delete().eq('id', draft.id).eq('folder', 'drafts'));
        await rememberContacts(draft.to);
      } catch {
        notify();
        return { ...result, ok: false, error: 'send:unconfirmed' };
      }
      notify();
      return { ...result, ok: true, queued: Boolean(payload.scheduled_at || draft.scheduledAt) };
    } catch (error) {
      return { ok: false, messageId: acceptedMessageId,
        error: requested ? 'send:unconfirmed' : errorFor(error, 'send:failed').message };
    }
  }

  const backend: MailBackend = {
    mode: 'live',
    async getSession() { return (await sessionWithAccess())?.user ?? null; },
    async signIn(email, password) {
      try {
        if (offline()) return { ok: false, error: 'network:offline' };
        try { window.localStorage.setItem('ffmail-last-login', email.trim().toLowerCase()); } catch { /* Optional login prefill. */ }
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) return { ok: false, error: authFailure(result.error) };
        await requireSession();
        notify();
        return { ok: true };
      } catch (error) { return { ok: false, error: errorFor(error, 'auth:invalid').message }; }
    },
    async signOut() {
      stopTransport();
      await successful(supabase.auth.signOut());
      notify();
    },
    async changePassword(newPassword) {
      try {
        await requireSession();
        if (newPassword.length < 12) return { ok: false, error: 'auth:invalid' };
        const result = await supabase.auth.updateUser({ password: newPassword });
        if (result.error) return { ok: false, error: authFailure(result.error) };
        return { ok: true };
      } catch (error) { return { ok: false, error: errorFor(error, 'auth:invalid').message }; }
    },
    onChange(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        document.addEventListener('visibilitychange', visible);
        window.addEventListener('online', online);
        authSubscription = supabase.auth.onAuthStateChange(() => {
          // Never await Auth methods from inside the Auth callback (it holds an SDK lock).
          stopTransport();
          queueMicrotask(() => { if (listeners.size) { notify(); void connect(); } });
        }).data.subscription;
        void connect();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        stopTransport();
        authSubscription?.unsubscribe();
        authSubscription = undefined;
        document.removeEventListener('visibilitychange', visible);
        window.removeEventListener('online', online);
      };
    },
    async listMailboxes() { return mailboxesFor((await requireSession()).user.userId); },
    async listThreads(q: ThreadQuery) {
      // Legacy's browser filter automations are intentionally not run by v2: this
      // interface loads individual views, rather than scanning/mutating every inbox.
      const auth = await requireSession();
      const mailboxes = await mailboxesFor(auth.user.userId);
      const accountIds = mailboxes.filter(m => !q.mailboxId || m.id === q.mailboxId).map(m => m.id);
      if (!accountIds.length) return { threads: [] };
      const now = new Date().toISOString();
      const tokens = searchTokens(q.search);
      const limit = q.limit !== undefined && Number.isFinite(q.limit) ? Math.max(1, Math.min(PAGE_SIZE, Math.floor(q.limit))) : 50;
      let query = selectMessages(searchProjection(tokens, q.labelId)).in('account_id', accountIds);
      query = inFolder(query, q.folder, now);
      if (q.labelId) query = query.eq('view_label.label_id', q.labelId);
      query = beforeCursor(applySearch(query, tokens, now), q.before);
      const messageRows = await readRows(query.order('created_at', { ascending: false })
        .order('id', { ascending: false }).limit(limit));
      const messages = await hydrate(messageRows, mailboxes);
      const last = messageRows.at(-1);
      return { threads: threadsFromMessages(messages),
        nextBefore: last && messageRows.length === limit ? `${string(last.created_at)}|${string(last.id)}` : undefined };
    },
    async getThread(threadId) {
      const auth = await requireSession();
      const mailboxes = await mailboxesFor(auth.user.userId);
      const accountIds = mailboxes.map(m => m.id);
      if (!accountIds.length) throw new Error('not-found');
      let messageRows = await readAll((first, last) => selectMessages().eq('thread_id', threadId)
        .in('account_id', accountIds).order('created_at').order('id').range(first, last));
      // Threadless legacy messages use their message id as the public thread id.
      if (!messageRows.length) messageRows = await readRows(selectMessages().eq('id', threadId).in('account_id', accountIds));
      if (!messageRows.length) throw new Error('not-found');
      // The v2 contract asks for all messages, including drafts, unlike legacy's reader dialog.
      return hydrate(messageRows, mailboxes);
    },
    async updateMessages(messageIds, patch) {
      await requireSession();
      const ids = [...new Set(messageIds)];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const chunk = ids.slice(offset, offset + 100);
        const updated = await readRows(supabase.from(TABLE.messages).update(messagePatchToRow(patch))
          .in('id', chunk).select('id'));
        if (updated.length !== chunk.length) throw new Error('not-found');
        for (const messageId of chunk) {
          for (const labelId of new Set(patch.labelIdsAdd ?? [])) {
            await checked(supabase.from(TABLE.messageLabels).upsert({ message_id: messageId, label_id: labelId },
              { onConflict: 'message_id,label_id' }));
          }
          for (const labelId of new Set(patch.labelIdsRemove ?? [])) {
            await checked(supabase.from(TABLE.messageLabels).delete().eq('message_id', messageId).eq('label_id', labelId));
          }
        }
      }
      notify();
    },
    async deleteForever(messageIds) {
      await requireSession();
      const ids = [...new Set(messageIds)];
      // Validate the whole selection before removing any files or messages.
      for (let offset = 0; offset < ids.length; offset += 100) {
        const chunk = ids.slice(offset, offset + 100);
        const messages = await readRows(selectMessages('id,folder').in('id', chunk));
        if (messages.length !== chunk.length) throw new Error('not-found');
        if (messages.some(m => m.folder !== 'trash' && m.folder !== 'spam')) throw new Error('permission:denied');
      }
      for (let offset = 0; offset < ids.length; offset += 100) {
        const chunk = ids.slice(offset, offset + 100);
        const files = await readAll((first, last) => supabase.from(TABLE.attachments)
          .select('id,storage_path').in('message_id', chunk).order('id').range(first, last));
        const paths = files.map(file => string(file.storage_path)).filter(Boolean);
        for (let first = 0; first < paths.length; first += PAGE_SIZE) {
          await checked(supabase.storage.from(ATTACHMENT_BUCKET).remove(paths.slice(first, first + PAGE_SIZE)));
        }
        const deleted = await readRows(supabase.from(TABLE.messages).delete().in('id', chunk)
          .in('folder', ['trash', 'spam']).select('id'));
        if (deleted.length !== chunk.length) throw new Error('not-found');
      }
      notify();
    },
    async counts(mailboxId) {
      const auth = await requireSession();
      const accountIds = (await mailboxesFor(auth.user.userId)).filter(m => !mailboxId || m.id === mailboxId).map(m => m.id);
      if (!accountIds.length) return Object.fromEntries(FOLDERS.map(folder => [folder, 0]));
      const now = new Date().toISOString();
      const counts = await Promise.all(FOLDERS.map(async folder => {
        try {
          const result = await inFolder(selectMessages('id', true).in('account_id', accountIds), folder, now)
            .or('is_read.eq.false,is_read.is.null');
          if (result.error) throw result.error;
          return [folder, result.count ?? 0] as const;
        } catch (error) { throw errorFor(error); }
      }));
      return Object.fromEntries(counts);
    },
    async listLabels() {
      await requireSession();
      const labels = await readRows(supabase.from(TABLE.labels).select('*').order('name'));
      return labels.filter(label => label.system_key !== 'account_mail').map(labelFromRow);
    },
    async createLabel(name, color) {
      const auth = await requireSession();
      const label = required(await readRow(supabase.from(TABLE.labels)
        .insert({ name: name.trim(), color, created_by: auth.user.userId }).select('*').single()));
      notify();
      return labelFromRow(label);
    },
    async deleteLabel(id) {
      await requireSession();
      const deleted = await readRows(supabase.from(TABLE.labels).delete().eq('id', id).select('id'));
      if (!deleted.length) throw new Error('not-found');
      notify();
    },
    async saveDraft(draft) {
      const auth = await requireSession();
      const mailboxes = await mailboxesFor(auth.user.userId);
      const mailbox = mailboxes.find(m => m.id === draft.mailboxId) ?? mailboxes.find(m => m.isPrimary);
      if (!mailbox) throw new Error('permission:denied');
      const context = await draftContext(draft);
      const value = draftToRow(draft, mailbox, string(context.reply?.thread_id) || string(context.existing?.thread_id) || null);
      const saved = required(await readRow(draft.id
        ? supabase.from(TABLE.messages).update(value).eq('id', draft.id).eq('folder', 'drafts').select('id').single()
        : supabase.from(TABLE.messages).insert(value).select('id').single()));
      notify();
      return { id: string(saved.id) };
    },
    async deleteDraft(id) {
      await requireSession();
      const deleted = await readRows(supabase.from(TABLE.messages).delete().eq('id', id).eq('folder', 'drafts').select('id'));
      if (!deleted.length) throw new Error('not-found');
      notify();
    },
    send,
    async attachmentUrl(attachment) {
      await requireSession();
      const file = await storedAttachment(attachment);
      const storagePath = string(file.storage_path);
      if (!storagePath) throw new Error('not-found');
      const signed = await checked(supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(storagePath, 60));
      if (!signed?.signedUrl) throw new Error('not-found');
      return signed.signedUrl;
    },
    async suggestContacts(prefix) {
      await requireSession();
      let query = supabase.from(TABLE.contacts).select('email,display_name,last_used_at');
      if (prefix.trim()) {
        const value = quoted(pattern(prefix.trim()));
        query = query.or(`email.ilike.${value},display_name.ilike.${value}`);
      }
      return (await readRows(query.order('last_used_at', { ascending: false }).limit(200)))
        .map(contact => ({ address: string(contact.email), name: string(contact.display_name),
          lastUsedAt: string(contact.last_used_at) || undefined }));
    },
    async getSettings() {
      const auth = await requireSession();
      const settings = await readRow(supabase.from(TABLE.settings).select('*').eq('user_id', auth.user.userId).maybeSingle());
      return settingsFromRow(settings ?? {}, readLocalSettings(auth.user.userId));
    },
    async saveSettings(settings: Settings) {
      const auth = await requireSession();
      // Re-read before merging so legacy fields absent from Settings are preserved.
      const previous = await readRow(supabase.from(TABLE.settings).select('*').eq('user_id', auth.user.userId).maybeSingle());
      await checked(supabase.from(TABLE.settings).upsert({ ...settingsToRow(settings, previous ?? {}), user_id: auth.user.userId },
        { onConflict: 'user_id' }).select('*').single());
      try { window.localStorage.setItem(localSettingsKey(auth.user.userId), JSON.stringify(settingsToLocal(settings))); }
      catch (error) { throw errorFor(error); }
      notify();
    },
    async listSignatures() {
      const auth = await requireSession();
      const signatures = await readRows(supabase.from(TABLE.signatures).select('*')
        .order('is_default', { ascending: false }).order('name'));
      if (signatures.length) return signatures.map(signature => ({ id: string(signature.id),
        mailboxId: string(signature.account_id), html: string(signature.html_body), isDefault: signature.is_default === true }));
      const settings = await readRow(supabase.from(TABLE.settings).select('signature_html').eq('user_id', auth.user.userId).maybeSingle());
      return settings?.signature_html ? [{ id: 'legacy', mailboxId: '', html: string(settings.signature_html), isDefault: true }] : [];
    },
    async saveSignature(signature: Signature) {
      const auth = await requireSession();
      const id = signature.id && signature.id !== 'legacy' ? signature.id : undefined;
      const previous = id ? await readRow(supabase.from(TABLE.signatures).select('id,name').eq('id', id).maybeSingle()) : null;
      const now = new Date().toISOString();
      const accountId = signature.mailboxId || null;
      if (signature.isDefault) {
        let query = supabase.from(TABLE.signatures).update({ is_default: false, updated_at: now }).eq('user_id', auth.user.userId);
        query = accountId ? query.eq('account_id', accountId) : query.is('account_id', null);
        await checked(query);
      }
      const value = { user_id: auth.user.userId, account_id: accountId,
        name: string(previous?.name) || 'Signature', html_body: signature.html,
        is_default: signature.isDefault, updated_at: now };
      await checked(previous
        ? supabase.from(TABLE.signatures).update(value).eq('id', id!).select('id').single()
        : supabase.from(TABLE.signatures).insert({ ...value, ...(id ? { id } : {}) }).select('id').single());
      notify();
    },
    async listTemplates() {
      await requireSession();
      return (await readRows(supabase.from(TABLE.templates).select('*').order('name'))).map(templateFromRow);
    },
    async saveTemplate(template: Template) {
      const auth = await requireSession();
      const previous = template.id ? await readRow(supabase.from(TABLE.templates).select('*').eq('id', template.id).maybeSingle()) : null;
      const value = { name: template.name, subject: template.subject, text_body: textFromHtml(template.html),
        html_body: template.html, updated_at: new Date().toISOString() };
      const saved = required(await readRow(previous
        ? supabase.from(TABLE.templates).update(value).eq('id', template.id).select('*').single()
        : supabase.from(TABLE.templates).insert({ ...value, created_by: auth.user.userId,
          ...(template.id ? { id: template.id } : {}) }).select('*').single()));
      notify();
      return templateFromRow(saved);
    },
    async deleteTemplate(id) {
      await requireSession();
      const deleted = await readRows(supabase.from(TABLE.templates).delete().eq('id', id).select('id'));
      if (!deleted.length) throw new Error('not-found');
      notify();
    },
    async listDemoUsers() { throw new Error('mode:live-only'); },
    async createDemoUser() { throw new Error('mode:live-only'); },
    async resetDemo() { throw new Error('mode:live-only'); },
  };
  return backend;
}
