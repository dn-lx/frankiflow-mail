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

  test.describe('Filtermenü (Kopfzeile der Liste)', () => {
    async function choose(page: Page, item: string) {
      const chevron = page.locator('#mail-list').getByRole('button', { name: 'Filter', exact: true });
      await chevron.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await menu.getByRole('menuitemradio', { name: item, exact: true }).click();
      await expect(menu).toBeHidden();
      await expect(chevron).toBeFocused();
      await waitForList(page);
    }

    test('Menü zeigt Alle, Ungelesen, Gelesen, Markiert, Nicht markiert (ohne Keine)', async ({ page }) => {
      const chevron = page.locator('#mail-list').getByRole('button', { name: 'Filter', exact: true });
      await chevron.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      for (const item of ['Alle', 'Ungelesen', 'Gelesen', 'Markiert', 'Nicht markiert']) {
        await expect(menu.getByRole('menuitemradio', { name: item, exact: true })).toBeVisible();
      }
      await expect(menu.getByRole('menuitemradio', { name: 'Alle', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(menu.getByText('Keine', { exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    });

    test('Ungelesen filtert die Liste, setzt r=unread in der URL und bleibt nach Reload aktiv', async ({ page }) => {
      await waitForList(page);
      const initialCount = await threadRows(page).count();
      expect(initialCount).toBeGreaterThan(0);

      await choose(page, 'Ungelesen');
      await expect(page).toHaveURL(/[?&]r=unread(&|$)/);
      await expect(page.locator('#mail-list-title')).toHaveText('Posteingang · Ungelesen');

      const rows = threadRows(page);
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i)).toContainText('Ungelesen,');
      }

      await page.reload();
      await waitForList(page);
      await expect(page).toHaveURL(/[?&]r=unread(&|$)/);
      await expect(page.locator('#mail-list-title')).toHaveText('Posteingang · Ungelesen');
      const reloadedCount = await threadRows(page).count();
      expect(reloadedCount).toBe(count);
      for (let i = 0; i < reloadedCount; i++) {
        await expect(threadRows(page).nth(i)).toContainText('Ungelesen,');
      }
    });

    test('Markiert, Nicht markiert und Alle filtern und setzen die Liste zurück', async ({ page }) => {
      await waitForList(page);
      const originalCount = await threadRows(page).count();
      expect(originalCount).toBeGreaterThan(0);

      await choose(page, 'Markiert');
      await expect(page).toHaveURL(/[?&]r=starred(&|$)/);
      const starredRows = threadRows(page);
      const starredCount = await starredRows.count();
      expect(starredCount).toBeGreaterThan(0);
      for (let i = 0; i < starredCount; i++) {
        await expect(starredRows.nth(i).getByRole('button', { name: 'Markierung entfernen', exact: true })).toHaveCount(1);
      }

      await choose(page, 'Nicht markiert');
      await expect(page).toHaveURL(/[?&]r=unstarred(&|$)/);
      const unstarredRows = threadRows(page);
      const unstarredCount = await unstarredRows.count();
      expect(unstarredCount).toBeGreaterThan(0);
      for (let i = 0; i < unstarredCount; i++) {
        await expect(unstarredRows.nth(i).getByRole('button', { name: 'Markierung entfernen', exact: true })).toHaveCount(0);
      }

      await choose(page, 'Alle');
      await expect(page).not.toHaveURL(/[?&]r=/);
      await expect(page.locator('#mail-list-title')).toHaveText('Posteingang');
      await expect(threadRows(page)).toHaveCount(originalCount);
    });

    test('Checkbox wählt alle sichtbaren Zeilen auch in einer gefilterten Liste', async ({ page }) => {
      await waitForList(page);
      await choose(page, 'Ungelesen');

      const rows = threadRows(page);
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);

      const all = page.locator('#mail-list').getByRole('checkbox', { name: 'Alle auswählen', exact: true });
      await all.check();
      await expect(all).toBeChecked();
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i).getByRole('checkbox').first()).toBeChecked();
      }
      await expect(page.getByRole('toolbar', { name: 'Aktionen für Auswahl' })).toBeVisible();

      await all.uncheck();
      await expect(all).not.toBeChecked();
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i).getByRole('checkbox').first()).not.toBeChecked();
      }
      if (count > 1) {
        await rows.first().getByRole('checkbox').first().check();
        expect(await all.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
      }
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
