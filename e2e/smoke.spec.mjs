import { test, expect } from '@playwright/test';
import { blockExternalNetwork } from './helpers.mjs';

test.beforeEach(async ({ page }) => blockExternalNetwork(page));

test('mail application shell renders without contacting production services', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/FrankiFlow Mail/);
  await expect(page.locator('#app')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
