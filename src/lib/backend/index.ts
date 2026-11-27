import type { MailBackend } from './types.ts';

export type Mode = 'demo' | 'live';

const MODE_KEY = 'ffmail.mode';

let backendPromise: Promise<MailBackend> | null = null;

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Order: `?demo=1` (remembered in localStorage so it survives navigation),
 * then a stored `localStorage['ffmail.mode']` ('demo' | 'live'), then the
 * build's NEXT_PUBLIC_MAIL_MODE=demo. Otherwise live.
 */
export function currentMode(): Mode {
  const storage = safeStorage();
  if (typeof window !== 'undefined') {
    try {
      if (new URLSearchParams(window.location.search).get('demo') === '1') {
        try {
          storage?.setItem(MODE_KEY, 'demo');
        } catch {
          /* storage full or blocked; demo still applies for this load */
        }
        return 'demo';
      }
    } catch {
      /* ignore malformed URLs */
    }
  }
  let stored: string | null = null;
  try {
    stored = storage?.getItem(MODE_KEY) ?? null;
  } catch {
    stored = null;
  }
  if (stored === 'demo' || stored === 'live') return stored;
  if (process.env.NEXT_PUBLIC_MAIL_MODE === 'demo') return 'demo';
  return 'live';
}

/** Singleton. Loads only the chosen implementation (separate bundles). */
export function getBackend(): Promise<MailBackend> {
  if (!backendPromise) {
    const mode = currentMode();
    backendPromise = (
      mode === 'demo'
        ? import('./demo/index.ts').then((m) => m.createDemoBackend())
        : import('./supabase/index.ts').then((m) => m.createSupabaseBackend())
    ).catch((err: unknown) => {
      // Allow a retry after a failed chunk load or init error.
      backendPromise = null;
      throw err;
    });
  }
  return backendPromise;
}

/** Stores the mode and reloads the app (dropping a `?demo=` URL flag). */
export function setMode(mode: Mode): void {
  const storage = safeStorage();
  try {
    if (mode === 'demo') storage?.setItem(MODE_KEY, 'demo');
    else storage?.setItem(MODE_KEY, 'live');
  } catch {
    /* storage full or blocked; reload still applies URL/env mode */
  }
  backendPromise = null;
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('demo');
  window.location.replace(url.toString());
}
