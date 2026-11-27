import { expect, signInDemo, test, threadRow, threadRows, toasts, waitForList } from './fixtures';
import type { Page } from '@playwright/test';

const TEST_USER = {
  name: 'E2E Teamnutzer',
  email: 'e2e-team@frankiflow.de',
  password: 'teamtest123',
};

/** A thread that exists only in info@frankiflow.de and one only in team@frankiflow.de (seed data). */
const INFO_ONLY = 'Dringende Anfrage: Wohnungsreinigung in Sachsenhausen';
const TEAM_ONLY = 'Airbnb turnover cleaning in Nordend';

async function openDemoAdmin(page: Page): Promise<void> {
  await page.goto('/demo-admin/?demo=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Demo-Testbenutzer' })).toBeVisible();
}

function userRow(page: Page, email: string) {
  return page.getByRole('region', { name: 'Vorhandene Demo-Benutzer' }).getByRole('listitem').filter({ hasText: email });
}

async function createTeamOnlyUser(page: Page): Promise<void> {
  const form = page.getByRole('region', { name: 'Neuen Testbenutzer anlegen' });
  await form.getByLabel('Anzeigename').fill(TEST_USER.name);
  await form.getByLabel('E-Mail-Adresse').fill(TEST_USER.email);
  await form.getByLabel('Passwort (mind. 8 Zeichen)').fill(TEST_USER.password);
  await form.getByRole('checkbox', { name: 'info@frankiflow.de', exact: true }).uncheck();
  await form.getByRole('checkbox', { name: 'team@frankiflow.de', exact: true }).check();
  await form.getByRole('checkbox', { name: /^Neues persönliches Postfach/ }).uncheck();
  await form.getByRole('button', { name: 'Testbenutzer erstellen' }).click();

  await expect(toasts(page).getByText(`Testbenutzer ${TEST_USER.email} wurde erstellt.`)).toBeVisible();
  const row = userRow(page, TEST_USER.email);
  await expect(row).toBeVisible();
  await expect(row.getByText('team@frankiflow.de', { exact: true })).toBeVisible();
  await expect(row.getByText('info@frankiflow.de', { exact: true })).toHaveCount(0);
}

test.describe('Demo-Testbenutzer', () => {
  test('Testbenutzer nur mit team@ sieht keine Unterhaltungen von info@', async ({ page }) => {
    await openDemoAdmin(page);
    await createTeamOnlyUser(page);

    await userRow(page, TEST_USER.email).getByRole('button', { name: 'Anmelden als' }).click();
    await page.waitForURL(/\/mail\//);
    await waitForList(page);

    await expect(threadRow(page, TEAM_ONLY)).toBeVisible();
    await expect(threadRows(page).filter({ hasText: INFO_ONLY })).toHaveCount(0);

    // Not reachable via "all mail" or search either.
    await page.goto('/mail/?f=all');
    await waitForList(page);
    await expect(threadRows(page).filter({ hasText: INFO_ONLY })).toHaveCount(0);

    await page.goto(`/mail/?q=${encodeURIComponent('Sachsenhausen')}`);
    await waitForList(page);
    await expect(threadRows(page).filter({ hasText: INFO_ONLY })).toHaveCount(0);

    // Only one mailbox: no switcher, the address is shown instead.
    await expect(page.locator('#mail-sidebar').getByText('team@frankiflow.de', { exact: true })).toBeAttached();
  });

  test('Demo-Daten zurücksetzen stellt den Ausgangszustand wieder her', async ({ page }) => {
    // Change something as the demo admin: archive a seeded inbox thread.
    await signInDemo(page);
    await threadRow(page, INFO_ONLY).getByRole('checkbox').check();
    await page
      .getByRole('toolbar', { name: 'Aktionen für Auswahl' })
      .getByRole('button', { name: 'Archivieren', exact: true })
      .click();
    await expect(threadRows(page).filter({ hasText: INFO_ONLY })).toHaveCount(0);
    await expect(toasts(page).getByText('1 Unterhaltung archiviert')).toBeVisible();
    await page.waitForTimeout(1_000); // let the optimistic move reach the demo store

    // And create a test user.
    await openDemoAdmin(page);
    await createTeamOnlyUser(page);

    await page.getByRole('region', { name: 'Demo-Daten zurücksetzen' }).getByRole('button', { name: 'Demo-Daten zurücksetzen' }).click();
    const confirm = page.getByRole('dialog', { name: 'Demo-Daten wirklich zurücksetzen?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Demo-Daten zurücksetzen' }).click();

    await expect(toasts(page).getByText('Demo-Daten wurden auf den Ausgangszustand zurückgesetzt.')).toBeVisible();
    await expect(userRow(page, TEST_USER.email)).toHaveCount(0);
    await expect(userRow(page, 'demo@frankiflow.de')).toBeVisible();

    // The seed is back: the archived thread is in the inbox again.
    await signInDemo(page);
    await expect(threadRow(page, INFO_ONLY)).toBeVisible();
    await expect(threadRow(page, INFO_ONLY)).toContainText('Ungelesen');
  });
});
