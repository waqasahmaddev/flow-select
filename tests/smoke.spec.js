import { test, expect } from '@playwright/test';
import { openDemo, mount, trigger, options, nativeValue, expectOpen } from './helpers.js';

test('demo enhances every select without console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await openDemo(page);
  expect(await page.locator('.fs').count()).toBeGreaterThanOrEqual(30);
  expect(errors).toEqual([]);
});

test('click to open, click an option to select, native value follows', async ({ page }) => {
  await mount(page, `
    <label for="fruit">Fruit</label>
    <select id="fruit" name="fruit" data-flow-select>
      <option value="apple">Apple</option>
      <option value="banana">Banana</option>
    </select>`);
  await trigger(page, 'fruit').click();
  await expectOpen(page, 'fruit');
  await options(page, 'fruit').filter({ hasText: 'Banana' }).click();
  await expectOpen(page, 'fruit', false);
  expect(await nativeValue(page, 'fruit')).toBe('banana');
  await expect(trigger(page, 'fruit')).toBeFocused();
});
