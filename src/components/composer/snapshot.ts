'use client';

// Window content for a composer, built without React or the browser: the HTML
// helpers and the date formatter are passed in, so this runs in Node tests too.

import type { MailBackend, Mailbox, Message, Signature } from '../../lib/backend/types.ts';
import { namesFromMessage, parseAddressList, replyAllRecipients, replyRecipients, replySubject } from '../../lib/mail/addresses.ts';
import type { SubjectLang } from '../../lib/mail/addresses.ts';
import type { HtmlKit, QuoteLabels } from './html-core.ts';
import { toRecipients } from './recipients.ts';
import type { ComposeAttachment, ComposeInit, ComposerSnapshot } from './types.ts';

type T = (key: string, vars?: Record<string, string | number>) => string;

export interface SnapshotDeps {
  html: HtmlKit;
  /** Formats an ISO timestamp for quoted headers (locale-aware in the browser). */
  formatDate: (iso: string) => string;
}

export function pickSignature(signatures: Signature[], mailboxId: string): Signature | undefined {
  const own = signatures.filter((s) => s.mailboxId === mailboxId);
  return own.find((s) => s.isDefault) ?? own[0];
}

export function sendableMailboxes(mailboxes: Mailbox[]): Mailbox[] {
  return mailboxes.filter((m) => m.canSend);
}

function quoteLabels(t: T, formatDate: (iso: string) => string): QuoteLabels {
  return {
    wrote: (vars) => t('composer.quote.wrote', vars),
    forwardedHeader: t('composer.quote.forwarded'),
    from: t('composer.quote.from'),
    date: t('composer.quote.date'),
    subject: t('composer.quote.subject'),
    to: t('composer.quote.to'),
    cc: t('composer.quote.cc'),
    formatDate,
  };
}

function metaAttachments(message: Message | undefined): ComposeAttachment[] {
  return (message?.attachments ?? []).map((a) => ({
    id: `meta-${a.id}`,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    meta: a,
  }));
}

/** Only real message ids (not RFC Message-IDs) can be used as inReplyToMessageId. */
export function messageIdFrom(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /[<>@\s]/.test(value) ? undefined : value;
}

/** Initial window content for a ComposeInit. Returns null when no mailbox can send. */
export function buildSnapshot(
  init: ComposeInit,
  message: Message | undefined,
  mailboxes: Mailbox[],
  signatures: Signature[],
  lang: SubjectLang,
  t: T,
  deps: SnapshotDeps,
): ComposerSnapshot | null {
  const sendable = sendableMailboxes(mailboxes);
  if (!sendable.length) return null;
  const kit = deps.html;
  const canUse = (id: string | undefined) => !!id && sendable.some((m) => m.id === id);
  const fallback = (sendable.find((m) => m.isPrimary) ?? sendable[0]).id;
  const ownAddresses = mailboxes.map((m) => m.address);

  if (init.mode === 'draft' && message) {
    const mailboxId = canUse(message.mailboxId) ? message.mailboxId : fallback;
    const cc = toRecipients(message.cc.flatMap((a) => parseAddressList(a)));
    const bcc = toRecipients(message.bcc.flatMap((a) => parseAddressList(a)));
    const html = message.htmlBody ? kit.cleanComposeHtml(message.htmlBody) : kit.textToHtml(message.textBody || '');
    return {
      draftId: message.id,
      mailboxId,
      to: toRecipients(message.to.flatMap((a) => parseAddressList(a))),
      cc,
      bcc,
      showCc: cc.length > 0,
      showBcc: bcc.length > 0,
      subject: message.subject,
      html: html || '<p><br></p>',
      attachments: metaAttachments(message),
      inReplyToMessageId: messageIdFrom(message.inReplyTo),
      dirty: false,
    };
  }

  const preferred = init.mailboxId ?? message?.mailboxId;
  const mailboxId = canUse(preferred) ? (preferred as string) : fallback;
  const signature = kit.signatureBlock(pickSignature(signatures, mailboxId)?.html);
  const empty = '<p><br></p>';

  if ((init.mode === 'reply' || init.mode === 'replyAll' || init.mode === 'forward') && message) {
    const isForward = init.mode === 'forward';
    const quote = kit.buildQuote(message, isForward ? 'forward' : 'reply', quoteLabels(t, deps.formatDate));
    let to: string[] = [];
    let cc: string[] = [];
    if (init.mode === 'reply') to = replyRecipients(message, ownAddresses);
    if (init.mode === 'replyAll') ({ to, cc } = replyAllRecipients(message, ownAddresses));
    const names = namesFromMessage(message);
    const named = (address: string) => ({ name: names.get(address.toLowerCase()) ?? '', address, raw: address });
    const ccList = toRecipients(cc.map(named));
    return {
      mailboxId,
      to: toRecipients(to.map(named)),
      cc: ccList,
      bcc: [],
      showCc: ccList.length > 0,
      showBcc: false,
      subject: replySubject(message.subject, init.mode === 'replyAll' ? 'replyAll' : isForward ? 'forward' : 'reply', lang),
      html: `${empty}${signature}${empty}${quote}`,
      attachments: isForward ? metaAttachments(message) : [],
      inReplyToMessageId: isForward ? undefined : message.id,
      dirty: false,
    };
  }

  return {
    mailboxId,
    to: toRecipients((init.to ?? []).flatMap((a) => parseAddressList(a))),
    cc: [],
    bcc: [],
    showCc: false,
    showBcc: false,
    subject: '',
    html: `${empty}${signature}`,
    attachments: [],
    dirty: false,
  };
}

/** Finds a draft message by id (there is no direct lookup in the backend interface). */
export async function loadDraftMessage(backend: MailBackend, draftId: string): Promise<Message> {
  const { threads } = await backend.listThreads({ folder: 'drafts', limit: 100 });
  const direct = threads.filter((th) => th.latestMessageId === draftId);
  const others = threads.filter((th) => th.latestMessageId !== draftId);
  for (const th of [...direct, ...others].slice(0, 30)) {
    const messages = await backend.getThread(th.id);
    const found = messages.find((m) => m.id === draftId);
    if (found) return found;
  }
  throw new Error('not-found');
}
