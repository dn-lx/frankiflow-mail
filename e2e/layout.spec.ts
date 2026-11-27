import {
  expect,
  layoutOf,
  openComposer,
  openThread,
  signInDemo,
  test,
  threadRows,
} from './fixtures';
import type { Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(m.scrollWidth, `${where}: documentElement.scrollWidth ≤ innerWidth`).toBeLessThanOrEqual(m.innerWidth);
  expect(m.bodyScrollWidth, `${where}: body.scrollWidth ≤ innerWidth`).toBeLessThanOrEqual(m.innerWidth);
}

const FIRST_SUBJECT = 'Anfrage Büroreinigung Westend';

test.describe('Layout', () => {
  test('kein horizontaler Überlauf: Anmeldung, Posteingang, Unterhaltung, Composer, Einstellungen', async ({ page }) => {
    await page.goto('/login/?demo=1');
    await expect(page.getByRole('heading', { name: 'Bei FrankiFlow Mail anmelden' })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'login');

    await signInDemo(page);
    await expect(threadRows(page).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, 'inbox');

    await openThread(page, FIRST_SUBJECT);
    await expectNoHorizontalOverflow(page, 'thread');

    await page.goto('/mail/');
    await expect(threadRows(page).first()).toBeVisible();
    await openComposer(page);
    await expectNoHorizontalOverflow(page, 'composer');

    await page.goto('/settings/');
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'settings');
  });

  test('iPhone: untere Navigation sichtbar, Zurück führt von der Unterhaltung zur Liste', async ({ page }) => {
    test.skip(layoutOf(page) !== 'phone', 'nur auf dem Telefon');

    await signInDemo(page);
    const bottomNav = page.getByRole('navigation', { name: 'Schnellzugriff' });
    await expect(bottomNav).toBeVisible();
    for (const name of ['Posteingang', 'Suche', 'Schreiben', 'Ordner']) {
      await expect(bottomNav.getByRole(name === 'Posteingang' ? 'link' : 'button', { name: new RegExp(`^${name}`) })).toBeVisible();
    }

    await openThread(page, FIRST_SUBJECT);
    await expect(bottomNav).toBeHidden();

    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page).not.toHaveURL(/[?&]t=/);
    await expect(threadRows(page).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: FIRST_SUBJECT })).toBeHidden();
    await expect(bottomNav).toBeVisible();
  });

  test('alle Bedienelemente im Posteingang haben einen zugänglichen Namen', async ({ page }) => {
    await signInDemo(page);
    await expect(threadRows(page).first()).toBeVisible();

    for (const role of ['button', 'link', 'checkbox', 'searchbox', 'combobox', 'textbox', 'menuitem'] as const) {
      const all = page.getByRole(role);
      const unnamed = page.getByRole(role, { name: /^\s*$/ });
      const count = await unnamed.count();
      const details: string[] = [];
      for (let i = 0; i < count; i++) {
        details.push(await unnamed.nth(i).evaluate((el) => el.outerHTML.slice(0, 160)));
      }
      expect(details, `${role}s without accessible name (of ${await all.count()})`).toEqual([]);
    }
    expect(await page.getByRole('button').count()).toBeGreaterThan(5);
  });

  test('Fokus ist nach Tab sichtbar (:focus-visible)', async ({ page }) => {
    await signInDemo(page);
    await expect(threadRows(page).first()).toBeVisible();
    await page.evaluate(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    });

    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => document.querySelector(':focus-visible') !== null))
      .toBe(true);
    // The focused element is the one matching :focus-visible, and it is on screen.
    const sameElement = await page.evaluate(() => document.activeElement === document.querySelector(':focus-visible'));
    expect(sameElement).toBe(true);
    await expect(page.locator(':focus-visible')).toBeVisible();
  });
});
