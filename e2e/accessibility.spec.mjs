import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { blockExternalNetwork } from './helpers.mjs';

test('mail shell has no critical automated accessibility violations', async ({ page }) => {
  await blockExternalNetwork(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations.filter(({ impact }) => impact === 'critical');
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
