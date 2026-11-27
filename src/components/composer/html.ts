'use client';

// Browser-only HTML helpers for the composer. All HTML that enters the editor
// or leaves the composer goes through DOMPurify here.

import DOMPurify from 'dompurify';
import type { Message } from '@/lib/backend/types';
import { formatFullDate, type Lang } from '@/lib/i18n';
import { formatAddress } from '@/lib/mail/addresses';

type Purifier = ReturnType<typeof DOMPurify>;

let purifier: Purifier | null = null;

function getPurifier(): Purifier {
  if (!purifier) purifier = DOMPurify(window);
  return purifier;
}

const ALLOWED_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'p', 'br', 'div', 'span',
  'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'img',
];
const BASE_ATTR = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'];
const MARKER_ATTR = ['data-ff-signature', 'data-ff-quote', 'data-ff-quote-header'];

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const HTTPS_IMAGE = /^https:\/\//i;
const SAFE_LINK = /^(?:https?:|mailto:)/i;

export interface CleanOptions {
  /** Keep the composer's own data-ff-* markers (signature, quote). */
  keepMarkers?: boolean;
  /** Allow https images (own content, signatures). Quoted mail only keeps inline data images. */
  allowRemoteImages?: boolean;
}

/** Sanitizes HTML to basic formatting: no styles, scripts, classes, forms or unsafe links/images. */
export function cleanHtml(html: string, options: CleanOptions = {}): string {
  if (typeof window === 'undefined' || !html) return '';
  const p = getPurifier();
  const sanitized = String(
    p.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: options.keepMarkers ? [...BASE_ATTR, ...MARKER_ATTR] : BASE_ATTR,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      KEEP_CONTENT: true,
    }),
  );
  // Post-process in an inert document (DOMParser documents never load images).
  const doc = new DOMParser().parseFromString(`<body>${sanitized}</body>`, 'text/html');
  doc.body.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') ?? '').trim();
    const ok = DATA_IMAGE.test(src) || (options.allowRemoteImages && HTTPS_IMAGE.test(src));
    if (!ok) img.remove();
  });
  doc.body.querySelectorAll('a').forEach((a) => {
    const href = (a.getAttribute('href') ?? '').trim();
    if (!SAFE_LINK.test(href)) a.removeAttribute('href');
  });
  return doc.body.innerHTML;
}

/** Content leaving the composer (save and send). */
export function cleanComposeHtml(html: string): string {
  return cleanHtml(html, { keepMarkers: true, allowRemoteImages: true });
}

/** Clipboard HTML: basic formatting only. */
export function cleanPastedHtml(html: string): string {
  return cleanHtml(html, { keepMarkers: false, allowRemoteImages: true });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text to paragraphs with line breaks. */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return '';
  return normalized
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const BLOCKS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'PRE', 'TABLE', 'TR', 'HR',
]);

/** Readable plain-text version of composer HTML (for the text/plain part and previews). */
export function htmlToText(html: string): string {
  if (typeof window === 'undefined' || !html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const lines: string[] = [];
  let line = '';
  const flush = (prefix: string) => {
    lines.push(prefix + line.replace(/[ \t]+/g, ' ').trim());
    line = '';
  };

  const walk = (node: Node, prefix: string, listIndex: { n: number } | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      line += (node.textContent ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName;
    if (tag === 'BR') {
      flush(prefix);
      return;
    }
    if (tag === 'HR') {
      if (line.trim()) flush(prefix);
      lines.push(prefix + '---');
      return;
    }
    const isBlock = BLOCKS.has(tag);
    if (isBlock && line.trim()) flush(prefix);
    let childPrefix = prefix;
    let childList = listIndex;
    if (tag === 'BLOCKQUOTE') childPrefix = prefix + '> ';
    if (tag === 'OL') childList = { n: 0 };
    if (tag === 'UL') childList = null;
    if (tag === 'LI') {
      if (listIndex) {
        listIndex.n += 1;
        line += `${listIndex.n}. `;
      } else {
        line += '- ';
      }
    }
    node.childNodes.forEach((child) => walk(child, childPrefix, tag === 'OL' || tag === 'UL' ? childList : listIndex));
    if (tag === 'A') {
      const href = node.getAttribute('href') ?? '';
      const text = (node.textContent ?? '').trim();
      if (href && !href.startsWith('mailto:') && href !== text) line += ` (${href})`;
    }
    if (isBlock && line.trim()) flush(childPrefix);
  };

  doc.body.childNodes.forEach((child) => walk(child, '', null));
  if (line.trim()) flush('');
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text the user wrote: without quoted original and signature. */
export function ownText(html: string): string {
  if (typeof window === 'undefined' || !html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll('[data-ff-quote],[data-ff-quote-header],[data-ff-signature]').forEach((el) => el.remove());
  return doc.body.textContent ?? '';
}

export function signatureBlock(signatureHtml: string | undefined): string {
  const inner = signatureInner(signatureHtml);
  return `<div data-ff-signature="">${inner}</div>`;
}

/** Content of the signature block: "-- " separator line and the sanitized signature. */
export function signatureInner(signatureHtml: string | undefined): string {
  const clean = signatureHtml ? cleanHtml(signatureHtml, { allowRemoteImages: true }) : '';
  if (!clean.trim()) return '';
  return `<p>--&nbsp;</p>${clean}`;
}

function messageDate(m: Message): string {
  return m.receivedAt ?? m.sentAt ?? m.createdAt;
}

function originalBodyHtml(m: Message): string {
  const fromHtml = m.htmlBody ? cleanHtml(m.htmlBody, { allowRemoteImages: false }) : '';
  if (fromHtml.trim()) return fromHtml;
  return textToHtml(m.textBody || '');
}

export interface QuoteLabels {
  wrote: (vars: { date: string; name: string }) => string;
  forwardedHeader: string;
  from: string;
  date: string;
  subject: string;
  to: string;
  cc: string;
}

/** Quoted original for reply / forward, as sanitized HTML with markers. */
export function buildQuote(m: Message, mode: 'reply' | 'forward', lang: Lang, labels: QuoteLabels): string {
  const date = formatFullDate(messageDate(m), lang);
  const sender = formatAddress({ name: m.from.name, address: m.from.address });
  const body = originalBodyHtml(m);
  if (mode === 'reply') {
    const header = escapeHtml(labels.wrote({ date, name: sender }));
    return `<p data-ff-quote-header="">${header}</p><blockquote data-ff-quote="">${body}</blockquote>`;
  }
  const rows = [
    escapeHtml(labels.forwardedHeader),
    `${escapeHtml(labels.from)}: ${escapeHtml(sender)}`,
    `${escapeHtml(labels.date)}: ${escapeHtml(date)}`,
    `${escapeHtml(labels.subject)}: ${escapeHtml(m.subject)}`,
    `${escapeHtml(labels.to)}: ${escapeHtml(m.to.join(', '))}`,
  ];
  if (m.cc.length) rows.push(`${escapeHtml(labels.cc)}: ${escapeHtml(m.cc.join(', '))}`);
  return `<p data-ff-quote-header="">${rows.join('<br>')}</p><blockquote data-ff-quote="">${body}</blockquote>`;
}

/** Normalizes a link the user typed; returns null when the scheme is not allowed. */
export function normalizeLink(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return SAFE_LINK.test(s) ? s : null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  if (/\s/.test(s)) return null;
  return `https://${s.replace(/^\/+/, '')}`;
}
