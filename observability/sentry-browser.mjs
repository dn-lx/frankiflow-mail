const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|email|phone|address|message|body|health|finance|payment|card)/i;

function scrubObject(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(item => scrubObject(item, depth + 1));
  if (typeof value !== 'object') return value;
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    clean[key] = SENSITIVE_KEY.test(key) ? '[Filtered]' : scrubObject(item, depth + 1);
  }
  return clean;
}

export function initSentryBrowser({ dsn = '', environment = 'unknown', release = '' } = {}) {
  if (!dsn || !globalThis.Sentry || typeof globalThis.Sentry.init !== 'function') return false;
  globalThis.Sentry.init({
    dsn,
    environment,
    release: release || undefined,
    sendDefaultPii: false,
    beforeSend(event) {
      const next = scrubObject(event);
      if (next && typeof next === 'object') {
        delete next.user;
        if (next.request) {
          delete next.request.cookies;
          delete next.request.data;
          delete next.request.headers;
        }
      }
      return next;
    }
  });
  return true;
}

export { scrubObject };
