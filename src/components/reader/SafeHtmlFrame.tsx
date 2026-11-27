'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  html[data-frame-theme="dark"], html[data-frame-theme="dark"] body {
    background: #e8eaed;
    color: #1b2430;
  }
  @media (prefers-color-scheme: dark) {
    html[data-frame-theme="system"], html[data-frame-theme="system"] body {
      background: #e8eaed;
      color: #1b2430;
    }
  }
  body {
    padding: 16px;
    overflow-x: auto;
  }
  img, picture, video, svg {
    max-width: 100%;
    height: auto;
  }
  img[data-src] {
    display: inline-block;
    width: auto !important;
    max-height: 28px !important;
    min-height: 24px;
    padding: 2px 8px;
    border: 1px dashed #cbd5e1;
    border-radius: 4px;
    background: #f1f5f9;
    color: #475569;
    font-size: 12px;
    line-height: 20px;
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

function parseCssPx(styleText: string, prop: 'width' | 'height'): number | null {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px\\b`, 'i');
  const m = re.exec(styleText);
  return m ? Number(m[1]) : null;
}

function parseAttrPx(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/px$/, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}

/**
 * Estimates a generous iframe height from sanitized HTML content at the current container width.
 *
 * Because the iframe intentionally omits `allow-same-origin`, the parent window
 * cannot read `contentDocument.body.scrollHeight`. We therefore compute a
 * content-based estimate (characters ÷ chars-per-line, blocks, tables, and images
 * with their explicit dimensions or a 200px default) × 1.25 safety factor,
 * clamped between 120px and 80vh, while keeping the iframe internally scrollable.
 */
function estimateContentHeight(html: string, containerWidth: number): number {
  const contentWidth = Math.max(160, containerWidth - 32);
  const charsPerLine = Math.max(18, Math.floor(contentWidth / 7.5));

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const s of Array.from(doc.body.querySelectorAll('style'))) s.remove();
      for (const d of Array.from(doc.body.querySelectorAll('details.ff-quote'))) {
        const summary = d.querySelector('summary');
        d.textContent = '';
        if (summary) d.appendChild(summary);
      }

      const textLen = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().length;
      const textLines = textLen > 0 ? Math.ceil(textLen / charsPerLine) : 0;
      const blockCount = doc.body.querySelectorAll(
        'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, hr, section, article, details',
      ).length;
      const brCount = doc.body.querySelectorAll('br').length;
      const tableCount = doc.body.querySelectorAll('table').length;
      const rowCount = doc.body.querySelectorAll('tr').length;

      let imgHeight = 0;
      for (const img of Array.from(doc.body.querySelectorAll('img'))) {
        const styleText = img.getAttribute('style') ?? '';
        const h = parseCssPx(styleText, 'height') ?? parseAttrPx(img.getAttribute('height'));
        const w = parseCssPx(styleText, 'width') ?? parseAttrPx(img.getAttribute('width'));
        if (h !== null && h > 0) {
          imgHeight += w !== null && w > contentWidth && w > 0 ? Math.round(h * (contentWidth / w)) : h;
        } else {
          imgHeight += 200;
        }
      }

      const raw =
        32 +
        textLines * 24 +
        blockCount * 14 +
        brCount * 22 +
        tableCount * 20 +
        rowCount * 28 +
        imgHeight;
      return Math.ceil(raw * 1.25);
    } catch {
      /* fall through to regex fallback */
    }
  }

  const withoutStyle = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<details\b[^>]*class="ff-quote"[^>]*>[\s\S]*?<\/details>/gi, '<details></details>');
  const textLen = withoutStyle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  const blockCount = (
    withoutStyle.match(/<(br|p|div|li|h[1-6]|blockquote|pre|hr|section|article|details)\b/gi) ?? []
  ).length;
  const tableCount = (withoutStyle.match(/<table\b/gi) ?? []).length;
  const rowCount = (withoutStyle.match(/<tr\b/gi) ?? []).length;
  const imgCount = (withoutStyle.match(/<img\b/gi) ?? []).length;
  const textLines = textLen > 0 ? Math.ceil(textLen / charsPerLine) : 0;
  const raw = 32 + textLines * 24 + blockCount * 14 + tableCount * 20 + rowCount * 28 + imgCount * 200;
  return Math.ceil(raw * 1.25);
}

function buildSrcDoc(bodyHtml: string, allowRemoteImages: boolean, theme: 'light' | 'dark' | 'system'): string {
  // The CSP meta must come first so it applies before any other content is parsed.
  return `<!doctype html>
<html data-frame-theme="${theme}">
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
  const { t, settings } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(600);
  const [viewportHeight, setViewportHeight] = useState(800);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = wrapperRef.current;
    const update = () => {
      if (el) {
        const w = el.getBoundingClientRect().width;
        if (w > 0) setContainerWidth(w);
      }
      if (window.innerHeight > 0) setViewportHeight(window.innerHeight);
    };
    update();
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const toggleLabel = t('reader.toggleQuoted');
  const foldedHtml = useMemo(() => foldQuotedHtml(html, toggleLabel), [html, toggleLabel]);
  const srcDoc = useMemo(
    () => buildSrcDoc(foldedHtml, allowRemoteImages, settings.theme),
    [foldedHtml, allowRemoteImages, settings.theme],
  );
  const rawEstimate = useMemo(
    () => estimateContentHeight(foldedHtml, containerWidth),
    // Recompute when images are allowed as requested, as well as on content or width changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [foldedHtml, containerWidth, allowRemoteImages],
  );

  const minHeight = 120;
  const maxCompactHeight = Math.max(minHeight, Math.round(viewportHeight * 0.8));
  const maxExpandedHeight = Math.max(maxCompactHeight, Math.round(viewportHeight * 4));
  const hitsClamp = rawEstimate > maxCompactHeight;
  const compactHeight = Math.max(minHeight, Math.min(maxCompactHeight, rawEstimate));
  const expandedHeight = Math.min(Math.round(rawEstimate * 2), maxExpandedHeight);
  const height = expanded && hitsClamp ? expandedHeight : compactHeight;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.paper}>
        <iframe
          className={styles.frame}
          title={title ?? t('reader.frameTitle')}
          sandbox={MESSAGE_FRAME_SANDBOX}
          srcDoc={srcDoc}
          style={{ height: `${height}px` }}
        />
      </div>
      {hitsClamp && (
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
