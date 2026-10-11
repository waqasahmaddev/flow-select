import { expect } from '@playwright/test';

export async function openDemo(page) {
  await page.goto('/demo/');
  await page.waitForFunction(() => window.FlowSelect && document.querySelectorAll('.fs').length >= 34);
}

export async function mount(page, html, options = {}) {
  await page.goto('/tests/fixtures/blank.html');
  await page.waitForFunction(() => window.fixtureReady === true);
  await page.evaluate(({ html, options }) => {
    const app = document.getElementById('app');
    app.innerHTML = html;
    window.FlowSelect.init(app, options);
  }, { html, options });
}

export function root(page, id) {
  return page.locator(`.fs:has(> select#${id})`);
}

export function control(page, id) {
  return root(page, id).locator('.fs-control');
}

export function trigger(page, id) {
  return root(page, id).locator('.fs-trigger, .fs-control .fs-input').first();
}

export function popover(page, id) {
  return root(page, id).locator('.fs-popover');
}

export function options(page, id) {
  return popover(page, id).locator('.fs-option');
}

export async function nativeValue(page, id) {
  return page.evaluate((id) => {
    const select = document.getElementById(id);
    return select.multiple ? Array.from(select.selectedOptions, (option) => option.value) : select.value;
  }, id);
}

export async function expectOpen(page, id, open = true) {
  if (open) {
    await expect(popover(page, id)).toBeVisible();
  } else {
    await expect(popover(page, id)).toBeHidden();
  }
}
