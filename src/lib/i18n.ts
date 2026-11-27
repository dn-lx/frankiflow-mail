// UI strings and locale helpers. No JSX, no path aliases: tested directly in Node.

export type Lang = 'de' | 'en';
export type StringDict = Record<string, { de: string; en: string }>;
export type TranslateVars = Record<string, string | number>;

const strings = new Map<string, { de: string; en: string }>();

/** Adds (or overrides) keyed strings. Call at module level in `<area>/strings.ts`. */
export function registerStrings(dict: StringDict): void {
  for (const [key, value] of Object.entries(dict)) strings.set(key, value);
}

/** Looks up `key` in `lang` (falls back to German, then the key) and fills `{name}` placeholders. */
export function translate(lang: Lang, key: string, vars?: TranslateVars): string {
  const entry = strings.get(key);
  const template = entry ? entry[lang] || entry.de || key : key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function isLang(value: unknown): value is Lang {
  return value === 'de' || value === 'en';
}

registerStrings({
  'app.name': { de: 'FrankiFlow Mail', en: 'FrankiFlow Mail' },
  'common.loading': { de: 'Wird geladen …', en: 'Loading …' },
  'common.retry': { de: 'Erneut versuchen', en: 'Try again' },
  'common.cancel': { de: 'Abbrechen', en: 'Cancel' },
  'common.save': { de: 'Speichern', en: 'Save' },
  'common.delete': { de: 'Löschen', en: 'Delete' },
  'common.undo': { de: 'Rückgängig', en: 'Undo' },
  'common.close': { de: 'Schließen', en: 'Close' },
  'common.more': { de: 'Weitere Aktionen', en: 'More actions' },
  'common.offline': {
    de: 'Keine Internetverbindung. Änderungen werden eventuell nicht gespeichert.',
    en: 'You are offline. Changes may not be saved.',
  },
  'common.error': { de: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.', en: 'Something went wrong. Please try again.' },
  'common.notifications': { de: 'Benachrichtigungen', en: 'Notifications' },
  'app.loadError.title': { de: 'Die App konnte nicht geladen werden', en: 'The app could not be loaded' },
  'app.loadError.text': {
    de: 'Prüfe deine Internetverbindung und versuche es erneut.',
    en: 'Check your internet connection and try again.',
  },
  'demo.badge': { de: 'DEMO', en: 'DEMO' },
  'demo.badgeLabel': { de: 'Demo-Modus: keine echten E-Mails', en: 'Demo mode: no real email' },
  'auth.signOut': { de: 'Abmelden', en: 'Sign out' },
  'nav.settings': { de: 'Einstellungen', en: 'Settings' },
  'search.placeholder': { de: 'E-Mails durchsuchen', en: 'Search mail' },
  'error.auth': { de: 'Anmeldung fehlgeschlagen oder abgelaufen.', en: 'Sign-in failed or expired.' },
  'error.network': { de: 'Netzwerkfehler. Bitte prüfe deine Verbindung.', en: 'Network error. Please check your connection.' },
  'error.permission': { de: 'Dafür fehlt dir die Berechtigung.', en: 'You do not have permission to do that.' },
});

/**
 * Turns a backend error (message may carry an `auth:`, `network:` or
 * `permission:` prefix) into a presentable message.
 */
export function describeError(lang: Lang, err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const match = /^(auth|network|permission):\s*(.*)$/s.exec(raw);
  if (match) return match[2] ? match[2] : translate(lang, `error.${match[1]}`);
  return raw || translate(lang, 'common.error');
}

function locale(lang: Lang): string {
  return lang === 'de' ? 'de-DE' : 'en-GB';
}

function parse(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** List column: time today, day + month this year, otherwise a short date. */
export function formatListTime(iso: string, lang: Lang, now: Date = new Date()): string {
  const d = parse(iso);
  if (!d) return '';
  const loc = locale(lang);
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(d);
  if (d.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(d);
  }
  return new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** Reader header: full weekday, date and time. */
export function formatFullDate(iso: string, lang: Lang): string {
  const d = parse(iso);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
