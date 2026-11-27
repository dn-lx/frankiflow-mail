import { DEMO_EMAIL, expect, openSidebar, signInDemo, submitLogin, test, threadRows } from './fixtures';

test.describe('Anmeldung (Demo)', () => {
  test('falsches Passwort zeigt einen Fehler und bleibt auf der Anmeldung', async ({ page }) => {
    await page.goto('/login/?demo=1');
    await submitLogin(page, DEMO_EMAIL, 'falsch-falsch');

    await expect(
      page.getByRole('alert').filter({ hasText: 'E-Mail-Adresse oder Passwort ist ungültig.' }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login\//);
    await expect(page.getByRole('heading', { name: 'Bei FrankiFlow Mail anmelden' })).toBeVisible();
  });

  test('Demo-Anmeldung landet im Posteingang mit Ungelesen-Zahl im Titel', async ({ page }) => {
    await signInDemo(page);

    await expect(page).toHaveURL(/\/mail\/$/);
    await expect(page.locator('#mail-list-title')).toHaveText('Posteingang');
    await expect(threadRows(page).first()).toBeVisible();
    await expect(page).toHaveTitle(/^\(\d+\) Posteingang – FrankiFlow Mail$/);
  });

  test('Abmelden führt zurück zur Anmeldung', async ({ page }) => {
    await signInDemo(page);

    const sidebar = await openSidebar(page);
    await sidebar.getByRole('button', { name: 'Abmelden' }).click();

    await page.waitForURL(/\/login\//);
    await expect(page.getByRole('heading', { name: 'Bei FrankiFlow Mail anmelden' })).toBeVisible();

    // The session is really gone: /mail/ sends us back.
    await page.goto('/mail/');
    await page.waitForURL(/\/login\//);
  });

  test('/mail/ ohne Sitzung leitet auf /login/ um', async ({ page }) => {
    // Opening the login page once with ?demo=1 stores demo mode (never the live backend).
    await page.goto('/login/?demo=1');
    await expect(page.getByRole('heading', { name: 'Bei FrankiFlow Mail anmelden' })).toBeVisible();

    await page.goto('/mail/');
    await page.waitForURL(/\/login\/$/);
    await expect(page.getByRole('heading', { name: 'Bei FrankiFlow Mail anmelden' })).toBeVisible();
  });

  test('Sprachwechsel DE → EN ändert die Überschrift', async ({ page }) => {
    await page.goto('/login/?demo=1');
    await expect(page.getByRole('heading', { name: 'Bei FrankiFlow Mail anmelden' })).toBeVisible();

    const langGroup = page.getByRole('group', { name: 'Sprache' });
    await langGroup.getByRole('button', { name: 'EN', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Sign in to FrankiFlow Mail' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'EN', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
