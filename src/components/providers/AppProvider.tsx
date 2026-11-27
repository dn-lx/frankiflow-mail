'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getBackend, currentMode, type Mode } from '@/lib/backend';
import type { MailBackend, Settings, UserSession } from '@/lib/backend/types';
import { isLang, translate, type Lang, type TranslateVars } from '@/lib/i18n';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import styles from './AppProvider.module.css';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  density: 'comfortable',
  readingPane: 'right',
  conversationView: true,
  loadRemoteImages: 'ask',
  undoSendSeconds: 5,
  language: 'de',
};

export interface AppContextValue {
  backend: MailBackend;
  session: UserSession | null;
  settings: Settings;
  /** Merges, applies immediately, persists locally and (when signed in) to the backend. Rejects if the backend save fails. */
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  mode: Mode;
  t: (key: string, vars?: TranslateVars) => string;
  lang: Lang;
  /** Re-reads the session (call after signIn/signOut). */
  refreshSession: () => Promise<UserSession | null>;
  /** True once the signed-in user's settings were loaded (or failed to load). */
  settingsLoaded: boolean;
  online: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Like useApp, but returns null outside the provider or while it is loading. */
export function useOptionalApp(): AppContextValue | null {
  return useContext(AppContext);
}

const UI_KEY = 'ffmail.ui';
type UiPrefs = Pick<Settings, 'theme' | 'density' | 'language'>;

interface StoredUi {
  prefs: Partial<UiPrefs>;
  /** True while a local change has not been confirmed by the backend (or was made signed out). */
  pending: boolean;
}

function readUi(): StoredUi {
  try {
    const raw = JSON.parse(window.localStorage.getItem(UI_KEY) ?? '{}') as Record<string, unknown>;
    const prefs: Partial<UiPrefs> = {};
    if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') prefs.theme = raw.theme;
    if (raw.density === 'comfortable' || raw.density === 'compact') prefs.density = raw.density;
    if (isLang(raw.language)) prefs.language = raw.language;
    return { prefs, pending: raw.pending === true };
  } catch {
    return { prefs: {}, pending: false };
  }
}

function writeUi(s: Settings, pending: boolean): void {
  try {
    const ui: UiPrefs & { pending?: true } = { theme: s.theme, density: s.density, language: s.language };
    if (pending) ui.pending = true;
    window.localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    /* storage unavailable */
  }
}

function sameUi(a: Settings, b: Partial<UiPrefs>): boolean {
  return (
    (b.theme === undefined || a.theme === b.theme) &&
    (b.density === undefined || a.density === b.density) &&
    (b.language === undefined || a.language === b.language)
  );
}

function normalizePath(path: string | null): string {
  if (!path) return '/';
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function sameSession(a: UserSession | null, b: UserSession | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.userId === b.userId && a.email === b.email && a.role === b.role && a.mode === b.mode;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = normalizePath(usePathname());

  const [backend, setBackend] = useState<MailBackend | null>(null);
  const [mode, setModeState] = useState<Mode>('live');
  const [session, setSession] = useState<UserSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [uiHydrated, setUiHydrated] = useState(false);
  const [online, setOnline] = useState(true);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** Settings the user changed since the current backend load started (they win over the load result). */
  const patchedSinceLoad = useRef<Partial<Settings>>({});
  const saveSeq = useRef(0);
  const bannerRef = useRef<HTMLDivElement>(null);

  const lang = settings.language;
  // Identity changes with the language (so memoised consumers recompute), but the lookup reads the
  // latest settings: a `t` captured before `await setSettings({ language })` already speaks the new language.
  const t = useCallback(
    (key: string, vars?: TranslateVars) => translate(settingsRef.current.language ?? lang, key, vars),
    [lang],
  );

  // Load backend + session. Local UI prefs first so the loading screen uses the right language.
  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const b = await getBackend();
      const s = await b.getSession();
      setBackend(b);
      setSession(s);
      setSessionChecked(true);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    const { prefs } = readUi();
    if (Object.keys(prefs).length) {
      const next = { ...settingsRef.current, ...prefs };
      settingsRef.current = next;
      setSettingsState(next);
    }
    setUiHydrated(true);
    setModeState(currentMode());
    void load();
  }, [load]);

  const refreshSession = useCallback(async (): Promise<UserSession | null> => {
    if (!backend) return null;
    const s = await backend.getSession();
    if (!sameSession(sessionRef.current, s)) setSession(s);
    return s;
  }, [backend]);

  // Backend change events (realtime / demo updates, sign-in, sign-out).
  useEffect(() => {
    if (!backend) return;
    return backend.onChange(() => {
      refreshSession().catch(() => undefined);
    });
  }, [backend, refreshSession]);

  // Settings once signed in.
  const userId = session?.userId;
  useEffect(() => {
    setSettingsLoaded(false);
    if (!backend || !userId) return;
    let cancelled = false;
    patchedSinceLoad.current = {};
    backend
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        // Local UI prefs that never reached the backend (changed signed out, or the page was left
        // before the save finished) win over the stored settings, then get pushed to the backend.
        const stored = readUi();
        const merged: Settings = {
          ...DEFAULT_SETTINGS,
          ...s,
          ...(stored.pending ? stored.prefs : {}),
          ...patchedSinceLoad.current,
        };
        const needsPush = stored.pending && !sameUi({ ...DEFAULT_SETTINGS, ...s }, stored.prefs);
        settingsRef.current = merged;
        setSettingsState(merged);
        if (needsPush) {
          const seq = ++saveSeq.current;
          writeUi(merged, true);
          backend
            .saveSettings(merged)
            .then(() => {
              if (saveSeq.current === seq) writeUi(settingsRef.current, false);
            })
            .catch(() => undefined);
        } else {
          writeUi(merged, Object.keys(patchedSinceLoad.current).length > 0 && stored.pending);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, userId]);

  // Apply theme, density and language to <html>. Skipped until the stored UI
  // prefs are applied, so DEFAULT_SETTINGS never override the boot script (theme flash).
  useEffect(() => {
    if (!uiHydrated) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
    root.lang = settings.language;
  }, [uiHydrated, settings.theme, settings.density, settings.language]);

  const setSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      patchedSinceLoad.current = { ...patchedSinceLoad.current, ...patch };
      setSettingsState(next);
      // Marked pending until the backend confirms, so a reload before the save lands keeps the choice.
      writeUi(next, true);
      if (backend && sessionRef.current) {
        const seq = ++saveSeq.current;
        await backend.saveSettings(next);
        if (saveSeq.current === seq) writeUi(settingsRef.current, false);
      }
    },
    [backend],
  );

  // Online / offline. Registered after hydration; reads the current state immediately so an
  // `offline` event fired before this effect ran is not missed. Trusts the event type, since
  // some engines update navigator.onLine later than they fire the event.
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    sync();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Expose the banner height as --offline-banner-height on <html> (0px when online).
  useLayoutEffect(() => {
    const el = bannerRef.current;
    const root = document.documentElement;
    if (online || !el) {
      root.style.removeProperty('--offline-banner-height');
      return;
    }
    const apply = () => root.style.setProperty('--offline-banner-height', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty('--offline-banner-height');
    };
  }, [online]);

  // Route guard. "/" redirects itself (app/page.tsx).
  const isPublic = path === '/login' || (mode === 'demo' && path === '/demo-admin');
  let redirectTo: string | null = null;
  if (backend && sessionChecked && path !== '/') {
    if (!session && !isPublic) redirectTo = '/login/';
    else if (session && path === '/login') redirectTo = '/mail/';
  }
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  const value = useMemo<AppContextValue | null>(
    () =>
      backend
        ? { backend, session, settings, setSettings, mode, t, lang, refreshSession, settingsLoaded, online }
        : null,
    [backend, session, settings, setSettings, mode, t, lang, refreshSession, settingsLoaded, online],
  );

  let content: ReactNode;
  if (loadError) {
    content = (
      <main className={styles.center}>
        <div className={styles.errorCard} role="alert">
          <span className={styles.errorIcon}>
            <Icon name="alert" size={28} />
          </span>
          <h1 className={styles.errorTitle}>{t('app.loadError.title')}</h1>
          <p className={styles.errorText}>{t(online ? 'app.loadError.text' : 'common.offline')}</p>
          <Button
            variant="primary"
            icon="refresh"
            loading={retrying}
            onClick={async () => {
              setRetrying(true);
              await load();
              setRetrying(false);
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      </main>
    );
  } else if (!value || !sessionChecked || redirectTo) {
    content = (
      <main className={styles.center} aria-busy="true">
        <Spinner size="lg" label={t('common.loading')} />
      </main>
    );
  } else {
    content = children;
  }

  return (
    <AppContext.Provider value={loadError ? null : value}>
      {/* Stable structure: the frame and app wrappers are neutral (display: contents) while online;
          offline they become a viewport-sized column, so the banner pushes the app down instead of
          covering it, and fixed-position app layouts are contained below the banner. */}
      <div className={online ? styles.frameOnline : styles.frameOffline}>
        {!online && (
          <div ref={bannerRef} className={styles.offline} role="status">
            <Icon name="alert" size={16} />
            <span>{t('common.offline')}</span>
          </div>
        )}
        <div className={online ? styles.appOnline : styles.appOffline}>{content}</div>
      </div>
    </AppContext.Provider>
  );
}
