import {
  addRecipient,
  composerBody,
  composerSubject,
  composerWindow,
  expect,
  goToFolder,
  openComposer,
  openSidebar,
  openThread,
  signInDemo,
  test,
  threadRow,
  toasts,
  uniqueSuffix,
  waitForList,
} from './fixtures';
import type { Locator, Page } from '@playwright/test';

/** Clicks "Senden" and waits until the undo window is over and the send succeeded. */
async function sendAndWait(page: Page, composer: Locator): Promise<void> {
  await composer.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(composer).toBeHidden();
  await expect(toasts(page).getByText('Wird gesendet…')).toBeVisible();
  await expect(toasts(page).getByText('Nachricht gesendet')).toBeVisible({ timeout: 20_000 });
}

function visibleButton(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
}

test.describe('Verfassen', () => {
  test.beforeEach(async ({ page }) => {
    await signInDemo(page);
  });

  test('neue Mail an team@ senden → erscheint in Gesendet und im Team-Postfach', async ({ page }, testInfo) => {
    const subject = `E2E Teamnachricht ${uniqueSuffix(testInfo)}`;
    const composer = await openComposer(page);
    await addRecipient(composer, 'team@frankiflow.de');
    await composerSubject(composer).fill(subject);
    await composerBody(composer).fill('Hallo Team, das ist ein automatischer Test.');

    await sendAndWait(page, composer);

    await goToFolder(page, 'Gesendet');
    await expect(threadRow(page, subject)).toBeVisible();

    // The team mailbox (what a user of team@ would see), via the mailbox switcher.
    await goToFolder(page, 'Posteingang');
    const sidebar = await openSidebar(page);
    await sidebar.getByLabel('Postfach', { exact: true }).selectOption({ label: 'FrankiFlow Team · team@frankiflow.de' });
    await expect(page).toHaveURL(/[?&]m=mb-team/);
    await waitForList(page);
    await expect(threadRow(page, subject)).toBeVisible();
  });

  test('ungültiger Empfänger foo@ blockiert das Senden mit sichtbarem Fehler', async ({ page }) => {
    const composer = await openComposer(page);
    const to = composer.getByRole('combobox', { name: 'An', exact: true });
    await to.fill('foo@');
    await to.press('Enter');

    await expect(composer.getByText('„foo@“ ist keine gültige E-Mail-Adresse', { exact: false })).toBeVisible();
    await composerSubject(composer).fill('Sollte nicht rausgehen');
    await composerBody(composer).fill('Text');
    await composer.getByRole('button', { name: 'Senden', exact: true }).click();

    await expect(composer.getByRole('alert').filter({ hasText: 'Bitte ungültige Adressen korrigieren: foo@' })).toBeVisible();
    await expect(composer).toBeVisible();
    await expect(toasts(page).getByText('Wird gesendet…')).toHaveCount(0);
  });

  test('Rückgängig im Sendefenster öffnet den Composer mit unverändertem Text', async ({ page }, testInfo) => {
    const subject = `E2E Rückgängig ${uniqueSuffix(testInfo)}`;
    const body = 'Dieser Text muss nach dem Rückgängig noch da sein.';
    const composer = await openComposer(page);
    await addRecipient(composer, 'katrin.weber@example.de');
    await composerSubject(composer).fill(subject);
    await composerBody(composer).fill(body);

    await composer.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(composer).toBeHidden();
    await toasts(page).getByRole('button', { name: 'Rückgängig' }).click();

    const reopened = composerWindow(page);
    await expect(composerSubject(reopened)).toHaveValue(subject);
    await expect(composerBody(reopened)).toContainText(body);
    await expect(reopened.getByRole('button', { name: 'katrin.weber@example.de entfernen' })).toBeVisible();

    // Nothing was sent.
    await page.waitForTimeout(6_000);
    await expect(toasts(page).getByText('Nachricht gesendet')).toHaveCount(0);
  });

  test('Antworten füllt „AW:“ und den Empfänger vor; Allen antworten ohne eigene Adressen', async ({ page }) => {
    await openThread(page, 'Dringende Anfrage: Wohnungsreinigung in Sachsenhausen');

    await visibleButton(page, 'Antworten').click();
    let composer = composerWindow(page);
    await expect(composerSubject(composer)).toHaveValue('AW: Dringende Anfrage: Wohnungsreinigung in Sachsenhausen');
    await expect(composer.getByRole('button', { name: 'katrin.weber@example.de entfernen' })).toBeVisible();
    await expect(composer.getByRole('button', { name: /^info@frankiflow\.de entfernen$/ })).toHaveCount(0);

    await composer.getByRole('button', { name: 'Entwurf verwerfen' }).click();
    await page.getByRole('dialog', { name: 'Entwurf verwerfen?' }).getByRole('button', { name: 'Verwerfen' }).click();
    await expect(composer).toBeHidden();

    await visibleButton(page, 'Allen antworten').click();
    composer = composerWindow(page);
    await expect(composerSubject(composer)).toHaveValue('AW: Dringende Anfrage: Wohnungsreinigung in Sachsenhausen');
    await expect(composer.getByRole('button', { name: 'katrin.weber@example.de entfernen' })).toBeVisible();
    for (const own of ['info@frankiflow.de', 'team@frankiflow.de', 'demo@frankiflow.de']) {
      await expect(composer.getByRole('button', { name: `${own} entfernen`, exact: true })).toHaveCount(0);
    }
  });

  test('Entwurf wird automatisch gespeichert, erscheint in Entwürfe und öffnet sich mit dem Text', async ({ page }, testInfo) => {
    const subject = `E2E Entwurf ${uniqueSuffix(testInfo)}`;
    const body = 'Angefangener Entwurf, bitte nicht verlieren.';
    const composer = await openComposer(page);
    await addRecipient(composer, 'katrin.weber@example.de');
    await composerSubject(composer).fill(subject);
    await composerBody(composer).fill(body);
    await expect(composer.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible({ timeout: 10_000 });

    await composer.getByRole('button', { name: 'Schließen (Entwurf wird gespeichert)' }).click();
    await expect(composer).toBeHidden();

    await goToFolder(page, 'Entwürfe');
    const row = threadRow(page, subject);
    await expect(row).toBeVisible();
    await row.locator('a[data-thread-link]').click();

    const reopened = composerWindow(page);
    await expect(composerSubject(reopened)).toHaveValue(subject);
    await expect(composerBody(reopened)).toContainText(body);
  });

  test('Anhang-Warnung, wenn der Text „im Anhang“ erwähnt, aber nichts angehängt ist', async ({ page }) => {
    const composer = await openComposer(page);
    await addRecipient(composer, 'katrin.weber@example.de');
    await composerSubject(composer).fill('Angebot');
    await composerBody(composer).fill('Guten Tag, das Angebot finden Sie im Anhang.');
    await composer.getByRole('button', { name: 'Senden', exact: true }).click();

    const warn = page.getByRole('dialog', { name: 'Trotzdem senden?' });
    await expect(warn).toBeVisible();
    await expect(warn.getByText('Im Text wird ein Anhang erwähnt, aber es ist keine Datei angehängt.')).toBeVisible();

    await warn.getByRole('button', { name: 'Zurück zur Nachricht' }).click();
    await expect(warn).toBeHidden();
    await expect(composer).toBeVisible();
    await expect(toasts(page).getByText('Wird gesendet…')).toHaveCount(0);
  });

  test('Datei anhängen und senden', async ({ page }, testInfo) => {
    const subject = `E2E Anhang ${uniqueSuffix(testInfo)}`;
    const composer = await openComposer(page);
    await addRecipient(composer, 'team@frankiflow.de');
    await composerSubject(composer).fill(subject);
    await composerBody(composer).fill('Die Notiz ist im Anhang.');

    await composer.locator('input[type="file"]').setInputFiles({
      name: 'e2e-notiz.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Hallo aus dem E2E-Test.\n', 'utf-8'),
    });
    const list = composer.getByRole('list', { name: 'Anhänge' });
    await expect(list.getByText('e2e-notiz.txt')).toBeVisible();

    await sendAndWait(page, composer);
    await expect(page.getByRole('dialog', { name: 'Trotzdem senden?' })).toHaveCount(0);

    await goToFolder(page, 'Gesendet');
    const row = threadRow(page, subject);
    await expect(row).toBeVisible();
    await expect(row.getByRole('img', { name: 'Mit Anhang' })).toBeVisible();

    await openThread(page, subject);
    await expect(page.getByText('e2e-notiz.txt', { exact: true }).first()).toBeVisible();
  });
});
