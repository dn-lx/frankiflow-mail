import { expect, goToFolder, openThread, projectIs, signInDemo, test, threadRow, titleUnread } from './fixtures';

const FRAME = 'iframe[title="E-Mail-Inhalt"]';

test.describe('Lesebereich', () => {
  test.beforeEach(async ({ page }) => {
    await signInDemo(page);
  });

  test('lange Unterhaltung „Großprojekt“: ältere Nachrichten sind zugeklappt und klappen per Klick auf', async ({ page }) => {
    await openThread(page, /Großprojekt: Reinigung Büroetage Taunusanlage/);

    await expect(page.getByText('8 Nachrichten', { exact: true })).toBeVisible();
    const collapsed = page.getByRole('button', { name: /— Nachricht aufklappen$/ });
    const expanded = page.getByRole('button', { name: /— Nachricht zuklappen$/ });
    await expect(collapsed).toHaveCount(7);
    await expect(expanded).toHaveCount(1);

    await collapsed.first().click();
    await expect(collapsed).toHaveCount(6);
    await expect(expanded).toHaveCount(2);
    await expect(expanded.first()).toHaveAttribute('aria-expanded', 'true');

    // And it folds back (keyboard on the header; a mouse click might land on the recipient toggle).
    await expanded.first().press('Enter');
    await expect(collapsed).toHaveCount(7);
  });

  test('Öffnen markiert als gelesen (Ungelesen-Zahl sinkt)', async ({ page }) => {
    // The seeded "Großprojekt" thread is already fully read, so use an unread one.
    const subject = 'Dringende Anfrage: Wohnungsreinigung in Sachsenhausen';
    await expect(page).toHaveTitle(/^\(\d+\)/);
    await expect(threadRow(page, subject)).toContainText('Ungelesen');
    const before = await titleUnread(page);
    expect(before).toBeGreaterThan(0);

    await openThread(page, subject);

    await expect.poll(() => titleUnread(page)).toBe(before - 1);
    await expect(threadRow(page, subject)).not.toContainText('Ungelesen');
  });

  test('Newsletter: externe Bilder blockiert, „Bilder anzeigen“ lädt sie (Anfrage wird versucht und abgebrochen)', async ({
    page,
    guard,
  }) => {
    // This test provokes the remote image requests on purpose; the fixture still aborts them.
    guard.allow(/^https?:\/\/(images|track)\.example\.com\//);

    await openThread(page, 'Herbst-Aktion: Öko-Reinigungskonzentrate & Mikrofaser-Sets');

    const privacy = page.getByRole('region', { name: 'Externe Bilder blockiert, um Ihre Privatsphäre zu schützen' });
    await expect(privacy).toBeVisible();
    await expect(page.locator(FRAME)).toBeVisible();
    expect(guard.blocked.filter((u) => u.includes('images.example.com'))).toEqual([]);

    const imageRequest = page.waitForRequest(/^https:\/\/images\.example\.com\//);
    await privacy.getByRole('button', { name: 'Bilder anzeigen' }).click();
    const req = await imageRequest;

    expect(req.url()).toContain('images.example.com/cleanpro-hero.jpg');
    await expect.poll(() => guard.blocked.some((u) => u.startsWith('https://images.example.com/'))).toBe(true);
    await expect(privacy).toBeHidden();
  });

  test('HTML-iframe ist gesandboxt ohne allow-scripts und ohne allow-same-origin', async ({ page }) => {
    await openThread(page, 'Herbst-Aktion: Öko-Reinigungskonzentrate & Mikrofaser-Sets');

    const frame = page.locator(FRAME);
    await expect(frame).toBeVisible();
    const sandbox = await frame.getAttribute('sandbox');
    expect(sandbox).not.toBeNull();
    const tokens = (sandbox ?? '').split(/\s+/).filter(Boolean);
    expect(tokens).not.toContain('allow-scripts');
    expect(tokens).not.toContain('allow-same-origin');

    // Every email iframe on the page follows the same rule.
    for (const f of await page.locator('iframe').all()) {
      const s = (await f.getAttribute('sandbox')) ?? 'MISSING';
      expect(s).not.toBe('MISSING');
      expect(s).not.toMatch(/allow-scripts|allow-same-origin/);
    }
  });

  test('Spam-Phishing-Mail wird angezeigt, ohne etwas auszuführen', async ({ page, context, guard }) => {
    await goToFolder(page, 'Spam');
    await openThread(page, 'DRINGEND: Ihr Geschäftskonto wird in 24 Stunden gesperrt!');

    const frame = page.locator(FRAME);
    await expect(frame).toBeVisible();
    const sandbox = (await frame.getAttribute('sandbox')) ?? '';
    expect(sandbox).not.toMatch(/allow-scripts|allow-same-origin/);

    await expect(page.frameLocator(FRAME).getByText(/Zugangsdaten/)).toBeVisible();
    // No script ran inside the frame: it has no <script> and no inline handlers survived sanitising.
    await expect(page.frameLocator(FRAME).locator('script, [onload], [onerror], [onclick]')).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(guard.dialogs).toEqual([]);
    expect(context.pages()).toHaveLength(1);
    expect(guard.blocked).toEqual([]);
  });

  test('PDF-Anhang hat einen Download', async ({ page }, testInfo) => {
    await openThread(page, 'Anfrage Büroreinigung Westend');

    await expect(page.getByRole('region', { name: /^\d+ Anhänge?$/ }).first()).toBeVisible();
    await expect(page.getByText('Grundriss-Buero-Westend.pdf', { exact: true })).toBeVisible();

    const download = page.getByRole('button', { name: 'Herunterladen: Grundriss-Buero-Westend.pdf' });
    await expect(download).toBeVisible();
    await expect(page.getByRole('button', { name: 'PDF öffnen' })).toBeVisible();

    if (!projectIs(testInfo, 'webkit-iphone')) {
      const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
      expect(file.suggestedFilename()).toBe('Grundriss-Buero-Westend.pdf');
    }
  });
});
