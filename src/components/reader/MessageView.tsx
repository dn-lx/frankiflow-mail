'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Avatar, Badge, Icon, IconButton, useToast } from '@/components/ui';
import type { AttachmentMeta, Message } from '@/lib/backend/types';
import { describeError, formatFullDate, formatListTime, type TranslateVars } from '@/lib/i18n';
import { sanitizeEmailHtml } from '@/lib/mail/sanitize';
import { PlainTextBody } from './PlainTextBody';
import { SafeHtmlFrame } from './SafeHtmlFrame';
import styles from './MessageView.module.css';

export interface MessageViewProps {
  message: Message;
  defaultExpanded: boolean;
  isLatest: boolean;
  canCollapse: boolean;
  userAddresses: string[];
  onReply: (message: Message) => void;
  onReplyAll: (message: Message) => void;
  onForward: (message: Message) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function isImageAttachment(a: AttachmentMeta): boolean {
  return a.contentType.toLowerCase().startsWith('image/');
}

/** Only a declared `application/pdf` may be opened in a tab; the filename is attacker-controlled. */
function isPdfAttachment(a: AttachmentMeta): boolean {
  return a.contentType.trim().toLowerCase() === 'application/pdf';
}

/** A `data:` URL must itself declare `application/pdf` before it may be opened. */
function canOpenAsPdf(url: string): boolean {
  const u = url.trim();
  if (/^data:/i.test(u)) return /^data:application\/pdf[;,]/i.test(u);
  return /^(blob:|https:)/i.test(u);
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function formatRelativeHint(
  iso: string,
  t: (key: string, vars?: TranslateVars) => string,
): string | null {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return t('reader.relative.justNow');
  if (mins < 60) return t('reader.relative.minutes', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('reader.relative.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t('reader.relative.dayOne');
  if (days <= 7) return t('reader.relative.days', { n: days });
  return null;
}

function shortRecipientName(
  raw: string,
  userSet: Set<string>,
  meLabel: string,
): string {
  const cleaned = raw.trim();
  const angleMatch = /^(.*?)<([^>]+)>$/.exec(cleaned);
  const addr = (angleMatch ? angleMatch[2]! : cleaned).trim().toLowerCase();
  if (userSet.has(addr)) return meLabel;
  if (angleMatch && angleMatch[1]!.trim()) {
    return angleMatch[1]!.trim().replace(/^["']|["']$/g, '').split(/\s+/)[0]!;
  }
  return addr.split('@')[0] || cleaned;
}

function formatRecipientSummary(
  to: string[],
  cc: string[],
  userAddresses: string[],
  t: (key: string, vars?: TranslateVars) => string,
): string {
  const all = [...to, ...cc].filter(Boolean);
  if (all.length === 0) return '';
  const userSet = new Set(userAddresses.map((a) => a.toLowerCase()));
  const meLabel = t('reader.toMe');
  const names = all.map((r) => shortRecipientName(r, userSet, meLabel));
  const shown = names.slice(0, 2).join(', ');
  const extra = names.length > 2 ? ` +${names.length - 2}` : '';
  return t('reader.toPrefix', { list: `${shown}${extra}` });
}

/**
 * Checks whether `htmlBody` carries rich HTML (tables, images, styles, headings, links, formatting)
 * as opposed to plain text auto-wrapped in `<p>` / `<br>` tags.
 * Plain-text messages render directly on the themed card surface (avoiding bright white glare in dark mode),
 * while rich HTML / newsletters or messages with no `textBody` render in the sandboxed `<SafeHtmlFrame>`.
 */
function isRichHtmlBody(htmlBody: string, textBody: string): boolean {
  const trimmed = htmlBody.trim();
  if (!trimmed) return false;
  if (!textBody || !textBody.trim()) return true;
  if (
    /<(style|table|img|picture|svg|video|audio|iframe|form|ul|ol|li|h[1-6]|blockquote|hr|div|span|a|b|strong|i|em|u|code|pre|font|center)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/\s(style|class|bgcolor|background|color|width|height|align)=/i.test(trimmed)) {
    return true;
  }
  return false;
}

function AttachmentItem({ attachment }: { attachment: AttachmentMeta }) {
  const { backend, lang, t } = useApp();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);
  const [busy, setBusy] = useState(false);

  const isImg = isImageAttachment(attachment);
  const isPdf = isPdfAttachment(attachment);

  useEffect(() => {
    if (!isImg) return;
    let cancelled = false;
    backend
      .attachmentUrl(attachment)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setThumbError(true);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the id: realtime reloads hand us new but equal attachment objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, attachment.id, isImg]);

  const resolveUrl = useCallback(async (): Promise<string | null> => {
    if (url) return url;
    setBusy(true);
    try {
      const next = await backend.attachmentUrl(attachment);
      setUrl(next);
      return next;
    } catch (err) {
      toast({ message: describeError(lang, err) || t('reader.attachmentError'), tone: 'error' });
      return null;
    } finally {
      setBusy(false);
    }
  }, [url, backend, attachment, toast, lang, t]);

  const handleDownload = async () => {
    const resolved = await resolveUrl();
    if (!resolved) return;
    triggerDownload(resolved, attachment.filename);
  };

  const handleOpenPdf = async () => {
    const resolved = await resolveUrl();
    if (!resolved) return;
    // Anything not positively a PDF is downloaded, never opened in a top-level tab.
    if (!isPdf || !canOpenAsPdf(resolved)) {
      triggerDownload(resolved, attachment.filename);
      return;
    }
    window.open(resolved, '_blank', 'noopener,noreferrer');
  };

  return (
    <li className={styles.attachmentCard}>
      <div className={styles.attachmentPreview}>
        {isImg && url && !thumbError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.filename}
            className={styles.thumb}
            onError={() => setThumbError(true)}
          />
        ) : (
          <span className={styles.attachmentIcon}>
            <Icon name={isImg ? 'image' : 'file'} size={20} />
          </span>
        )}
      </div>
      <div className={styles.attachmentMeta}>
        <span className={styles.attachmentName} title={attachment.filename}>
          {attachment.filename}
        </span>
        <span className={styles.attachmentSize}>{formatBytes(attachment.size)}</span>
      </div>
      <div className={styles.attachmentActions}>
        {isPdf && (
          <IconButton
            icon="file"
            label={t('reader.openPdf')}
            title={`${t('reader.openPdf')}: ${attachment.filename}`}
            size="sm"
            loading={busy}
            onClick={handleOpenPdf}
          />
        )}
        <IconButton
          icon="download"
          label={`${t('reader.download')}: ${attachment.filename}`}
          title={`${t('reader.download')}: ${attachment.filename}`}
          size="sm"
          loading={busy}
          onClick={handleDownload}
        />
      </div>
    </li>
  );
}

export function MessageView({
  message,
  defaultExpanded,
  isLatest,
  canCollapse,
  userAddresses,
  onReply,
  onReplyAll,
  onForward,
}: MessageViewProps) {
  const { settings, setSettings, lang, t } = useApp();
  const toast = useToast();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showRecipients, setShowRecipients] = useState(false);
  const [allowImagesLocal, setAllowImagesLocal] = useState(false);

  // If the thread gains a new latest message, expand it when defaultExpanded flips true.
  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded]);

  const dateIso = message.receivedAt ?? message.sentAt ?? message.createdAt;
  const senderLabel = message.from.name?.trim() || message.from.address;
  const allowRemoteImages = settings.loadRemoteImages === 'always' || allowImagesLocal;

  const hasHtml = Boolean(message.htmlBody && message.htmlBody.trim());
  const hasText = Boolean(message.textBody && message.textBody.trim());
  const useHtmlFrame = useMemo(
    () => hasHtml && (isRichHtmlBody(message.htmlBody, message.textBody) || message.folder === 'spam'),
    [hasHtml, message.htmlBody, message.textBody, message.folder],
  );

  const sanitized = useMemo(() => {
    if (!expanded || !useHtmlFrame) {
      return { html: '', blockedImages: 0, hasTrackingPixel: false };
    }
    return sanitizeEmailHtml(message.htmlBody, { allowRemoteImages });
  }, [expanded, useHtmlFrame, message.htmlBody, allowRemoteImages]);

  const showBlockedBar = sanitized.blockedImages > 0 && !allowRemoteImages;
  const showMutedImagesNote = !showBlockedBar && (allowImagesLocal || sanitized.hasTrackingPixel);

  const recipientSummary = useMemo(
    () => formatRecipientSummary(message.to, message.cc, userAddresses, t),
    [message.to, message.cc, userAddresses, t],
  );

  const fullDate = useMemo(() => formatFullDate(dateIso, lang), [dateIso, lang]);
  const relativeHint = useMemo(() => formatRelativeHint(dateIso, t), [dateIso, t]);
  const listTime = useMemo(() => formatListTime(dateIso, lang), [dateIso, lang]);

  const handleAlwaysShowImages = async () => {
    try {
      await setSettings({ loadRemoteImages: 'always' });
      toast({ message: t('reader.toast.alwaysImages'), tone: 'success' });
    } catch (err) {
      toast({ message: describeError(lang, err), tone: 'error' });
    }
  };

  if (!expanded) {
    const previewText = message.preview || t('reader.emptyBody');
    return (
      <article className={styles.card}>
        <button
          type="button"
          className={styles.collapsedRow}
          aria-expanded={false}
          aria-label={`${senderLabel} ${previewText} ${listTime} — ${t('reader.expandMessage')}`}
          onClick={() => setExpanded(true)}
        >
          <Avatar name={message.from.name} address={message.from.address} size="sm" />
          <span className={styles.collapsedSender}>{senderLabel}</span>
          <span className={styles.collapsedPreview}>{previewText}</span>
          {message.hasAttachments && (
            <span className={styles.collapsedAttach} aria-hidden="true">
              <Icon name="paperclip" size={14} />
            </span>
          )}
          <span className={styles.collapsedDate}>{listTime}</span>
          <span className={styles.collapsedChevron} aria-hidden="true">
            <Icon name="chevron-down" size={16} />
          </span>
        </button>
      </article>
    );
  }

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.avatarWrap}>
            <Avatar name={message.from.name} address={message.from.address} size="md" />
          </div>
          <div className={styles.headerContent}>
            <div className={styles.headerFirstRow}>
              {canCollapse ? (
                <button
                  type="button"
                  className={styles.senderCollapseButton}
                  aria-expanded={true}
                  aria-label={`${senderLabel} ${message.from.name ? `<${message.from.address}> ` : ''}— ${t('reader.collapseMessage')}`}
                  onClick={() => setExpanded(false)}
                >
                  <span className={styles.senderName}>{senderLabel}</span>
                  {message.from.name && (
                    <span className={styles.senderAddress}>&lt;{message.from.address}&gt;</span>
                  )}
                </button>
              ) : (
                <div className={styles.senderLine}>
                  <span className={styles.senderName}>{senderLabel}</span>
                  {message.from.name && (
                    <span className={styles.senderAddress}>&lt;{message.from.address}&gt;</span>
                  )}
                </div>
              )}

              <div className={styles.headerRight}>
                <div className={styles.dateBlock}>
                  <time dateTime={dateIso} title={fullDate}>
                    {fullDate}
                    {relativeHint ? ` (${relativeHint})` : ''}
                  </time>
                </div>
                <div className={styles.headerActions}>
                  <IconButton
                    icon="reply"
                    label={t('reader.reply')}
                    size="sm"
                    onClick={() => onReply(message)}
                  />
                  <IconButton
                    icon="reply-all"
                    label={t('reader.replyAll')}
                    size="sm"
                    onClick={() => onReplyAll(message)}
                  />
                  <IconButton
                    icon="forward"
                    label={t('reader.forward')}
                    size="sm"
                    onClick={() => onForward(message)}
                  />
                </div>
              </div>
            </div>

            {recipientSummary && (
              <div className={styles.recipientLine}>
                <button
                  type="button"
                  className={styles.recipientToggle}
                  aria-expanded={showRecipients}
                  aria-label={`${recipientSummary} — ${t(showRecipients ? 'reader.hideDetails' : 'reader.showDetails')}`}
                  onClick={() => setShowRecipients((v) => !v)}
                >
                  <span>{recipientSummary}</span>
                  <Icon
                    name="chevron-down"
                    size={14}
                    className={showRecipients ? styles.chevronOpen : undefined}
                  />
                </button>
              </div>
            )}

            <div className={styles.phoneDateLine}>
              <time dateTime={dateIso} title={fullDate}>
                {fullDate}
                {relativeHint ? ` (${relativeHint})` : ''}
              </time>
            </div>
          </div>
        </div>
      </header>

      {showRecipients && (
        <div className={styles.recipientDetails}>
          {message.from.address && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t('reader.print.from')}</span>
              <span className={styles.detailValue}>
                {message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address}
              </span>
            </div>
          )}
          {message.to.length > 0 && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t('reader.toFull')}</span>
              <span className={styles.detailValue}>{message.to.join(', ')}</span>
            </div>
          )}
          {message.cc.length > 0 && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t('reader.ccPrefix')}</span>
              <span className={styles.detailValue}>{message.cc.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {showBlockedBar && (
        <div
          className={styles.privacyBar}
          role="region"
          aria-label={t('reader.imagesBlocked')}
        >
          <span className={styles.privacyInline}>
            <Icon name="image" size={15} />
            <span className={styles.privacyLabel}>{t('reader.imagesBlockedShort')}</span>
            <span className={styles.privacyDot} aria-hidden="true">·</span>
            <button
              type="button"
              className={styles.privacyLink}
              onClick={() => setAllowImagesLocal(true)}
            >
              {t('reader.showImages')}
            </button>
            <span className={styles.privacyDot} aria-hidden="true">·</span>
            <button
              type="button"
              className={styles.privacyLinkMuted}
              onClick={handleAlwaysShowImages}
            >
              {t('reader.alwaysShowImages')}
            </button>
            {sanitized.hasTrackingPixel && (
              <Badge tone="neutral" className={styles.privacyBadge}>
                {t('reader.trackingPixelRemoved')}
              </Badge>
            )}
          </span>
        </div>
      )}

      {showMutedImagesNote && (
        <div className={styles.privacyCollapsedLine}>
          <span>
            {allowImagesLocal && sanitized.hasTrackingPixel
              ? `${t('reader.imagesShown')} · ${t('reader.trackingPixelRemoved')}`
              : allowImagesLocal
                ? t('reader.imagesShown')
                : t('reader.trackingPixelRemoved')}
          </span>
        </div>
      )}

      <div className={useHtmlFrame ? styles.bodyFrame : styles.body}>
        {useHtmlFrame && sanitized.html.trim() ? (
          <SafeHtmlFrame html={sanitized.html} allowRemoteImages={allowRemoteImages} />
        ) : hasText ? (
          <PlainTextBody text={message.textBody} />
        ) : (
          <p className={styles.emptyBody}>{t('reader.emptyBody')}</p>
        )}
      </div>

      {message.attachments.length > 0 && (
        <section
          className={styles.attachments}
          aria-label={t('reader.attachments', { count: message.attachments.length })}
        >
          <h3 className={styles.attachmentsHeading}>
            <Icon name="paperclip" size={15} />
            <span>
              {message.attachments.length === 1
                ? t('reader.attachmentOne')
                : t('reader.attachments', { count: message.attachments.length })}
            </span>
          </h3>
          <ul className={styles.attachmentList} role="list">
            {message.attachments.map((att) => (
              <AttachmentItem key={att.id} attachment={att} />
            ))}
          </ul>
        </section>
      )}

      {canCollapse && !isLatest && (
        <div className={styles.phoneMessageFooterActions}>
          <button
            type="button"
            className={styles.phoneMessageActionBtn}
            onClick={() => onReply(message)}
          >
            <Icon name="reply" size={16} />
            <span>{t('reader.reply')}</span>
          </button>
          <button
            type="button"
            className={styles.phoneMessageActionBtn}
            onClick={() => onReplyAll(message)}
          >
            <Icon name="reply-all" size={16} />
            <span>{t('reader.replyAllShort')}</span>
          </button>
          <button
            type="button"
            className={styles.phoneMessageActionBtn}
            onClick={() => onForward(message)}
          >
            <Icon name="forward" size={16} />
            <span>{t('reader.forward')}</span>
          </button>
        </div>
      )}
    </article>
  );
}
