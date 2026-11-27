import DOMPurify from 'dompurify';

export interface PurifyLike {
  sanitize(dirty: string, config?: Record<string, unknown>): string;
  addHook?(
    hookName: string,
    cb: (currentNode: Element, hookEvent: unknown, config: unknown) => void,
  ): void;
  removeHook?(hookName: string): void;
}

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'span',
  'div',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

export const SAFE_LINK_RE = /^(https?:\/\/|mailto:)[^\s]+$/i;

/**
 * Sanitizes signature or template HTML with DOMPurify and ensures safe links.
 * Fails closed (returns an empty string) when no DOM / purify instance is available.
 */
export function sanitizeEditorHtml(rawHtml: string, purify?: PurifyLike): string {
  if (!rawHtml) return '';

  const instance: PurifyLike | null =
    purify ?? (typeof window !== 'undefined' ? (DOMPurify as unknown as PurifyLike) : null);
  if (!instance || typeof instance.sanitize !== 'function') {
    return '';
  }

  const afterAttributes = (node: Element) => {
    if (node.tagName === 'A') {
      const href = (node.getAttribute('href') ?? '').trim();
      if (!SAFE_LINK_RE.test(href)) {
        node.removeAttribute('href');
        node.removeAttribute('target');
        node.removeAttribute('rel');
      } else {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  };

  instance.addHook?.('afterSanitizeAttributes', afterAttributes);
  try {
    return instance.sanitize(rawHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    });
  } finally {
    instance.removeHook?.('afterSanitizeAttributes');
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function evaluatePasswordStrength(pwd: string): {
  score: 0 | 1 | 2 | 3;
  key:
    | 'settings.account.strengthWeak'
    | 'settings.account.strengthFair'
    | 'settings.account.strengthGood'
    | 'settings.account.strengthStrong';
} {
  if (pwd.length < 8) {
    return { score: 0, key: 'settings.account.strengthWeak' };
  }
  let points = 1;
  if (pwd.length >= 12) points += 1;
  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /\d/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (variety >= 3) points += 1;
  if (points >= 3) return { score: 3, key: 'settings.account.strengthStrong' };
  if (points === 2) return { score: 2, key: 'settings.account.strengthGood' };
  return { score: 1, key: 'settings.account.strengthFair' };
}
