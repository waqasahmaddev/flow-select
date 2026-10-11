import { test, expect } from '@playwright/test';

async function measureShift(page, url) {
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__shifts.push({ value: entry.value, sources: entry.sources.map((source) => source.node?.className || source.node?.nodeName || '?') });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  return page.evaluate(() => window.__shifts);
}

test('the demo page loads without layout shift', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium reports layout-shift entries');
  const shifts = await measureShift(page, '/demo/');
  const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
  expect(shifts, JSON.stringify(shifts, null, 2)).toEqual([]);
  expect(total).toBe(0);
});

test('the dark demo page loads without layout shift', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium reports layout-shift entries');
  const shifts = await measureShift(page, '/demo/?theme=dark');
  expect(shifts, JSON.stringify(shifts, null, 2)).toEqual([]);
});
