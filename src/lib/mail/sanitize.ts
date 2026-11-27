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
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'base',
  'link',
  'meta',
  'video',
  'audio',
  'track',
  'portal',
];

/** Attributes that may carry a navigable or loadable URL; scrubbed for script-like schemes. */
const URL_ATTRS = ['href', 'xlink:href', 'src', 'poster', 'action', 'formaction', 'background', 'lowsrc', 'dynsrc'];

/** Attributes that make the browser fetch a resource on any element. */
const RESOURCE_ATTRS = ['src', 'poster', 'background', 'lowsrc', 'dynsrc', 'data', 'codebase'];

/** Elements where `href` is a navigation link (user-initiated) rather than a fetched resource. */
const LINK_TAGS = new Set(['a', 'area']);

/** SVG presentation attributes that accept CSS `url(...)` values. */
const CSS_VALUE_ATTRS = [
  'fill',
  'stroke',
  'filter',
  'mask',
  'clip-path',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
  'cursor',
];

function normalizeUrl(raw: string): string {
  // Browsers strip leading/trailing C0 controls and spaces and drop tab/newline anywhere.
  return raw.replace(/[\u0000- \u007f]/g, '').toLowerCase();
}

/**
 * Allowlist: the only resource URLs that never reach the network are inline
 * `data:image/*` and `cid:` (inline MIME parts). Everything else counts as remote,
 * including scheme-relative, backslash and scheme-without-slashes spellings.
 */
function isLocalResource(raw: string): boolean {
  const val = normalizeUrl(raw);
  return val.startsWith('cid:') || /^data:image\/[a-z0-9.+-]+[;,]/.test(val);
}

/** A same-document fragment reference (`#id`), used by SVG `use`, gradients etc. */
function isFragmentRef(raw: string): boolean {
  return normalizeUrl(raw).startsWith('#');
}

function isDangerousUrl(raw: string, allowDataImage: boolean): boolean {
  const val = normalizeUrl(raw);
  if (val.startsWith('javascript:') || val.startsWith('vbscript:')) return true;
  if (val.startsWith('data:')) {
    if (!allowDataImage) return true;
    return !/^data:image\/[a-z0-9.+-]+[;,]/.test(val);
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

function isTrackingPixel(el: Element, tag: string): boolean {
  if (tag !== 'img' && tag !== 'image') return false;
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

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function decodeCssEscapes(css: string): string {
  return css.replace(
    /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|(\r\n|[\n\r\f])|([\s\S]))/g,
    (_m, hex: string | undefined, nl: string | undefined, ch: string | undefined) => {
      if (hex) {
        const cp = parseInt(hex, 16);
        if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
        return String.fromCodePoint(cp);
      }
      if (nl) return '';
      return ch ?? '';
    },
  );
}

function removeCssComments(css: string): string {
  let out = css;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');
  } while (out !== prev);
  return out;
}

/**
 * Brings CSS into a canonical form that is analysed *and emitted*, so what the
 * checks see is exactly what the browser parses: escapes are decoded, every
 * remaining backslash is dropped (no escape can survive), comments are removed,
 * and `<` is dropped so `<style>` text can never close its element.
 */
function normalizeCss(css: string): string {
  const decoded = decodeCssEscapes(css)
    .replace(/\\/g, '')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f<]/g, '');
  let out = removeCssComments(decoded);
  let prev: string;
  do {
    prev = out;
    out = out.replace(/@import\b[^;]*(?:;|$)/gi, '');
  } while (out !== prev);
  return out.replace(/expression\s*\(/gi, 'none(');
}

// Any CSS function that can take a URL. Over-matching (e.g. `url (`) is harmless.
const CSS_FETCH_FN_RE =
  /(?<![\w-])(-webkit-image-set|image-set|-webkit-cross-fade|cross-fade|image|url|src)\s*\(/gi;

function findClosingParen(text: string, from: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

function firstCssArgument(inner: string): string {
  const trimmed = inner.trim();
  const q = trimmed[0];
  if (q === '"' || q === "'") {
    const end = trimmed.indexOf(q, 1);
    return end === -1 ? trimmed.slice(1) : trimmed.slice(1, end);
  }
  return trimmed;
}

function collectCssUrls(inner: string): string[] {
  const urls: string[] = [];
  for (const m of inner.matchAll(/(["'])([^"']*)\1/g)) urls.push(m[2]!);
  for (const m of inner.matchAll(/(?:url|src)\s*\(\s*([^)"'\s]+)/gi)) urls.push(m[1]!);
  return urls;
}

function rewriteCss(css: string, allowRemoteImages: boolean): { css: string; blockedCount: number } {
  const text = normalizeCss(css);
  let blockedCount = 0;
  let out = '';
  let pos = 0;
  CSS_FETCH_FN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CSS_FETCH_FN_RE.exec(text)) !== null) {
    const start = m.index;
    const argStart = start + m[0].length;
    const close = findClosingParen(text, argStart);
    const end = Math.min(close + 1, text.length);
    const name = m[1]!.toLowerCase();
    const inner = text.slice(argStart, close);
    let replacement = text.slice(start, end);

    if (name === 'url' || name === 'src') {
      const value = firstCssArgument(inner);
      if (!value.trim() || isDangerousUrl(value, true)) {
        replacement = 'none';
      } else if (!allowRemoteImages && !isLocalResource(value) && !isFragmentRef(value)) {
        blockedCount += 1;
        replacement = `url("${PLACEHOLDER_IMG}")`;
      }
    } else {
      const urls = collectCssUrls(inner);
      if (urls.some((u) => isDangerousUrl(u, true))) {
        replacement = 'none';
      } else if (!allowRemoteImages && urls.some((u) => !isLocalResource(u) && !isFragmentRef(u))) {
        blockedCount += 1;
        replacement = 'none';
      }
    }

    out += text.slice(pos, start) + replacement;
    pos = end;
    CSS_FETCH_FN_RE.lastIndex = end;
  }
  out += text.slice(pos);
  return { css: out, blockedCount };
}

// ---------------------------------------------------------------------------
// srcset
// ---------------------------------------------------------------------------

function rewriteSrcset(
  srcset: string,
  allowRemoteImages: boolean,
): { kept: string | null; blocked: boolean } {
  const parts = srcset
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let blocked = false;
  const safeParts: string[] = [];
  for (const part of parts) {
    const [url] = part.split(/\s+/);
    if (!url || isDangerousUrl(url, true)) continue;
    if (!allowRemoteImages && !isLocalResource(url)) {
      blocked = true;
      continue;
    }
    safeParts.push(part);
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
 *
 * Remote blocking is an allowlist (only `data:image/*` and `cid:` survive). The
 * rendering iframe additionally enforces a CSP (see `components/reader/frame-policy.ts`),
 * which is the primary control; this sanitizer is the second layer.
 */
export function sanitizeEmailHtml(html: string, options: SanitizeOptions): SanitizeResult {
  if (!html || !html.trim()) {
    return { html: '', blockedImages: 0, hasTrackingPixel: false };
  }

  const purify = options.purify ?? getDefaultPurify();
  const allowRemote = options.allowRemoteImages;
  let blockedImages = 0;
  let hasTrackingPixel = false;

  const afterAttributes = (node: Element) => {
    if (!node || node.nodeType !== 1) return;
    const tag = node.nodeName.toLowerCase();

    // 1. Always drop 1x1 or hidden tracking pixels.
    if (isTrackingPixel(node, tag)) {
      hasTrackingPixel = true;
      node.parentNode?.removeChild(node);
      return;
    }

    // 2. Scrub dangerous URLs on all URL-bearing attributes.
    for (const attr of URL_ATTRS) {
      const val = node.getAttribute(attr);
      if (val == null) continue;
      const isNavigation =
        ((attr === 'href' || attr === 'xlink:href') && LINK_TAGS.has(tag)) ||
        attr === 'action' ||
        attr === 'formaction';
      if (isDangerousUrl(val, !isNavigation)) {
        node.removeAttribute(attr);
      }
    }

    // 3. Rewrite links to open safely in a new tab.
    if (LINK_TAGS.has(tag) && (node.hasAttribute('href') || node.hasAttribute('xlink:href'))) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }

    // 4. Resource attributes: allowlist when remote content is blocked.
    let elementBlocked = false;
    const originals: string[] = [];
    const remember = (v: string) => {
      originals.push(v);
    };

    for (const attr of RESOURCE_ATTRS) {
      const val = node.getAttribute(attr);
      if (val == null) continue;
      if (!val.trim()) {
        node.removeAttribute(attr);
        continue;
      }
      if (allowRemote || isLocalResource(val)) continue;
      remember(val);
      if ((attr === 'src' && tag === 'img') || attr === 'poster') {
        node.setAttribute(attr, PLACEHOLDER_IMG);
      } else {
        node.removeAttribute(attr);
      }
      elementBlocked = true;
    }

    const srcset = node.getAttribute('srcset');
    if (srcset != null) {
      const res = rewriteSrcset(srcset, allowRemote);
      if (res.blocked) {
        remember(srcset);
        elementBlocked = true;
      }
      if (res.kept) node.setAttribute('srcset', res.kept);
      else node.removeAttribute('srcset');
    }

    // href / xlink:href on non-link elements (SVG image, use, feImage, pattern...) is a fetch.
    if (!LINK_TAGS.has(tag)) {
      for (const attr of ['href', 'xlink:href']) {
        const val = node.getAttribute(attr);
        if (val == null) continue;
        if (allowRemote || isLocalResource(val) || isFragmentRef(val)) continue;
        remember(val);
        node.removeAttribute(attr);
        elementBlocked = true;
      }
    }

    if (originals.length > 0) node.setAttribute('data-src', originals[0]!);
    if (elementBlocked) blockedImages += 1;

    // 5. CSS in presentation attributes and inline styles.
    for (const attr of CSS_VALUE_ATTRS) {
      const val = node.getAttribute(attr);
      if (val == null || !val.includes('(')) continue;
      const res = rewriteCss(val, allowRemote);
      blockedImages += res.blockedCount;
      node.setAttribute(attr, res.css);
    }

    const styleAttr = node.getAttribute('style');
    if (styleAttr) {
      const res = rewriteCss(styleAttr, allowRemote);
      blockedImages += res.blockedCount;
      node.setAttribute('style', res.css);
    }

    // 6. <style> element text (HTML `STYLE` and SVG `style` alike).
    if (tag === 'style' && node.textContent) {
      const res = rewriteCss(node.textContent, allowRemote);
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
