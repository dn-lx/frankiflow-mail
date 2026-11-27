/**
 * Isolation policy for rendering untrusted email HTML.
 * Kept in a plain `.ts` module (no JSX, no path aliases) so unit tests can import it.
 */

/** Sandbox for the message iframe: no scripts, opaque origin; links may open new tabs. */
export const MESSAGE_FRAME_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

/**
 * Sandbox for the hidden print iframe. Same origin is needed so the parent can call
 * `contentWindow.print()`; scripts stay disabled, so the email content cannot run code.
 */
export const PRINT_FRAME_SANDBOX = 'allow-same-origin allow-modals';

const CSP_COMMON =
  "media-src 'none'; style-src 'unsafe-inline'; font-src data:; frame-src 'none'; form-action 'none'; base-uri 'none'";

/** CSP when remote images are blocked: only inline `data:` and `cid:` images. */
export const FRAME_CSP_BLOCKED = `default-src 'none'; img-src data: cid:; ${CSP_COMMON}`;

/** CSP when remote images are allowed: adds `https:` (never `http:`) to `img-src`. */
export const FRAME_CSP_ALLOWED = `default-src 'none'; img-src data: cid: https:; ${CSP_COMMON}`;

export function frameCsp(allowRemoteImages: boolean): string {
  return allowRemoteImages ? FRAME_CSP_ALLOWED : FRAME_CSP_BLOCKED;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** The CSP `<meta>` tag; must be the first element of the srcdoc `<head>`. */
export function cspMetaTag(allowRemoteImages: boolean): string {
  return `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(frameCsp(allowRemoteImages))}">`;
}
