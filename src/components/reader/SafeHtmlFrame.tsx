'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Button } from '@/components/ui';
import { MESSAGE_FRAME_SANDBOX, cspMetaTag } from './frame-policy';
import styles from './SafeHtmlFrame.module.css';

export interface SafeHtmlFrameProps {
  /** Already-sanitized HTML from `sanitizeEmailHtml`. */
  html: string;
  /** Accessible title for the iframe. */
  title?: string;
  /** Whether `https:` images may load (sets the frame CSP). Defaults to blocked. */
  allowRemoteImages?: boolean;
}

const FRAME_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #1b2430;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    overflow-wrap: break-word;
    -webkit-text-size-adjust: 100%;
  }
  body {
    padding: 16px;
    overflow-x: auto;
  }
  img, picture, video, svg {
    max-width: 100%;
    height: auto;
  }
  table {
    max-width: 100%;
    border-collapse: collapse;
  }
  pre, code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
    white-space: pre-wrap;
    word-break: break-word;
  }
  a {
    color: #176f6f;
    text-underline-offset: 2px;
  }
  blockquote {
    margin: 12px 0;
    padding: 4px 0 4px 12px;
    border-left: 3px solid #dce0e6;
    color: #4a5565;
  }
  details.ff-quote {
    margin-top: 12px;
  }
  summary.ff-quote-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 22px;
    padding: 0 8px;
    border: 1px solid #dce0e6;
    border-radius: 999px;
    background: #f0f2f5;
    color: #4a5565;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  summary.ff-quote-toggle::-webkit-details-marker {
    display: none;
  }
  summary.ff-quote-toggle:hover {
    background: #eef1f4;
    color: #1b2430;
  }
`;

const ATTRIBUTION_RE = /^(Am\s.+schrieb|On\s.+wrote:|---+ ?Original Message|---+ ?Ursprüngliche Nachricht)/i;

/**
 * Wraps top-level <blockquote> or .gmail_quote blocks in native <details>
 * so quoted history is folded without needing JavaScript inside the sandbox.
 */
function foldQuotedHtml(sanitizedHtml: string, toggleLabel: string): string {
  if (typeof DOMParser === 'undefined' || !sanitizedHtml) return sanitizedHtml;
  try {
    const doc = new DOMParser().parseFromString(sanitizedHtml, 'text/html');
    const quotes = Array.from(doc.body.querySelectorAll('blockquote, .gmail_quote'));
    for (const q of quotes) {
      if (q.closest('details.ff-quote')) continue;
      // Only fold quotes that have meaningful content.
      if (!q.textContent?.trim()) continue;

      const details = doc.createElement('details');
      details.className = 'ff-quote';
      const summary = doc.createElement('summary');
      summary.className = 'ff-quote-toggle';
      summary.setAttribute('aria-label', toggleLabel);
      summary.textContent = '…';
      details.appendChild(summary);

      const parent = q.parentNode;
      if (!parent) continue;

      const prev = q.previousElementSibling;
      const includePrev = prev && ATTRIBUTION_RE.test(prev.textContent?.trim() ?? '');

      parent.insertBefore(details, includePrev ? prev : q);
      if (includePrev && prev) details.appendChild(prev);
      details.appendChild(q);
    }
    return doc.body.innerHTML;
  } catch {
    return sanitizedHtml;
  }
}

/**
 * Estimates a usable iframe height from sanitized HTML content.
 *
 * Because the iframe intentionally omits `allow-same-origin`, the parent window
 * cannot read `contentDocument.body.scrollHeight`. We therefore compute a
 * content-length heuristic with internal scrolling and pair it with an explicit
 * expand/collapse toggle for long newsletters.
 */
function estimateFrameHeight(html: string): number {
  const textLen = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  const breakCount = (html.match(/<(br|p|div|tr|li|h[1-6])\b/gi) ?? []).length;
  const imgCount = (html.match(/<img\b/gi) ?? []).length;
  const estimated = 120 + Math.round(textLen * 0.38) + breakCount * 18 + imgCount * 90;
  return Math.max(220, Math.min(620, estimated));
}

function buildSrcDoc(bodyHtml: string, allowRemoteImages: boolean): string {
  // The CSP meta must come first so it applies before any other content is parsed.
  return `<!doctype html>
<html>
<head>
${cspMetaTag(allowRemoteImages)}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<base target="_blank">
<style>${FRAME_CSS}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function SafeHtmlFrame({ html, title, allowRemoteImages = false }: SafeHtmlFrameProps) {
  const { t } = useApp();
  const [expanded, setExpanded] = useState(false);

  const toggleLabel = t('reader.toggleQuoted');
  const foldedHtml = useMemo(() => foldQuotedHtml(html, toggleLabel), [html, toggleLabel]);
  const srcDoc = useMemo(
    () => buildSrcDoc(foldedHtml, allowRemoteImages),
    [foldedHtml, allowRemoteImages],
  );
  const compactHeight = useMemo(() => estimateFrameHeight(html), [html]);
  const canExpand = compactHeight >= 400 || html.length > 2200;
  const height = expanded ? Math.max(720, Math.min(1600, Math.round(compactHeight * 2.2))) : compactHeight;

  return (
    <div className={styles.wrapper}>
      <div className={styles.paper}>
        <iframe
          className={styles.frame}
          title={title ?? t('reader.frameTitle')}
          sandbox={MESSAGE_FRAME_SANDBOX}
          srcDoc={srcDoc}
          style={{ height: `${height}px` }}
        />
      </div>
      {canExpand && (
        <div className={styles.controls}>
          <Button
            variant="ghost"
            size="sm"
            icon={expanded ? 'minimize' : 'maximize'}
            onClick={() => setExpanded((v) => !v)}
          >
            {t(expanded ? 'reader.collapseFrame' : 'reader.expandFrame')}
          </Button>
        </div>
      )}
    </div>
  );
}
