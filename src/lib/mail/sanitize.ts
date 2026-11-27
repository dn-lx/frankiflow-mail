import DOMPurify from 'dompurify';

export interface PurifyLike {
  sanitize(dirty: string, config?: Record<string, unknown>): string;
  addHook?(
    hookName: string,
    cb: (currentNode: Element, hookEvent: unknown, config: unknown) => void,
  ): void;
  removeHook?(hookName: string): void;
  removeAllHooks?(): void;
}

export interface SanitizeOptions {
  allowRemoteImages: boolean;
  /** Injectable DOMPurify instance for Node/unit tests where global `window` is absent. */
  purify?: PurifyLike;
}

export interface SanitizeResult {
  html: string;
  blockedImages: number;
  hasTrackingPixel: boolean;
}

// Neutral 1x1 transparent GIF used as a placeholder when remote images are blocked.
const PLACEHOLDER_IMG =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const FORBID_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'base',
  'link',
  'meta',
  'noscript',
  'frame',
  'frameset',
  'applet',
];

const URL_ATTRS = ['href', 'src', 'poster', 'action', 'formaction', 'background', 'xlink:href'];

function isRemoteUrl(raw: string): boolean {
  const val = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  return /^https?:\/\//i.test(val) || val.startsWith('//');
}

function isDangerousUrl(raw: string, allowDataImage: boolean): boolean {
  const val = raw.trim().replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  if (val.startsWith('javascript:') || val.startsWith('vbscript:')) return true;
  if (val.startsWith('data:')) {
    if (!allowDataImage) return true;
    return !/^data:image\/[a-z0-9.+-]+[;,]/i.test(val);
  }
  return false;
}

function parseDimension(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase().replace(/px$/, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function getInlineStyleProp(styleText: string, prop: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = re.exec(styleText);
  return m ? m[1]!.trim().toLowerCase() : null;
}

function isTrackingPixel(el: Element): boolean {
  if (el.tagName !== 'IMG') return false;
  const styleText = el.getAttribute('style') ?? '';

  const display = getInlineStyleProp(styleText, 'display');
  if (display === 'none') return true;
  const visibility = getInlineStyleProp(styleText, 'visibility');
  if (visibility === 'hidden') return true;
  const opacity = getInlineStyleProp(styleText, 'opacity');
  if (opacity === '0' || opacity === '0.0') return true;

  const attrW = parseDimension(el.getAttribute('width'));
  const attrH = parseDimension(el.getAttribute('height'));
  const styleW = parseDimension(getInlineStyleProp(styleText, 'width'));
  const styleH = parseDimension(getInlineStyleProp(styleText, 'height'));

  const w = styleW ?? attrW;
  const h = styleH ?? attrH;

  if (w !== null && h !== null && w <= 1 && h <= 1) return true;
  if (w === 0 || h === 0) return true;

  return false;
}

function rewriteCssUrls(
  css: string,
  allowRemoteImages: boolean,
): { css: string; blockedCount: number } {
  let blockedCount = 0;
  // Strip @import rules and dangerous expressions/javascript: in CSS.
  let next = css
    .replace(/@import\b[^;]*(;|$)/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, 'none');

  next = next.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _quote: string, url: string) => {
    const trimmed = url.trim();
    if (isDangerousUrl(trimmed, true)) return 'none';
    if (!allowRemoteImages && isRemoteUrl(trimmed)) {
      blockedCount += 1;
      return `url("${PLACEHOLDER_IMG}")`;
    }
    return full;
  });

  return { css: next, blockedCount };
}

function rewriteSrcset(
  srcset: string,
  allowRemoteImages: boolean,
): { kept: string | null; blocked: boolean } {
  if (allowRemoteImages) return { kept: srcset, blocked: false };
  const parts = srcset
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let blocked = false;
  const safeParts: string[] = [];
  for (const part of parts) {
    const [url] = part.split(/\s+/);
    if (url && isRemoteUrl(url)) {
      blocked = true;
    } else if (url && !isDangerousUrl(url, true)) {
      safeParts.push(part);
    }
  }
  return { kept: safeParts.length > 0 ? safeParts.join(', ') : null, blocked };
}

function getDefaultPurify(): PurifyLike {
  if (typeof window === 'undefined') {
    throw new Error('sanitizeEmailHtml requires a purify instance outside the browser');
  }
  return DOMPurify as unknown as PurifyLike;
}

/**
 * Sanitizes untrusted email HTML using DOMPurify.
 * Strips dangerous tags/handlers/URIs, enforces external link attributes,
 * removes 1x1/hidden tracking pixels, and optionally blocks remote images.
 */
export function sanitizeEmailHtml(html: string, options: SanitizeOptions): SanitizeResult {
  if (!html || !html.trim()) {
    return { html: '', blockedImages: 0, hasTrackingPixel: false };
  }

  const purify = options.purify ?? getDefaultPurify();
  let blockedImages = 0;
  let hasTrackingPixel = false;

  const afterAttributes = (node: Element) => {
    const tag = node.tagName;

    // 1. Always drop 1x1 or hidden tracking pixels.
    if (isTrackingPixel(node)) {
      hasTrackingPixel = true;
      node.parentNode?.removeChild(node);
      return;
    }

    // 2. Scrub dangerous URLs on all URL-bearing attributes.
    for (const attr of URL_ATTRS) {
      const val = node.getAttribute(attr);
      if (val == null) continue;
      const allowDataImg = attr !== 'href' && attr !== 'action' && attr !== 'formaction';
      if (isDangerousUrl(val, allowDataImg)) {
        node.removeAttribute(attr);
      }
    }

    // 3. Rewrite links to open safely in a new tab.
    if (tag === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }

    // 4. Handle remote images / backgrounds when blocked.
    if (!options.allowRemoteImages) {
      let elementBlocked = false;

      if (tag === 'IMG' || tag === 'SOURCE') {
        const src = node.getAttribute('src');
        if (src && isRemoteUrl(src)) {
          node.setAttribute('data-src', src);
          node.setAttribute('src', PLACEHOLDER_IMG);
          elementBlocked = true;
        }
        const srcset = node.getAttribute('srcset');
        if (srcset) {
          const res = rewriteSrcset(srcset, false);
          if (res.blocked) {
            if (!node.hasAttribute('data-src')) node.setAttribute('data-src', srcset);
            if (res.kept) node.setAttribute('srcset', res.kept);
            else node.removeAttribute('srcset');
            elementBlocked = true;
          }
        }
      }

      const poster = node.getAttribute('poster');
      if (poster && isRemoteUrl(poster)) {
        node.setAttribute('data-src', poster);
        node.setAttribute('poster', PLACEHOLDER_IMG);
        elementBlocked = true;
      }

      const bg = node.getAttribute('background');
      if (bg && isRemoteUrl(bg)) {
        if (!node.hasAttribute('data-src')) node.setAttribute('data-src', bg);
        node.removeAttribute('background');
        elementBlocked = true;
      }

      if (elementBlocked) blockedImages += 1;
    }

    // 5. Sanitize inline style url(...) and expressions.
    const styleAttr = node.getAttribute('style');
    if (styleAttr) {
      const res = rewriteCssUrls(styleAttr, options.allowRemoteImages);
      blockedImages += res.blockedCount;
      node.setAttribute('style', res.css);
    }

    // 6. Sanitize <style> element text content.
    if (tag === 'STYLE' && node.textContent) {
      const res = rewriteCssUrls(node.textContent, options.allowRemoteImages);
      blockedImages += res.blockedCount;
      node.textContent = res.css;
    }
  };

  purify.addHook?.('afterSanitizeAttributes', afterAttributes);
  try {
    const clean = purify.sanitize(html, {
      FORBID_TAGS,
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target', 'rel', 'data-src'],
      WHOLE_DOCUMENT: false,
      FORCE_BODY: true,
    });
    return { html: clean, blockedImages, hasTrackingPixel };
  } finally {
    purify.removeHook?.('afterSanitizeAttributes');
  }
}
