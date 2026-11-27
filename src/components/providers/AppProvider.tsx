'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

function readUi(): Partial<UiPrefs> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(UI_KEY) ?? '{}') as Record<string, unknown>;
    const out: Partial<UiPrefs> = {};
    if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') out.theme = raw.theme;
    if (raw.density === 'comfortable' || raw.density === 'compact') out.density = raw.density;
    if (isLang(raw.language)) out.language = raw.language;
    return out;
  } catch {
    return {};
  }
}

function writeUi(s: Settings): void {
  try {
    const ui: UiPrefs = { theme: s.theme, density: s.density, language: s.language };
    window.localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    /* storage unavailable */
  }
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

  const lang = settings.language;
  const t = useCallback((key: string, vars?: TranslateVars) => translate(lang, key, vars), [lang]);

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
    const ui = readUi();
    if (Object.keys(ui).length) setSettingsState((s) => ({ ...s, ...ui }));
    setUiHydrated(true);
    setModeState(currentMode());
    setOnline(navigator.onLine);
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
    backend
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        const merged = { ...DEFAULT_SETTINGS, ...s };
        setSettingsState(merged);
        writeUi(merged);
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
      setSettingsState(next);
      writeUi(next);
      if (backend && sessionRef.current) await backend.saveSettings(next);
    },
    [backend],
  );

  // Online / offline.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

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
      {!online && (
        <div className={styles.offline} role="status">
          <Icon name="alert" size={16} />
          <span>{t('common.offline')}</span>
        </div>
      )}
      {content}
      {mode === 'demo' && (
        <span className={styles.demo} title={t('demo.badgeLabel')}>
          <span aria-hidden="true">{t('demo.badge')}</span>
          <span className="sr-only">{t('demo.badgeLabel')}</span>
        </span>
      )}
    </AppContext.Provider>
  );
}
