'use client';

// Browser entry for the composer's HTML helpers. The logic lives in html-core.ts
// (testable in Node); this module binds it to the real window and DOMPurify.

import DOMPurify from 'dompurify';
import type { Message } from '@/lib/backend/types';
import { createHtmlKit, type CleanOptions, type HtmlKit, type QuoteLabels } from './html-core.ts';

export { escapeHtml, normalizeLink, textToHtml } from './html-core.ts';
export type { CleanOptions, HtmlKit, QuoteLabels } from './html-core.ts';

let cached: HtmlKit | null = null;

/** The browser HTML helpers. During server render (no window) they return empty results. */
export function htmlKit(): HtmlKit {
  if (typeof window === 'undefined') return createHtmlKit(null);
  if (!cached) cached = createHtmlKit({ win: window, purify: DOMPurify(window) });
  return cached;
}

/** Sanitizes HTML to basic formatting: no styles, scripts, classes, forms or unsafe links/images. */
export function cleanHtml(html: string, options?: CleanOptions): string {
  return htmlKit().cleanHtml(html, options);
}

/** Content leaving the composer (save and send). */
export function cleanComposeHtml(html: string): string {
  return htmlKit().cleanComposeHtml(html);
}

/** Clipboard HTML: basic formatting only. */
export function cleanPastedHtml(html: string): string {
  return htmlKit().cleanPastedHtml(html);
}

/** Readable plain-text version of composer HTML (for the text/plain part and previews). */
export function htmlToText(html: string): string {
  return htmlKit().htmlToText(html);
}

/** Text the user wrote: without quoted original and signature. */
export function ownText(html: string): string {
  return htmlKit().ownText(html);
}

export function signatureBlock(signatureHtml: string | undefined): string {
  return htmlKit().signatureBlock(signatureHtml);
}

/** Content of the signature block: "-- " separator line and the sanitized signature. */
export function signatureInner(signatureHtml: string | undefined): string {
  return htmlKit().signatureInner(signatureHtml);
}

/** Quoted original for reply / forward, as sanitized HTML with markers. */
export function buildQuote(m: Message, mode: 'reply' | 'forward', labels: QuoteLabels): string {
  return htmlKit().buildQuote(m, mode, labels);
}
