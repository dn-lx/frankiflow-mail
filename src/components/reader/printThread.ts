import type { Message } from '@/lib/backend/types';
import { formatFullDate, type Lang, type TranslateVars } from '@/lib/i18n';
import { sanitizeEmailHtml } from '@/lib/mail/sanitize';
import { PRINT_FRAME_SANDBOX, cspMetaTag } from './frame-policy';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openPrintView(
  subject: string,
  messages: Message[],
  lang: Lang,
  t: (key: string, vars?: TranslateVars) => string,
  allowRemoteImages: boolean,
): boolean {
  if (typeof document === 'undefined') return false;

  const renderedMessages = messages
    .map((m) => {
      const sender = m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address;
      const date = formatFullDate(m.receivedAt ?? m.sentAt ?? m.createdAt, lang);
      const body = m.htmlBody?.trim()
        ? sanitizeEmailHtml(m.htmlBody, { allowRemoteImages }).html
        : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escapeHtml(m.textBody || '')}</pre>`;
      return `
        <article class="msg">
          <header class="msg-head">
            <div><strong>${escapeHtml(t('reader.print.from'))}</strong> ${escapeHtml(sender)}</div>
            ${m.to.length ? `<div><strong>${escapeHtml(t('reader.toFull'))}</strong> ${escapeHtml(m.to.join(', '))}</div>` : ''}
            ${m.cc.length ? `<div><strong>${escapeHtml(t('reader.ccPrefix'))}</strong> ${escapeHtml(m.cc.join(', '))}</div>` : ''}
            <div><strong>${escapeHtml(t('reader.print.date'))}</strong> ${escapeHtml(date)}</div>
          </header>
          <div class="msg-body">${body}</div>
        </article>
      `;
    })
    .join('');

  const html = `<!doctype html>
<html lang="${lang}">
<head>
${cspMetaTag(allowRemoteImages)}
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(subject || t('reader.noSubject'))}</title>
<style>
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1b2430;
    background: #ffffff;
    margin: 24px;
    line-height: 1.5;
    font-size: 14px;
  }
  h1 { font-size: 20px; margin: 0 0 16px; border-bottom: 1px solid #dce0e6; padding-bottom: 10px; }
  .msg { border: 1px solid #dce0e6; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .msg-head { font-size: 12px; color: #4a5565; border-bottom: 1px solid #eef1f4; padding-bottom: 8px; margin-bottom: 12px; }
  .msg-body img, .msg-body table { max-width: 100%; height: auto; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(subject || t('reader.noSubject'))}</h1>
  ${renderedMessages}
</body>
</html>`;

  // Hidden, script-less sandboxed frame with the same CSP as the reader frame.
  // `allow-same-origin` lets the parent call print(); without `allow-scripts`
  // nothing inside the email can execute.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', PRINT_FRAME_SANDBOX);
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.title = subject || t('reader.noSubject');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };

  iframe.addEventListener(
    'load',
    () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      try {
        win.addEventListener('afterprint', () => window.setTimeout(cleanup, 0), { once: true });
        win.focus();
        win.print();
      } catch {
        cleanup();
        return;
      }
      // Fallback for browsers that never fire afterprint on the frame.
      window.setTimeout(cleanup, 60_000);
    },
    { once: true },
  );

  iframe.srcdoc = html;
  try {
    document.body.appendChild(iframe);
  } catch {
    cleanup();
    return false;
  }
  return true;
}
