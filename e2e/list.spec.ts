import {
  blurActive,
  expect,
  goToFolder,
  layoutOf,
  listEmptyState,
  signInDemo,
  test,
  threadRow,
  threadRows,
  toasts,
  waitForList,
} from './fixtures';
import type { Page } from '@playwright/test';

test.describe('E-Mail-Liste', () => {
  test.beforeEach(async ({ page }) => {
    await signInDemo(page);
  });

  test('Posteingang zeigt Zeilen', async ({ page }) => {
    await expect(threadRows(page).first()).toBeVisible();
    expect(await threadRows(page).count()).toBeGreaterThan(5);
    await expect(threadRow(page, 'Dringende Anfrage: Wohnungsreinigung in Sachsenhausen')).toBeVisible();
  });

  for (const folder of ['Gesendet', 'Entwürfe', 'Archiv', 'Spam', 'Papierkorb', 'Markiert']) {
    test(`Ordner „${folder}“ zeigt Zeilen oder einen leeren Zustand, nie einen Fehler`, async ({ page }) => {
      await goToFolder(page, folder);
      await expect(threadRows(page).first().or(listEmptyState(page))).toBeVisible();
      await expect(page.locator('#mail-list [role="alert"]')).toHaveCount(0);
      await expect(page.getByText('E-Mails konnten nicht geladen werden')).toHaveCount(0);
    });
  }

  test('Stern umschalten bleibt nach dem Neuladen erhalten', async ({ page }) => {
    const subject = 'Anfrage Büroreinigung Westend';
    const row = threadRow(page, subject);
    await row.getByRole('button', { name: 'Markieren', exact: true }).click();

    const starred = threadRow(page, subject).getByRole('button', { name: 'Markierung entfernen', exact: true });
    await expect(starred).toHaveAttribute('aria-pressed', 'true');

    // The write is async; reload until the persisted state shows up (it must).
    await expect(async () => {
      await page.reload();
      await expect(
        threadRow(page, subject).getByRole('button', { name: 'Markierung entfernen', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 });
    }).toPass({ timeout: 15_000 });

    await goToFolder(page, 'Markiert');
    await expect(threadRow(page, subject)).toBeVisible();
  });

  test('Archivieren zeigt einen Toast mit Rückgängig, Rückgängig holt die Unterhaltung zurück', async ({ page }) => {
    const subject = 'Bewerbung als Reinigungskraft';
    await threadRow(page, subject).getByRole('checkbox').check();

    const bulk = page.getByRole('toolbar', { name: 'Aktionen für Auswahl' });
    await expect(bulk).toBeVisible();
    await bulk.getByRole('button', { name: 'Archivieren', exact: true }).click();

    await expect(threadRows(page).filter({ hasText: subject })).toHaveCount(0);
    const toast = toasts(page);
    await expect(toast.getByText('1 Unterhaltung archiviert')).toBeVisible();
    await toast.getByRole('button', { name: 'Rückgängig' }).click();

    await expect(threadRow(page, subject)).toBeVisible();
    await expect(toast.getByText('Rückgängig gemacht')).toBeVisible();

    // And it really stays in the inbox.
    await page.reload();
    await expect(threadRow(page, subject)).toBeVisible();
  });

  test('zwei Zeilen auswählen → gesammelt als gelesen markieren', async ({ page }) => {
    const a = 'Dringende Anfrage: Wohnungsreinigung in Sachsenhausen';
    const b = 'Anfrage Büroreinigung Westend';
    await expect(threadRow(page, a)).toContainText('Ungelesen');
    await expect(threadRow(page, b)).toContainText('Ungelesen');

    await threadRow(page, a).getByRole('checkbox').check();
    await threadRow(page, b).getByRole('checkbox').check();

    const bulk = page.getByRole('toolbar', { name: 'Aktionen für Auswahl' });
    await expect(bulk.getByText('2 ausgewählt')).toBeAttached();
    await bulk.getByRole('button', { name: 'Als gelesen markieren', exact: true }).click();

    await expect(toasts(page).getByText('Als gelesen markiert')).toBeVisible();
    await expect(threadRow(page, a)).not.toContainText('Ungelesen');
    await expect(threadRow(page, b)).not.toContainText('Ungelesen');
  });

  test('Suche has:attachment zeigt nur Zeilen mit Anhang und einen Filter-Chip', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'E-Mails durchsuchen' });
    await search.fill('has:attachment');
    await search.press('Enter');

    await expect(page).toHaveURL(/[?&]q=has(%3A|:)attachment/);
    await expect(page.getByRole('list', { name: 'Aktive Suchfilter' }).getByText('Mit Anhang')).toBeVisible();
    await waitForList(page);

    const rows = threadRows(page);
    await expect(rows.first()).toBeVisible();
    await expect
      .poll(async () => {
        const total = await rows.count();
        const withClip = await rows.filter({ has: page.getByRole('img', { name: 'Mit Anhang' }) }).count();
        return total > 0 && total === withClip;
      })
      .toBe(true);
    await expect(threadRow(page, 'Anfrage Büroreinigung Westend')).toBeVisible();
    await expect(threadRows(page).filter({ hasText: 'Dringende Anfrage' })).toHaveCount(0);
  });

  test('Suche nach Unsinn zeigt den leeren Zustand', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'E-Mails durchsuchen' });
    await search.fill('xqzvplorkwunsinn');
    await search.press('Enter');

    await expect(page).toHaveURL(/[?&]q=xqzvplorkwunsinn/);
    await expect(listEmptyState(page)).toHaveText('Keine Treffer');
    await expect(threadRows(page)).toHaveCount(0);
  });

  test('Tastatur j, j, Enter öffnet die zweite Unterhaltung', async ({ page }) => {
    test.skip(layoutOf(page) !== 'desktop', 'Tastaturkürzel nur auf dem Desktop');

    await expect(threadRows(page).nth(1)).toBeVisible();
    const secondId = await threadRows(page).nth(1).getAttribute('data-thread-id');
    expect(secondId).toBeTruthy();

    await blurActive(page);
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`[?&]t=${secondId}(&|$)`));
    await expect(threadRows(page).nth(1).locator('a[data-thread-link]')).toHaveAttribute('aria-current', 'true');
  });

  test.describe('Auswahlmenü (Kopfzeile der Liste)', () => {
    async function rowStates(page: Page) {
      const rows = threadRows(page);
      const n = await rows.count();
      const out: { checked: boolean; unread: boolean; starred: boolean }[] = [];
      for (let i = 0; i < n; i++) {
        const row = rows.nth(i);
        out.push({
          checked: await row.getByRole('checkbox').isChecked(),
          unread: ((await row.locator('a[data-thread-link]').textContent()) ?? '').includes('Ungelesen,'),
          starred: (await row.getByRole('button', { name: /^Markier/ }).first().getAttribute('aria-pressed')) === 'true',
        });
      }
      return out;
    }

    async function choose(page: Page, item: string) {
      const chevron = page.locator('#mail-list').getByRole('button', { name: 'Auswahl', exact: true });
      await chevron.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await menu.getByRole('menuitem', { name: item, exact: true }).click();
      await expect(menu).toBeHidden();
      // Focus goes back to the chevron.
      await expect(chevron).toBeFocused();
    }

    test('Ungelesen wählt genau die ungelesenen Zeilen, Keine hebt die Auswahl auf', async ({ page }) => {
      await expect(threadRows(page).first()).toBeVisible();
      const bulk = page.getByRole('toolbar', { name: 'Aktionen für Auswahl' });

      await choose(page, 'Ungelesen');
      const states = await rowStates(page);
      expect(states.some((s) => s.unread)).toBe(true);
      for (const s of states) expect(s.checked).toBe(s.unread);
      await expect(bulk).toBeVisible();

      await choose(page, 'Keine');
      for (const s of await rowStates(page)) expect(s.checked).toBe(false);
      await expect(bulk).toBeHidden();
    });

    test('Checkbox wählt alle Zeilen und ist dann angehakt', async ({ page }) => {
      await expect(threadRows(page).first()).toBeVisible();
      const all = page.locator('#mail-list').getByRole('checkbox', { name: 'Alle auswählen', exact: true });
      await all.click();
      await expect(all).toBeChecked();
      for (const s of await rowStates(page)) expect(s.checked).toBe(true);
      await expect(page.getByRole('toolbar', { name: 'Aktionen für Auswahl' })).toBeVisible();

      await all.click();
      await expect(all).not.toBeChecked();
      for (const s of await rowStates(page)) expect(s.checked).toBe(false);
    });

    test('Markiert wählt nur die markierten Zeilen', async ({ page }) => {
      await expect(threadRows(page).first()).toBeVisible();
      // Make sure at least one row is starred.
      const first = threadRows(page).first();
      const star = first.getByRole('button', { name: 'Markieren', exact: true });
      if (await star.count()) {
        await star.click();
        await expect(first.getByRole('button', { name: 'Markierung entfernen', exact: true })).toHaveAttribute('aria-pressed', 'true');
      }

      await choose(page, 'Markiert');
      const states = await rowStates(page);
      expect(states.some((s) => s.starred)).toBe(true);
      for (const s of states) expect(s.checked).toBe(s.starred);
    });
  });

  test('? öffnet die Tastenkürzel-Hilfe', async ({ page }) => {
    await blurActive(page);
    await page.keyboard.press('?');

    const help = page.getByRole('dialog', { name: 'Tastenkürzel' });
    await expect(help).toBeVisible();
    await expect(help.getByText('Nächste Unterhaltung')).toBeVisible();

    await help.getByRole('button', { name: 'Schließen' }).click();
    await expect(help).toBeHidden();
  });
});

test.describe('Auswahl-Menü (wie Gmail)', () => {
  test.beforeEach(async ({ page }) => {
    await signInDemo(page);
  });

  /** Per visible row: is it checked, unread, starred. */
  async function rowStates(page: Page) {
    const rows = threadRows(page);
    const n = await rows.count();
    const out: { checked: boolean; unread: boolean; starred: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      out.push({
        checked: await row.getByRole('checkbox').first().isChecked(),
        unread: ((await row.textContent()) ?? '').includes('Ungelesen,'),
        starred: (await row.getByRole('button', { name: 'Markierung entfernen', exact: true }).count()) > 0,
      });
    }
    return out;
  }

  async function pick(page: Page, item: string) {
    await page.getByRole('button', { name: /^Auswahl/ }).first().click();
    await page.getByRole('menuitem', { name: item, exact: true }).click();
  }

  test('Menü zeigt Alle, Keine, Gelesen, Ungelesen, Markiert, Nicht markiert', async ({ page }) => {
    await page.getByRole('button', { name: /^Auswahl/ }).first().click();
    for (const item of ['Alle', 'Keine', 'Gelesen', 'Ungelesen', 'Markiert', 'Nicht markiert']) {
      await expect(page.getByRole('menuitem', { name: item, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('Ungelesen wählt genau die ungelesenen Zeilen, Keine hebt die Auswahl auf', async ({ page }) => {
    await waitForList(page);
    await pick(page, 'Ungelesen');
    const states = await rowStates(page);
    expect(states.some((s) => s.unread)).toBe(true);
    for (const s of states) expect(s.checked).toBe(s.unread);
    await expect(page.getByRole('toolbar', { name: 'Aktionen für Auswahl' })).toBeVisible();

    await pick(page, 'Keine');
    for (const s of await rowStates(page)) expect(s.checked).toBe(false);
  });

  test('Markiert und Nicht markiert wählen nach Stern', async ({ page }) => {
    await waitForList(page);
    await pick(page, 'Markiert');
    let states = await rowStates(page);
    expect(states.some((s) => s.starred)).toBe(true);
    for (const s of states) expect(s.checked).toBe(s.starred);

    await pick(page, 'Nicht markiert');
    states = await rowStates(page);
    for (const s of states) expect(s.checked).toBe(!s.starred);
  });

  test('Gelesen wählt genau die gelesenen Zeilen', async ({ page }) => {
    await waitForList(page);
    await pick(page, 'Gelesen');
    for (const s of await rowStates(page)) expect(s.checked).toBe(!s.unread);
  });

  test('Kontrollkästchen wählt alle; teilweise Auswahl ist unbestimmt', async ({ page }) => {
    await waitForList(page);
    const all = page.getByRole('checkbox', { name: 'Alle auswählen' });
    await all.check();
    for (const s of await rowStates(page)) expect(s.checked).toBe(true);
    await expect(all).toBeChecked();

    await all.uncheck();
    await threadRows(page).first().getByRole('checkbox').first().check();
    expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
  });
});
