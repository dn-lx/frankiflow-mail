import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * Records everything that must not happen in demo mode. The `guard` fixture is
 * automatic: every test gets it and fails in teardown if
 *  - a request left the base URL (all such requests are aborted),
 *  - the console logged an error,
 *  - the page threw an uncaught error,
 *  - an unexpected JS dialog (alert/confirm/prompt) opened.
 * Nothing is allow-listed by default; a test may call `guard.allow(/…/)` for
 * requests it provokes on purpose (e.g. remote images after "Bilder anzeigen").
 */
export interface Guard {
  /** URLs of requests that were aborted because they did not go to the base URL. */
  readonly blocked: string[];
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly dialogs: string[];
  /** Do not fail on blocked requests (and their console errors) matching `pattern`. */
  allow(pattern: RegExp): void;
}

export const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ page, context, baseURL }, use) => {
      const origin = new URL(baseURL ?? 'http://127.0.0.1:4179').origin;
      const allowed: RegExp[] = [];
      const isAllowed = (s: string) => allowed.some((p) => p.test(s));
      const guard: Guard = {
        blocked: [],
        consoleErrors: [],
        pageErrors: [],
        dialogs: [],
        allow: (pattern) => {
          allowed.push(pattern);
        },
      };

      // Context-wide so popups (window.open) are covered too.
      await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (url === origin || url.startsWith(`${origin}/`)) {
          await route.continue();
          return;
        }
        guard.blocked.push(url);
        await route.abort('blockedbyclient');
      });

      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const where = msg.location()?.url ?? '';
        if (isAllowed(where) || isAllowed(msg.text())) return;
        // Playwright injects its helper script into every frame it inspects. In the reader's
        // sandboxed email frame (no allow-scripts) Chromium blocks it and logs this line, which
        // shows the sandbox works; it is not an app error. Chromium reports it without a
        // location, WebKit with its inspector bootstrap URL, so match on the text only.
        if (/^Blocked script execution in 'about:srcdoc'/.test(msg.text())) return;
        guard.consoleErrors.push(where ? `${msg.text()} (${where})` : msg.text());
      });
      page.on('pageerror', (err) => {
        // WebKit reports a same-origin fetch that is cancelled by a navigation or reload
        // (Next's page-data/prefetch requests) as "Fetch API cannot load <url> due to access
        // control checks". Nothing fails for the user; ignore it only for our own origin.
        // WebKit prints the URL oddly ("http: /host/…"), so match on our host instead of the URL.
        if (/^Fetch API cannot load /.test(err.message) && /due to access control checks/.test(err.message) && err.message.includes(new URL(origin).host)) return;
        guard.pageErrors.push(`${err.name}: ${err.message}`);
      });
      page.on('dialog', async (dialog) => {
        // beforeunload (unsaved composer / settings) is expected when tests navigate.
        if (dialog.type() !== 'beforeunload') guard.dialogs.push(`${dialog.type()}: ${dialog.message()}`);
        await dialog.accept().catch(() => undefined);
      });

      await use(guard);

      expect(guard.blocked.filter((u) => !isAllowed(u)), 'requests outside the base URL').toEqual([]);
      expect(guard.pageErrors, 'uncaught page errors').toEqual([]);
      expect(guard.consoleErrors, 'console errors').toEqual([]);
      expect(guard.dialogs, 'unexpected JS dialogs').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export type Layout = 'phone' | 'tablet' | 'desktop';

/** Same breakpoints as src/components/shell/hooks.ts (phone < 700 ≤ tablet < 1100 ≤ desktop). */
export function layoutOf(page: Page): Layout {
  const w = page.viewportSize()?.width ?? 1440;
  return w <= 699 ? 'phone' : w <= 1099 ? 'tablet' : 'desktop';
}

export function projectIs(testInfo: TestInfo, name: 'chromium-desktop' | 'chromium-tablet' | 'webkit-iphone'): boolean {
  return testInfo.project.name === name;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const DEMO_EMAIL = 'demo@frankiflow.de';
export const DEMO_PASSWORD = 'demo1234';

/** Fills and submits the login form (German UI). Does not wait for the result. */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

/** Opens /login/?demo=1, signs in and waits for the mailbox. */
export async function signInDemo(page: Page, email = DEMO_EMAIL, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/login/?demo=1');
  await submitLogin(page, email, password);
  await page.waitForURL(/\/mail\//);
  await expect(page.locator('#mail-list')).toBeVisible();
}

/* ------------------------------------------------------------------ */
/* Mail shell                                                          */
/* ------------------------------------------------------------------ */

/** All thread rows in the list. */
export function threadRows(page: Page): Locator {
  return page.locator('#mail-list li[data-thread-id]');
}

export function threadRow(page: Page, subject: string | RegExp): Locator {
  return threadRows(page).filter({ hasText: subject }).first();
}

/** Empty-state heading of the list (EmptyState renders an h2). */
export function listEmptyState(page: Page): Locator {
  return page.locator('#mail-list').getByRole('heading', { level: 2 });
}

/** Waits until the list shows rows or an empty state (not the skeleton). */
export async function waitForList(page: Page): Promise<void> {
  await expect(threadRows(page).first().or(listEmptyState(page))).toBeVisible();
}

/** Toast region (role=status, "Benachrichtigungen"). */
export function toasts(page: Page): Locator {
  return page.getByRole('status', { name: 'Benachrichtigungen' });
}

/** Unread count from the tab title "(N) Ordner – FrankiFlow Mail"; 0 without a count. */
export async function titleUnread(page: Page): Promise<number> {
  const m = /^\((\d+)\)/.exec(await page.title());
  return m ? Number(m[1]) : 0;
}

/** Makes the sidebar usable: on tablet / phone it is a drawer opened from the top bar. */
export async function openSidebar(page: Page): Promise<Locator> {
  const sidebar = page.locator('#mail-sidebar');
  if (layoutOf(page) !== 'desktop') {
    await page.getByRole('button', { name: 'Menü öffnen' }).click();
    await expect(page.getByRole('dialog', { name: 'Hauptnavigation' })).toBeVisible();
  }
  return sidebar;
}

/** Clicks a folder in the sidebar ("Gesendet", "Markiert", …) and waits for the list. */
export async function goToFolder(page: Page, folderName: string): Promise<void> {
  const sidebar = await openSidebar(page);
  await sidebar
    .getByRole('navigation', { name: 'Ordner' })
    .getByRole('link', { name: new RegExp(`^${folderName}`) })
    .click();
  await expect(page.locator('#mail-list-title')).toHaveText(folderName);
  await waitForList(page);
}

/** Opens a thread from the list and waits for the reader heading. */
export async function openThread(page: Page, subject: string | RegExp): Promise<void> {
  await threadRow(page, subject).locator('a[data-thread-link]').click();
  await expect(page).toHaveURL(/[?&]t=/);
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();
}

/** Opens a new composer window (sidebar button, or the bottom bar on phones). */
export async function openComposer(page: Page): Promise<Locator> {
  if (layoutOf(page) === 'phone') {
    await page.getByRole('navigation', { name: 'Schnellzugriff' }).getByRole('button', { name: 'Schreiben' }).click();
  } else {
    const sidebar = await openSidebar(page);
    await sidebar.getByRole('button', { name: 'Schreiben', exact: true }).click();
  }
  const composer = composerWindow(page);
  await expect(composer.getByRole('combobox', { name: 'An', exact: true })).toBeVisible();
  return composer;
}

/** The newest composer window. */
export function composerWindow(page: Page): Locator {
  return page.locator('[data-composer-window]').last();
}

/** Types an address into "An" and commits it as a chip. */
export async function addRecipient(composer: Locator, address: string): Promise<void> {
  const to = composer.getByRole('combobox', { name: 'An', exact: true });
  await to.fill(address);
  await to.press('Enter');
  await expect(composer.getByRole('button', { name: `${address} entfernen` })).toBeVisible();
}

export function composerSubject(composer: Locator): Locator {
  return composer.getByLabel('Betreff', { exact: true });
}

export function composerBody(composer: Locator): Locator {
  return composer.getByRole('textbox', { name: 'Nachrichtentext' });
}

/** Moves focus to <body> so single-key shortcuts reach the global handler. */
export async function blurActive(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
}

/** A unique, readable suffix for subjects created by a test. */
export function uniqueSuffix(testInfo: TestInfo): string {
  return `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now().toString(36)}`;
}
