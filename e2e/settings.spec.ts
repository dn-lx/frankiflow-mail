import {
  DEMO_EMAIL,
  composerBody,
  composerSubject,
  expect,
  openComposer,
  signInDemo,
  submitLogin,
  test,
  toasts,
  uniqueSuffix,
} from './fixtures';
import type { Page } from '@playwright/test';

async function openSettings(page: Page): Promise<void> {
  await page.goto('/settings/');
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
}

test.describe('Einstellungen', () => {
  test.beforeEach(async ({ page }) => {
    await signInDemo(page);
    await openSettings(page);
  });

  test('Farbschema Dunkel setzt html[data-theme="dark"] und bleibt nach dem Neuladen', async ({ page }) => {
    await page.getByLabel('Farbschema').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toasts(page).getByText('Einstellungen gespeichert.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByLabel('Farbschema')).toHaveValue('dark');

    await page.goto('/mail/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Anzeigedichte Kompakt', async ({ page }) => {
    await page.getByLabel('Anzeigedichte').selectOption('compact');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    await expect(page.getByLabel('Anzeigedichte')).toHaveValue('compact');
  });

  test('Sprache EN ändert die Oberfläche', async ({ page }) => {
    await page.getByLabel('Sprache', { exact: true }).selectOption('en');

    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to mailbox/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goto('/mail/');
    await expect(page.locator('#mail-list-title')).toHaveText('Inbox');
    await expect(page.getByRole('searchbox', { name: 'Search mail' })).toBeVisible();
  });

  test('Vorlage anlegen und im Composer verwenden', async ({ page }, testInfo) => {
    const name = `E2E Vorlage ${uniqueSuffix(testInfo)}`;
    const subject = 'Betreff aus der Vorlage';
    const text = 'Vielen Dank für Ihre Nachricht, wir melden uns zeitnah.';

    const templates = page.getByRole('region', { name: 'Vorlagen' });
    await templates.getByRole('button', { name: 'Neue Vorlage' }).click();
    await templates.getByLabel('Vorlagenname').fill(name);
    await templates.getByLabel('Betreff').fill(subject);
    const editor = templates.getByRole('textbox', { name: 'Nachrichtentext' });
    await editor.click();
    await page.keyboard.type(text);
    await templates.getByRole('button', { name: 'Vorlage speichern' }).click();

    await expect(toasts(page).getByText(`Vorlage „${name}“ wurde gespeichert.`)).toBeVisible();
    await expect(templates.getByText(name, { exact: true })).toBeVisible();

    await page.goto('/mail/');
    await expect(page.locator('#mail-list')).toBeVisible();
    const composer = await openComposer(page);
    await composer.getByRole('button', { name: 'Vorlage einfügen' }).click();
    await page.getByRole('menuitem', { name }).click();

    await expect(composerBody(composer)).toContainText(text);
    await expect(composerSubject(composer)).toHaveValue(subject);
  });

  test('Demo-Passwort ändern und mit dem neuen anmelden', async ({ page }) => {
    const newPassword = 'NeuesDemo!2026';

    await page.getByLabel('Neues Passwort', { exact: true }).fill(newPassword);
    await page.getByLabel('Neues Passwort wiederholen').fill(newPassword);
    await page.getByRole('button', { name: 'Passwort aktualisieren' }).click();
    await expect(toasts(page).getByText('Dein Passwort wurde erfolgreich geändert.')).toBeVisible();

    await page.getByRole('region', { name: 'Konto' }).getByRole('button', { name: 'Abmelden' }).click();
    await page.waitForURL(/\/login\//);

    // The old password no longer works …
    await submitLogin(page, DEMO_EMAIL, 'demo1234');
    await expect(
      page.getByRole('alert').filter({ hasText: 'E-Mail-Adresse oder Passwort ist ungültig.' }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login\//);

    // … the new one does.
    await signInDemo(page, DEMO_EMAIL, newPassword);
  });
});
