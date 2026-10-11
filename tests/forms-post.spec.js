import { test, expect } from '@playwright/test';

const PAGE = '/tests/fixtures/forms-post.html';

async function ready(page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => window.FlowSelect && document.querySelectorAll('.fs').length === 6);
}

function control(page, id) {
  return page.locator(`.fs:has(> select#${id}) .fs-control`);
}

function option(page, id, text) {
  return page.locator(`.fs:has(> select#${id}) .fs-option`).filter({ hasText: text });
}

async function choose(page, id, text) {
  await control(page, id).click();
  await option(page, id, text).click();
}

async function submitAndReadBody(page) {
  const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/echo') && request.method() === 'POST');
  await page.click('#submit');
  const request = await requestPromise;
  return new URLSearchParams(request.postData() ?? '');
}

test('a real form POST sends the same fields a native select would', async ({ page }) => {
  await ready(page);
  await choose(page, 'plan', 'Team');
  await choose(page, 'tags', 'CSS');
  await option(page, 'tags', 'JavaScript').click();
  await page.keyboard.press('Escape');
  await control(page, 'person').click();
  await option(page, 'person', 'Maya Patel').first().click();
  await choose(page, 'outside', 'Option B');

  const body = await submitAndReadBody(page);
  expect(body.get('plan')).toBe('team');
  expect(body.get('category')).toBe('');
  expect(body.getAll('tags[]')).toEqual(['css', 'js']);
  expect(body.get('person')).toBe('p1');
  expect(body.get('outside')).toBe('b');
  expect(body.has('locked')).toBe(false);
  await expect(page.getByTestId('echo')).toContainText('tags[]: css, js');
});

test('a multiple select with nothing chosen posts no field, like a native select', async ({ page }) => {
  await ready(page);
  const body = await submitAndReadBody(page);
  expect(body.has('tags[]')).toBe(false);
  expect(body.get('plan')).toBe('free');
});

test('coming back with the Back button shows the values the browser restored', async ({ page }) => {
  await ready(page);
  await choose(page, 'plan', 'Business');
  await choose(page, 'category', 'Science');
  await page.click('#away');
  await page.waitForURL('**/blank.html');
  await page.goBack();
  await page.waitForFunction(() => window.FlowSelect && document.querySelectorAll('.fs').length === 6);
  const state = await page.evaluate(() => ['plan', 'category'].map((id) => ({
    native: document.getElementById(id).value,
    shown: document.querySelector(`.fs:has(> #${id}) .fs-value`).textContent
  })));
  for (const { native, shown } of state) {
    const label = { free: 'Free', team: 'Team', business: 'Business', '': 'Choose a category', tech: 'Tech', science: 'Science' }[native];
    expect(shown).toBe(label);
  }
});
