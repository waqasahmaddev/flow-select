import { test, expect } from '@playwright/test';
import { openDemo, root, trigger, options, nativeValue, expectOpen } from './helpers.js';

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

function trackRequests(page, pattern, method) {
  const list = [];
  page.on('request', (request) => {
    if (pattern.test(request.url()) && (!method || request.method() === method)) {
      list.push(request);
    }
  });
  return list;
}

function exact(text) {
  return new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function row(page, id, label) {
  return options(page, id).filter({ has: page.locator('.fs-label', { hasText: exact(label) }) });
}

async function pick(page, id, label) {
  await row(page, id, label).click();
}

function valueText(page, id) {
  return root(page, id).locator('.fs-value');
}

function postedFields(request) {
  const params = new URLSearchParams(request.postData() ?? '');
  const result = {};
  for (const key of new Set(params.keys())) {
    result[key] = params.getAll(key);
  }
  return result;
}

async function openFixture(page, name) {
  await page.goto(`/tests/fixtures/${name}`);
  await page.waitForFunction(() => window.fixtureReady === true && window.htmx && document.readyState === 'complete');
}

async function htmxSwap(page, target, html, swapStyle = 'innerHTML') {
  await page.evaluate(({ target, html, swapStyle }) => {
    window.htmx.swap(target, html, { swapStyle, swapDelay: 0, settleDelay: 0 });
  }, { target, html, swapStyle });
}

async function topLayerCount(page) {
  return page.evaluate(() => document.querySelectorAll(':popover-open').length);
}

const FRUIT_FIELD = (id) => `
  <div class="field" id="wrap-${id}">
    <label for="${id}">Fruit</label>
    <select id="${id}" name="${id}" data-flow-select>
      <option value="">Pick a fruit</option>
      <option value="apple">Apple</option>
      <option value="banana">Banana</option>
    </select>
  </div>`;

test.describe('htmx on the demo page', () => {
  test('hx-trigger="change" sends exactly one request per selection with the posted values', async ({ page }) => {
    const errors = trackErrors(page);
    const posts = trackRequests(page, /\/api\/echo$/, 'POST');
    await openDemo(page);

    await trigger(page, 'hx-plan').click();
    await expectOpen(page, 'hx-plan');
    await pick(page, 'hx-plan', 'Team');
    await expect(page.locator('#echo-change')).toContainText('plan: team');
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(1);
    expect(postedFields(posts[0])).toEqual({ plan: ['team'] });

    await trigger(page, 'hx-tags').click();
    await expectOpen(page, 'hx-tags');
    await expect(options(page, 'hx-tags').first()).toBeVisible();
    await pick(page, 'hx-tags', 'CSS');
    await expect(page.locator('#echo-change')).toContainText('tags: css');
    await pick(page, 'hx-tags', 'HTML');
    await expect(page.locator('#echo-change')).toContainText('tags: css, html');
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(3);
    expect(postedFields(posts[1])).toEqual({ plan: ['team'], tags: ['css'] });
    expect(postedFields(posts[2])).toEqual({ plan: ['team'], tags: ['css', 'html'] });

    await page.keyboard.press('Escape');
    await root(page, 'hx-tags').locator('.fs-chip[data-value="css"] .fs-chip-remove').click();
    await expect(page.locator('#echo-change')).toContainText('tags: html');
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(4);
    expect(postedFields(posts[3])).toEqual({ plan: ['team'], tags: ['html'] });
    expect(await nativeValue(page, 'hx-tags')).toEqual(['html']);
    expect(errors).toEqual([]);
  });

  test('a keyboard selection also sends exactly one request', async ({ page }) => {
    const posts = trackRequests(page, /\/api\/echo$/, 'POST');
    await openDemo(page);
    await trigger(page, 'hx-plan').focus();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'hx-plan');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#echo-change')).toContainText('plan: business');
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(1);
    expect(postedFields(posts[0])).toEqual({ plan: ['business'] });
  });

  test('re-selecting the current value sends no request', async ({ page }) => {
    const posts = trackRequests(page, /\/api\/echo$/, 'POST');
    await openDemo(page);
    await trigger(page, 'hx-plan').click();
    await pick(page, 'hx-plan', 'Free');
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(0);
  });

  test('a remote search followed by a pick sends one request with the remote value', async ({ page }) => {
    const posts = trackRequests(page, /\/api\/echo$/, 'POST');
    await openDemo(page);
    await trigger(page, 'hx-tags').click();
    await page.keyboard.type('javas');
    await expect(options(page, 'hx-tags')).toHaveCount(1);
    await expect(options(page, 'hx-tags').first()).toContainText('JavaScript');
    await page.keyboard.press('Enter');
    await expect(page.locator('#echo-change')).toContainText('tags: javascript');
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(1);
    expect(postedFields(posts[0])).toEqual({ plan: ['free'], tags: ['javascript'] });
  });

  // BUG: typing in the search box fires a native change event that bubbles to hx-trigger="change"
  test('typing a search and leaving without picking sends no request', async ({ page }) => {
    const posts = trackRequests(page, /\/api\/echo$/, 'POST');
    await openDemo(page);
    await trigger(page, 'hx-tags').click();
    await page.keyboard.type('css');
    await expect(options(page, 'hx-tags').first()).toContainText('CSS');
    await page.locator('#htmx h2').click();
    await expectOpen(page, 'hx-tags', false);
    await page.waitForTimeout(400);
    expect(posts).toHaveLength(0);
  });

  test('hx-trigger="flowselect:change" on the select sends the chosen remote value', async ({ page }) => {
    const gets = trackRequests(page, /\/api\/echo\?/, 'GET');
    await openDemo(page);
    await trigger(page, 'hx-custom').click();
    await expectOpen(page, 'hx-custom');
    await expect(options(page, 'hx-custom').first()).toBeVisible();
    await options(page, 'hx-custom').first().click();
    await expect(page.locator('#echo-custom')).toContainText('person: p1');
    await page.waitForTimeout(300);
    expect(gets).toHaveLength(1);
    expect(new URL(gets[0].url()).searchParams.getAll('person')).toEqual(['p1']);
    expect(await nativeValue(page, 'hx-custom')).toBe('p1');
  });

  test('setValue fires flowselect:change for htmx, and silent setValue does not', async ({ page }) => {
    const gets = trackRequests(page, /\/api\/echo\?/, 'GET');
    await openDemo(page);
    await page.evaluate(() => window.FlowSelect.get('#hx-custom').setValue({ value: 'p7', label: 'Seven' }, { silent: true }));
    await page.waitForTimeout(300);
    expect(gets).toHaveLength(0);
    await expect(valueText(page, 'hx-custom')).toHaveText('Seven');
    await page.evaluate(() => window.FlowSelect.get('#hx-custom').setValue({ value: 'p8', label: 'Eight' }));
    await expect(page.locator('#echo-custom')).toContainText('person: p8');
    await page.waitForTimeout(300);
    expect(gets).toHaveLength(1);
  });

  test('a swapped-in select is enhanced exactly once and the old one is destroyed', async ({ page }) => {
    const errors = trackErrors(page);
    await openDemo(page);
    await page.evaluate(() => {
      window.inits = 0;
      document.addEventListener('flowselect:init', () => { window.inits += 1; });
    });
    const target = page.locator('#swap-target');
    await page.getByRole('button', { name: 'Load a select' }).click();
    await expect(target.locator('.fs')).toHaveCount(1);
    await expect(target.locator('.fs .fs')).toHaveCount(0);
    expect(await page.evaluate(() => window.inits)).toBe(1);

    const id = await target.locator('select').getAttribute('id');
    await trigger(page, id).click();
    await expectOpen(page, id);
    await pick(page, id, 'Banana');
    expect(await nativeValue(page, id)).toBe('banana');
    await expect(valueText(page, id)).toHaveText('Banana');

    await page.evaluate(() => { window.oldSwapped = document.querySelector('#swap-target select'); });
    await page.waitForTimeout(5);
    await page.getByRole('button', { name: 'Load a select' }).click();
    await expect.poll(() => page.evaluate(() => window.oldSwapped.isConnected)).toBe(false);
    await expect(target.locator('.fs')).toHaveCount(1);
    await expect(target.locator('select')).toHaveCount(1);
    expect(await page.evaluate(() => window.FlowSelect.get(window.oldSwapped))).toBeNull();
    expect(await page.evaluate(() => window.inits)).toBe(2);
    expect(errors).toEqual([]);
  });

  test('replacing the options through hx-target refreshes the list and the displayed value', async ({ page }) => {
    await openDemo(page);
    await trigger(page, 'hx-options').click();
    await pick(page, 'hx-options', 'Free');
    await expect(valueText(page, 'hx-options')).toHaveText('Free');

    await page.getByRole('button', { name: 'Reload options from server' }).click();
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('#hx-options option').length)).toBe(4);
    const label = await page.evaluate(() => document.getElementById('hx-options').selectedOptions[0]?.label ?? '');
    await expect(valueText(page, 'hx-options')).toHaveText(label);

    await trigger(page, 'hx-options').click();
    await expectOpen(page, 'hx-options');
    await expect(options(page, 'hx-options')).toHaveCount(4);
    await expect(options(page, 'hx-options').nth(2)).toContainText('Team (');
    await options(page, 'hx-options').nth(2).click();
    expect(await nativeValue(page, 'hx-options')).toBe('team');
    await expect(valueText(page, 'hx-options')).toContainText('Team (');
  });

  test('replacing the options while the list is open updates the open list', async ({ page }) => {
    await page.route('**/mock/options-open', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<option value="">Choose a plan</option><option value="x">Xray</option><option value="y">Yankee</option><option value="z">Zulu</option><option value="w">Whiskey</option>'
    }));
    await openDemo(page);
    await trigger(page, 'hx-options').click();
    await expect(options(page, 'hx-options')).toHaveCount(2);
    await page.evaluate(() => window.htmx.ajax('GET', '/mock/options-open', { target: '#hx-options', swap: 'innerHTML' }));
    await expect(options(page, 'hx-options')).toHaveCount(5);
    await expectOpen(page, 'hx-options');
    await pick(page, 'hx-options', 'Zulu');
    expect(await nativeValue(page, 'hx-options')).toBe('z');
    await expect(valueText(page, 'hx-options')).toHaveText('Zulu');
  });

  test('replaced options carrying a selected attribute update the displayed value', async ({ page }) => {
    await page.route('**/mock/options-selected', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<option value="">Choose a plan</option><option value="free">Gratis</option><option value="team" selected>Crew</option>'
    }));
    await openDemo(page);
    await page.evaluate(() => {
      window.htmx.ajax('GET', '/mock/options-selected', { target: '#hx-options', swap: 'innerHTML' });
    });
    await expect(valueText(page, 'hx-options')).toHaveText('Crew');
    expect(await nativeValue(page, 'hx-options')).toBe('team');
  });

  test('an HX-Trigger response header reloads a select listening with refreshOn', async ({ page }) => {
    const people = trackRequests(page, /\/api\/people/);
    await openDemo(page);
    await trigger(page, 'hx-refresh').click();
    await expect(options(page, 'hx-refresh').first()).toBeVisible();
    expect(people).toHaveLength(1);
    await page.keyboard.press('Escape');
    await trigger(page, 'hx-refresh').click();
    await expect(options(page, 'hx-refresh').first()).toBeVisible();
    await page.waitForTimeout(200);
    expect(people).toHaveLength(1);
    await page.keyboard.press('Escape');

    await page.evaluate(() => {
      window.peopleChanged = 0;
      document.addEventListener('people-changed', () => { window.peopleChanged += 1; });
    });
    await page.getByRole('button', { name: 'Server: people changed' }).click();
    await expect.poll(() => page.evaluate(() => window.peopleChanged)).toBe(1);
    await trigger(page, 'hx-refresh').click();
    await expect.poll(() => people.length).toBe(2);
    await expect(options(page, 'hx-refresh').first()).toBeVisible();
  });

  test('refreshOn reloads the open list immediately', async ({ page }) => {
    const people = trackRequests(page, /\/api\/people/);
    await openDemo(page);
    await trigger(page, 'hx-refresh').click();
    await expect(options(page, 'hx-refresh').first()).toBeVisible();
    expect(people).toHaveLength(1);
    await page.evaluate(() => document.body.dispatchEvent(new CustomEvent('people-changed', { bubbles: true })));
    await expect.poll(() => people.length).toBe(2);
    await expectOpen(page, 'hx-refresh');
  });
});

test.describe('htmx swaps with autoInit', () => {
  test('content swapped by htmx is enhanced exactly once and works', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    expect(await page.evaluate(() => window.fsInits)).toBe(1);
    await expect(root(page, 'static')).toHaveCount(1);

    await htmxSwap(page, '#app', FRUIT_FIELD('one') + FRUIT_FIELD('two'));
    await expect(page.locator('#app .fs')).toHaveCount(2);
    await expect(page.locator('.fs .fs')).toHaveCount(0);
    expect(await page.evaluate(() => window.fsInits)).toBe(3);

    await trigger(page, 'two').click();
    await pick(page, 'two', 'Apple');
    expect(await nativeValue(page, 'two')).toBe('apple');
    expect(errors).toEqual([]);
  });

  test('innerHTML swap of a container destroys the instances inside it', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    await htmxSwap(page, '#app', FRUIT_FIELD('one'));
    await page.evaluate(() => {
      window.oldOne = document.getElementById('one');
      window.destroyed = 0;
      document.addEventListener('flowselect:destroy', () => { window.destroyed += 1; });
    });
    await htmxSwap(page, '#app', FRUIT_FIELD('fresh'));
    await expect(page.locator('#app .fs')).toHaveCount(1);
    await expect(page.locator('#app select')).toHaveCount(1);
    expect(await page.evaluate(() => window.FlowSelect.get(window.oldOne))).toBeNull();
    expect(await page.evaluate(() => window.oldOne.isConnected)).toBe(false);
    expect(await page.evaluate(() => window.destroyed)).toBe(1);
    expect(errors).toEqual([]);
  });

  test('outerHTML swap of a wrapper destroys the instance inside it', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    await htmxSwap(page, '#app', FRUIT_FIELD('one'));
    await page.evaluate(() => { window.oldOne = document.getElementById('one'); });
    await htmxSwap(page, '#wrap-one', FRUIT_FIELD('two'), 'outerHTML');
    await expect(page.locator('#app .fs')).toHaveCount(1);
    await expect(page.locator('#app select')).toHaveCount(1);
    await expect(root(page, 'two')).toHaveCount(1);
    expect(await page.evaluate(() => window.FlowSelect.get(window.oldOne))).toBeNull();
    expect(await page.evaluate(() => window.FlowSelect.get('#two') !== null)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('hx-swap="delete" on a wrapper destroys the instance', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    await htmxSwap(page, '#app', FRUIT_FIELD('one'));
    await page.evaluate(() => { window.oldOne = document.getElementById('one'); });
    await htmxSwap(page, '#wrap-one', '', 'delete');
    await expect(page.locator('#app .fs')).toHaveCount(0);
    expect(await page.evaluate(() => window.FlowSelect.get(window.oldOne))).toBeNull();
    expect(errors).toEqual([]);
  });

  // BUG: htmx innerHTML swap throws when the enhanced select is the first child node of the target
  test('innerHTML swap works when the enhanced select is the first child of the target', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'box';
      box.innerHTML = '<select id="first" name="first" data-flow-select><option value="a">Alpha</option><option value="b">Beta</option></select>';
      document.getElementById('app').append(box);
      window.FlowSelect.init(box);
    });
    await expect(root(page, 'first')).toHaveCount(1);
    await page.evaluate(() => {
      try {
        window.htmx.swap('#box', '<p id="replacement">Replaced</p>', { swapStyle: 'innerHTML', swapDelay: 0, settleDelay: 0 });
      } catch (error) {
        console.error(String(error));
      }
    });
    await expect(page.locator('#replacement')).toHaveCount(1);
    await expect(page.locator('#box select')).toHaveCount(0);
    await expect(page.locator('#box .fs')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // BUG: htmx outerHTML swap that targets the enhanced select loses the new content
  test('outerHTML swap that targets the enhanced select itself inserts the new content', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    await htmxSwap(page, '#app', FRUIT_FIELD('one'));
    await htmxSwap(page, '#one', '<select id="one-new" name="one" data-flow-select><option value="x">Xray</option><option value="y">Yankee</option></select>', 'outerHTML');
    await expect(page.locator('#one')).toHaveCount(0);
    await expect(page.locator('#one-new')).toHaveCount(1);
    await expect(root(page, 'one-new')).toHaveCount(1);
    await expect(page.locator('#wrap-one .fs')).toHaveCount(1);
    await expect(page.locator('#wrap-one .fs-control')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('an open popover in innerHTML-swapped content leaves nothing in the top layer', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    await htmxSwap(page, '#app', FRUIT_FIELD('one'));
    await trigger(page, 'one').click();
    await expectOpen(page, 'one');
    expect(await topLayerCount(page)).toBe(1);
    await page.evaluate(() => {
      window.closes = 0;
      document.addEventListener('flowselect:close', () => { window.closes += 1; });
    });
    await htmxSwap(page, '#app', '<p>Gone</p>');
    expect(await topLayerCount(page)).toBe(0);
    expect(await page.evaluate(() => document.querySelectorAll('#app .fs-popover').length)).toBe(0);
    expect(await page.evaluate(() => window.closes)).toBe(1);

    await trigger(page, 'static').click();
    await expectOpen(page, 'static');
    await pick(page, 'static', 'Beta');
    expect(await nativeValue(page, 'static')).toBe('b');
    await page.mouse.click(5, 5);
    expect(errors).toEqual([]);
  });

  test('an open popover in outerHTML-swapped content leaves nothing in the top layer', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-auto.html');
    await htmxSwap(page, '#app', FRUIT_FIELD('one'));
    await trigger(page, 'one').click();
    await expectOpen(page, 'one');
    await page.evaluate(() => { window.oldOne = document.getElementById('one'); });
    await htmxSwap(page, '#wrap-one', FRUIT_FIELD('two'), 'outerHTML');
    expect(await topLayerCount(page)).toBe(0);
    expect(await page.evaluate(() => window.FlowSelect.get(window.oldOne))).toBeNull();
    await trigger(page, 'two').click();
    await expectOpen(page, 'two');
    expect(await topLayerCount(page)).toBe(1);
    await pick(page, 'two', 'Banana');
    expect(await nativeValue(page, 'two')).toBe('banana');
    expect(await topLayerCount(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('a select returned by an htmx request with hx-trigger attributes is enhanced and sends requests', async ({ page }) => {
    await page.route('**/mock/fragment', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<div class="field"><label for="remote-plan">Plan</label>
        <select id="remote-plan" name="plan" data-flow-select hx-get="/api/echo" hx-trigger="change" hx-target="#out">
          <option value="free">Free</option><option value="pro">Pro</option>
        </select></div><div id="out"></div>`
    }));
    const gets = trackRequests(page, /\/api\/echo\?/, 'GET');
    await openFixture(page, 'htmx-auto.html');
    await page.evaluate(() => window.htmx.ajax('GET', '/mock/fragment', { target: '#app', swap: 'innerHTML' }));
    await expect(root(page, 'remote-plan')).toHaveCount(1);
    await trigger(page, 'remote-plan').click();
    await pick(page, 'remote-plan', 'Pro');
    await expect(page.locator('#out')).toContainText('plan: pro');
    await page.waitForTimeout(200);
    expect(gets).toHaveLength(1);
  });

  test('htmx.process() plus FlowSelect.init() on content added outside htmx gives a working select', async ({ page }) => {
    const gets = trackRequests(page, /\/api\/echo\?/, 'GET');
    await openFixture(page, 'htmx-auto.html');
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.innerHTML = `<div id="processed"><label for="proc">Plan</label>
        <select id="proc" name="proc" data-flow-select hx-get="/api/echo" hx-trigger="change" hx-target="#proc-out">
          <option value="free">Free</option><option value="pro">Pro</option>
        </select><div id="proc-out"></div></div>`;
      const fragment = document.getElementById('processed');
      window.htmx.process(fragment);
      window.FlowSelect.init(fragment);
    });
    await expect(root(page, 'proc')).toHaveCount(1);
    await trigger(page, 'proc').click();
    await pick(page, 'proc', 'Pro');
    await expect(page.locator('#proc-out')).toContainText('proc: pro');
    expect(gets).toHaveLength(1);
  });

  test('htmx.process() on an already enhanced select keeps it working and enhanced once', async ({ page }) => {
    const gets = trackRequests(page, /\/api\/echo\?/, 'GET');
    await openFixture(page, 'htmx-auto.html');
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.innerHTML = `<div id="processed"><label for="proc">Plan</label>
        <select id="proc" name="proc" data-flow-select hx-get="/api/echo" hx-trigger="change" hx-target="#proc-out">
          <option value="free">Free</option><option value="pro">Pro</option>
        </select><div id="proc-out"></div></div>`;
      const fragment = document.getElementById('processed');
      window.FlowSelect.init(fragment);
      window.htmx.process(fragment);
      window.htmx.process(fragment);
    });
    await expect(page.locator('#processed .fs')).toHaveCount(1);
    await trigger(page, 'proc').click();
    await pick(page, 'proc', 'Pro');
    await expect(page.locator('#proc-out')).toContainText('proc: pro');
    await page.waitForTimeout(200);
    expect(gets).toHaveLength(1);
  });

  test('with observe: true, content added and processed outside htmx is enhanced', async ({ page }) => {
    await openFixture(page, 'htmx-observe.html');
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.innerHTML = `<div id="processed"><label for="proc">Plan</label>
        <select id="proc" name="proc" data-flow-select hx-get="/api/echo" hx-trigger="change" hx-target="#proc-out">
          <option value="free">Free</option><option value="pro">Pro</option>
        </select><div id="proc-out"></div></div>`;
      window.htmx.process(document.getElementById('processed'));
    });
    await expect(root(page, 'proc')).toHaveCount(1);
    await expect(page.locator('.fs .fs')).toHaveCount(0);
    await trigger(page, 'proc').click();
    await pick(page, 'proc', 'Pro');
    await expect(page.locator('#proc-out')).toContainText('proc: pro');
    expect(await page.evaluate(() => window.pageErrors)).toEqual([]);
  });
});

test.describe('hx-boost', () => {
  test('a boosted navigation swaps the body and re-initialises', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-boost-a.html');
    await expect(root(page, 'sel-a')).toHaveCount(1);
    await page.evaluate(() => {
      window.oldA = document.getElementById('sel-a');
      window.marker = 'kept';
    });
    await page.click('#go-b');
    await expect(page.locator('#page-b')).toBeVisible();
    expect(await page.evaluate(() => window.marker)).toBe('kept');
    await expect(page.locator('.fs')).toHaveCount(1);
    await expect(root(page, 'sel-b')).toHaveCount(1);
    expect(await page.evaluate(() => window.FlowSelect.get(window.oldA))).toBeNull();
    await trigger(page, 'sel-b').click();
    await pick(page, 'sel-b', 'Beta two');
    expect(await nativeValue(page, 'sel-b')).toBe('two');
    expect(errors).toEqual([]);
  });

  test('a boosted navigation while a popover is open leaves nothing in the top layer', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-boost-a.html');
    await trigger(page, 'sel-a').click();
    await expectOpen(page, 'sel-a');
    await page.evaluate(() => document.getElementById('go-b').click());
    await expect(page.locator('#page-b')).toBeVisible();
    expect(await topLayerCount(page)).toBe(0);
    await expect(root(page, 'sel-b')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  // BUG: htmx history restore wraps the restored select a second time
  test('going back restores the page from the htmx history cache without double wrappers', async ({ page }) => {
    const errors = trackErrors(page);
    await openFixture(page, 'htmx-boost-a.html');
    await page.evaluate(() => { window.marker = 'kept'; });
    await page.click('#go-b');
    await expect(page.locator('#page-b')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#page-a')).toBeVisible();
    expect(await page.evaluate(() => window.marker)).toBe('kept');
    await expect(page.locator('.fs')).toHaveCount(1);
    await expect(page.locator('.fs .fs')).toHaveCount(0);
    await expect(page.locator('.fs-control')).toHaveCount(1);
    await trigger(page, 'sel-a').click();
    await expectOpen(page, 'sel-a');
    await pick(page, 'sel-a', 'Alpha three');
    expect(await nativeValue(page, 'sel-a')).toBe('three');
    expect(errors).toEqual([]);
  });
});
