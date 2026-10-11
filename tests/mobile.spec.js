import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mount, openDemo, root, control, trigger, popover, options, nativeValue, expectOpen } from './helpers.js';

const SHOTS = 'test-results/mobile-shots';
const GAP = 6;
const MARGIN = 8;

const STYLE = `
<style>
  body { margin: 0; padding: 16px !important; }
  .field { width: auto !important; margin-bottom: 16px; }
  .bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 16px; }
  .tall { height: 2000px; }
</style>`;

const LONG = 'An unusually long option label that keeps on going well past the edge of a phone screen';

function list(count, prefix = 'Option') {
  return Array.from({ length: count }, (_, index) => `<option value="v${index + 1}">${prefix} ${index + 1}</option>`).join('');
}

const FRUITS = `
  <option value="apple">Apple</option>
  <option value="banana">Banana</option>
  <option value="cherry">Cherry</option>
  <option value="grape">Grape</option>
  <option value="lemon">Lemon</option>`;

const TAGS = `
  <option value="alpha">Alpha</option>
  <option value="beta">Beta</option>
  <option value="gamma">Gamma</option>
  <option value="delta">Delta</option>
  <option value="epsilon">Epsilon</option>
  <option value="zeta">Zeta</option>
  <option value="eta">Eta</option>
  <option value="theta">Theta</option>
  <option value="iota">Iota</option>
  <option value="kappa">Kappa</option>`;

const DESCRIPTIONS = `
  <option value="standard" data-description="Sends traffic to standard processing at the regular rate">Standard</option>
  <option value="fast" data-description="Sends traffic to fast processing with an automatic ramp-up period and a higher rate">Fast</option>
  <option value="flex" data-description="Cheaper processing that may be delayed during busy periods of the day">Flex</option>
  <option value="unbroken" data-description="Averyveryverylongunbrokenwordwithoutanyspacesthatmustwrapsomewhereinsidetherow">Unbroken</option>`;

// ---------- helpers ----------

async function settle(page, count = 3) {
  await page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const step = () => {
      left -= 1;
      if (left <= 0) {
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }), count);
}

async function geometry(page, id) {
  await settle(page);
  return page.evaluate((id) => {
    const fsRoot = document.getElementById(id).closest('.fs');
    const pop = fsRoot.querySelector('.fs-popover');
    const ctl = fsRoot.querySelector('.fs-control');
    const plain = (rect) => ({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height });
    const visual = window.visualViewport;
    const listEl = pop.querySelector('.fs-list');
    return {
      pop: plain(pop.getBoundingClientRect()),
      control: plain(ctl.getBoundingClientRect()),
      view: { top: visual.offsetTop, left: visual.offsetLeft, width: visual.width, height: visual.height },
      placement: pop.dataset.placement,
      listScrollWidth: listEl.scrollWidth,
      listClientWidth: listEl.clientWidth,
      listScrollHeight: listEl.scrollHeight,
      listClientHeight: listEl.clientHeight
    };
  }, id);
}

function expectInside(geo, label = '') {
  const t = 0.75;
  expect(geo.pop.left, `${label} popover left edge`).toBeGreaterThanOrEqual(geo.view.left - t);
  expect(geo.pop.right, `${label} popover right edge`).toBeLessThanOrEqual(geo.view.left + geo.view.width + t);
  expect(geo.pop.top, `${label} popover top edge`).toBeGreaterThanOrEqual(geo.view.top - t);
  expect(geo.pop.bottom, `${label} popover bottom edge`).toBeLessThanOrEqual(geo.view.top + geo.view.height + t);
}

function expectAttached(geo, label = '') {
  if (geo.placement === 'top') {
    expect(Math.abs(geo.control.top - GAP - geo.pop.bottom), `${label} popover sits ${GAP}px above the control`).toBeLessThanOrEqual(1.5);
  } else {
    expect(Math.abs(geo.control.bottom + GAP - geo.pop.top), `${label} popover sits ${GAP}px below the control`).toBeLessThanOrEqual(1.5);
  }
}

async function isOpen(page, id) {
  return page.evaluate((id) => window.FlowSelect.get(`#${id}`).isOpen, id);
}

async function activeClass(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      return 'body';
    }
    return `${active.tagName.toLowerCase()}.${active.className}`;
  });
}

async function activeIsTextInput(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return Boolean(active && active.tagName === 'INPUT' && !active.readOnly);
  });
}

function option(page, id, text) {
  return options(page, id).filter({ has: page.locator('.fs-label', { hasText: new RegExp(`^${text}$`) }) }).first();
}

async function tapOption(page, id, text, tapOptions = {}) {
  await option(page, id, text).tap(tapOptions);
}

async function tapEmpty(page) {
  const box = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.touchscreen.tap(Math.round(box.w / 2), box.h - 6);
}

async function hitTestInside(page, id, index = -1) {
  return page.evaluate(({ id, index }) => {
    const pop = document.getElementById(id).closest('.fs').querySelector('.fs-popover');
    const rows = pop.querySelectorAll('.fs-option');
    const row = rows[index < 0 ? rows.length + index : index];
    row.scrollIntoView({ block: 'nearest' });
    const rect = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(hit && pop.contains(hit));
  }, { id, index });
}

async function cdpDrag(page, x, y, deltaY, steps = 10) {
  const session = await page.context().newCDPSession(page);
  const point = (py) => [{ x: Math.round(x), y: Math.round(py), id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(y) });
  for (let step = 1; step <= steps; step += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(y + (deltaY * step) / steps) });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

function chipInput(page, id) {
  return root(page, id).locator('.fs-chip-input .fs-input');
}

async function center(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const CDP_ONLY = 'Real touch gestures need CDP, which only Chromium has. WebKit is covered by the programmatic fallback test.';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

// ---------- environment ----------

test('environment: a touch phone with a coarse pointer and no hover', async ({ page }) => {
  await mount(page, '');
  const env = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    noHover: matchMedia('(hover: none)').matches,
    width: window.innerWidth
  }));
  expect(env.coarse).toBe(true);
  expect(env.noHover).toBe(true);
  expect(env.width).toBeLessThan(500);
});

// ---------- tap interactions ----------

const TAP_HTML = `${STYLE}
<div class="field"><label for="plain">Plain</label><select id="plain" data-flow-select>${FRUITS}</select></div>
<div class="field"><label for="inline">Inline</label><select id="inline" data-flow-select data-fs-search="true">${FRUITS}</select></div>
<div class="field"><label for="drop">Dropdown</label><select id="drop" data-flow-select data-fs-search="dropdown">${FRUITS}</select></div>
<div class="bar">
  <select id="pill" aria-label="Pill" data-flow-select data-fs-variant="pill" data-fs-search="false">${FRUITS}</select>
  <select id="pill-search" aria-label="Pill search" data-flow-select data-fs-variant="pill" data-fs-search="true">${FRUITS}</select>
  <select id="ghost" aria-label="Ghost" data-flow-select data-fs-variant="ghost">${FRUITS}</select>
</div>
<div class="field"><label for="multi">Multiple</label><select id="multi" multiple data-flow-select>${TAGS}</select></div>
<div class="field"><label for="clear">Clearable</label><select id="clear" data-flow-select data-fs-search="true" data-fs-clearable="true">${FRUITS}</select></div>
<div style="height: 400px"></div>`;

test.describe('tap', () => {
  test.beforeEach(async ({ page }) => {
    await mount(page, TAP_HTML);
  });

  test('plain field: tap opens with focus on the trigger, tap again closes', async ({ page }) => {
    await trigger(page, 'plain').tap();
    await expectOpen(page, 'plain');
    expect(await activeClass(page)).toBe('button.fs-trigger');
    expect(await activeIsTextInput(page)).toBe(false);
    await trigger(page, 'plain').tap();
    await expectOpen(page, 'plain', false);
  });

  test('plain field: tap an option selects it and closes', async ({ page }) => {
    await trigger(page, 'plain').tap();
    await tapOption(page, 'plain', 'Cherry');
    await expectOpen(page, 'plain', false);
    expect(await nativeValue(page, 'plain')).toBe('cherry');
    await expect(root(page, 'plain').locator('.fs-value')).toHaveText('Cherry');
  });

  test('inline search: tap focuses the input (text field), typing filters, tap a result selects', async ({ page }) => {
    await trigger(page, 'inline').tap();
    await expectOpen(page, 'inline');
    expect(await activeClass(page)).toBe('input.fs-input');
    await page.keyboard.type('gr');
    await expect(options(page, 'inline')).toHaveCount(1);
    await tapOption(page, 'inline', 'Grape');
    await expectOpen(page, 'inline', false);
    expect(await nativeValue(page, 'inline')).toBe('grape');
  });

  // BUG: Tapping the open, empty inline search field closes it
  test('inline search: tapping the open field again keeps it open and focused', async ({ page }) => {
    await trigger(page, 'inline').tap();
    await expectOpen(page, 'inline');
    const point = await center(trigger(page, 'inline'));
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).className, point);
    test.info().annotations.push({ type: 'element under the finger', description: hit });
    await page.touchscreen.tap(point.x, point.y);
    await settle(page);
    expect(await isOpen(page, 'inline')).toBe(true);
    expect(await activeClass(page)).toBe('input.fs-input');
  });

  test('inline search: tapping the open field after typing keeps it open', async ({ page }) => {
    await trigger(page, 'inline').tap();
    await page.keyboard.type('a');
    const point = await center(trigger(page, 'inline'));
    await page.touchscreen.tap(point.x, point.y);
    await settle(page);
    expect(await isOpen(page, 'inline')).toBe(true);
  });

  test('dropdown search: tap-open does not focus the search box (no on-screen keyboard)', async ({ page }) => {
    await trigger(page, 'drop').tap();
    await expectOpen(page, 'drop');
    expect(await activeClass(page)).toBe('button.fs-trigger');
    expect(await activeIsTextInput(page)).toBe(false);
  });

  test('dropdown search: tapping the search box focuses it, typing filters, tap selects', async ({ page }) => {
    await trigger(page, 'drop').tap();
    const search = popover(page, 'drop').locator('.fs-search .fs-input');
    await search.tap();
    await expect(search).toBeFocused();
    await page.keyboard.type('lem');
    await expect(options(page, 'drop')).toHaveCount(1);
    await tapOption(page, 'drop', 'Lemon');
    await expectOpen(page, 'drop', false);
    expect(await nativeValue(page, 'drop')).toBe('lemon');
  });

  for (const id of ['pill', 'pill-search', 'ghost']) {
    test(`${id}: tap opens without a focused text field, option tap selects, tap trigger closes`, async ({ page }) => {
      await trigger(page, id).tap();
      await expectOpen(page, id);
      expect(await activeIsTextInput(page)).toBe(false);
      await tapOption(page, id, 'Banana');
      await expectOpen(page, id, false);
      expect(await nativeValue(page, id)).toBe('banana');
      await trigger(page, id).tap();
      await expectOpen(page, id);
      await trigger(page, id).tap();
      await expectOpen(page, id, false);
    });
  }

  test('multiple: tap opens, options toggle and the popover stays open', async ({ page }) => {
    await control(page, 'multi').tap();
    await expectOpen(page, 'multi');
    expect(await activeClass(page)).toBe('input.fs-input');
    await tapOption(page, 'multi', 'Beta');
    await tapOption(page, 'multi', 'Delta');
    await expectOpen(page, 'multi');
    expect(await nativeValue(page, 'multi')).toEqual(['beta', 'delta']);
    await tapOption(page, 'multi', 'Beta');
    await expectOpen(page, 'multi');
    expect(await nativeValue(page, 'multi')).toEqual(['delta']);
    await expect(root(page, 'multi').locator('.fs-chip')).toHaveCount(1);
  });

  test('multiple: tapping a chip remove button removes that chip and does not open', async ({ page }) => {
    await page.evaluate(() => window.FlowSelect.get('#multi').setValue(['alpha', 'gamma']));
    await root(page, 'multi').locator('.fs-chip[data-value="alpha"] .fs-chip-remove').tap();
    expect(await nativeValue(page, 'multi')).toEqual(['gamma']);
    await expectOpen(page, 'multi', false);
  });

  // BUG: Tapping a chip remove or clear button raises the on-screen keyboard
  test('multiple: tapping a chip remove button does not focus the text input', async ({ page }) => {
    await page.evaluate(() => window.FlowSelect.get('#multi').setValue(['alpha', 'gamma']));
    expect(await activeIsTextInput(page)).toBe(false);
    await root(page, 'multi').locator('.fs-chip[data-value="alpha"] .fs-chip-remove').tap();
    expect(await nativeValue(page, 'multi')).toEqual(['gamma']);
    expect(await activeIsTextInput(page)).toBe(false);
  });

  // BUG: Tapping a chip remove or clear button raises the on-screen keyboard
  test('clearable inline search: tapping the clear button does not focus the text input', async ({ page }) => {
    await page.evaluate(() => window.FlowSelect.get('#clear').setValue('cherry'));
    expect(await activeIsTextInput(page)).toBe(false);
    await root(page, 'clear').locator('.fs-clear').tap();
    expect(await nativeValue(page, 'clear')).toBe('');
    await expectOpen(page, 'clear', false);
    expect(await activeIsTextInput(page)).toBe(false);
  });

  test('tap outside closes without changing the value', async ({ page }) => {
    await trigger(page, 'plain').tap();
    await expectOpen(page, 'plain');
    await tapEmpty(page);
    await expectOpen(page, 'plain', false);
    expect(await nativeValue(page, 'plain')).toBe('apple');
  });

  test('tap outside closes an open multiple and an open dropdown search', async ({ page }) => {
    await control(page, 'multi').tap();
    await tapOption(page, 'multi', 'Eta');
    await tapEmpty(page);
    await expectOpen(page, 'multi', false);
    expect(await nativeValue(page, 'multi')).toEqual(['eta']);
    await trigger(page, 'drop').tap();
    await expectOpen(page, 'drop');
    await tapEmpty(page);
    await expectOpen(page, 'drop', false);
  });

  test('tapping a second select closes the first and opens the second', async ({ page }) => {
    const order = ['clear', 'multi', 'pill', 'drop', 'inline', 'plain'];
    let previous = null;
    for (const id of order) {
      if (id === 'multi') {
        await control(page, id).tap();
      } else {
        await trigger(page, id).tap();
      }
      await expectOpen(page, id);
      if (previous) {
        await expectOpen(page, previous, false);
      }
      expect(await page.locator('.fs-popover:popover-open').count()).toBe(1);
      previous = id;
    }
  });

  test('disabled options ignore taps', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelector('#plain option[value="grape"]').disabled = true;
    });
    await settle(page);
    await trigger(page, 'plain').tap();
    await tapOption(page, 'plain', 'Grape', { force: true });
    await expectOpen(page, 'plain');
    expect(await nativeValue(page, 'plain')).toBe('apple');
  });
});

// ---------- touch scrolling ----------

const SCROLL_HTML = `${STYLE}
<div class="field"><label for="long">Long list</label><select id="long" data-flow-select data-fs-search="false">${list(60)}</select></div>
<div class="field"><label for="short">Short list</label><select id="short" data-flow-select>${FRUITS}</select></div>
<div class="tall"></div>`;

test.describe('touch scrolling', () => {
  test.beforeEach(async ({ page }) => {
    await mount(page, SCROLL_HTML);
  });

  test('touch-scrolling the list scrolls it without selecting or closing (CDP touch drag)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', CDP_ONLY);
    await trigger(page, 'long').tap();
    const listEl = popover(page, 'long').locator('.fs-list');
    const point = await center(listEl);
    await cdpDrag(page, point.x, point.y + 100, -200);
    await settle(page);
    expect(await listEl.evaluate((node) => node.scrollTop)).toBeGreaterThan(50);
    expect(await isOpen(page, 'long')).toBe(true);
    expect(await nativeValue(page, 'long')).toBe('v1');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('a raw touch drag that starts on an option does not select it (CDP touch events)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', CDP_ONLY);
    await trigger(page, 'long').tap();
    const start = await center(options(page, 'long').nth(4));
    await cdpDrag(page, start.x, start.y, -120);
    await settle(page);
    expect(await isOpen(page, 'long')).toBe(true);
    expect(await nativeValue(page, 'long')).toBe('v1');
    expect(await popover(page, 'long').locator('.fs-list').evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
  });

  test('overscroll at the end of the list does not scroll the page behind (CDP touch drag)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', CDP_ONLY);
    await trigger(page, 'long').tap();
    const listEl = popover(page, 'long').locator('.fs-list');
    await listEl.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await settle(page);
    const point = await center(listEl);
    await cdpDrag(page, point.x, point.y + 100, -250);
    await cdpDrag(page, point.x, point.y + 100, -250);
    await settle(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await isOpen(page, 'long')).toBe(true);
    expect(await nativeValue(page, 'long')).toBe('v1');
  });

  test('dragging on a list that does not overflow does not scroll the page behind (CDP touch drag)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', CDP_ONLY);
    await trigger(page, 'short').tap();
    const point = await center(popover(page, 'short').locator('.fs-list'));
    await cdpDrag(page, point.x, point.y + 60, -150);
    await settle(page);
    expect(await isOpen(page, 'short')).toBe(true);
    expect(await nativeValue(page, 'short')).toBe('apple');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('programmatic list scrolling keeps the popover open and the page still (WebKit fallback)', async ({ page }) => {
    test.skip(!(await page.evaluate(() => CSS.supports('overscroll-behavior', 'contain'))), 'This browser has no overscroll-behavior support');
    await trigger(page, 'long').tap();
    const listEl = popover(page, 'long').locator('.fs-list');
    expect(await listEl.evaluate((node) => getComputedStyle(node).overscrollBehaviorY)).toBe('contain');
    await listEl.evaluate((node) => {
      node.scrollTop = 600;
    });
    await settle(page);
    expect(await listEl.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
    expect(await isOpen(page, 'long')).toBe(true);
    expect(await nativeValue(page, 'long')).toBe('v1');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await tapOption(page, 'long', 'Option 20');
    expect(await nativeValue(page, 'long')).toBe('v20');
  });
});

// ---------- geometry across screen sizes ----------

const SIZES = [
  { name: '412x915', width: 412, height: 915 },
  { name: '375x667', width: 375, height: 667 },
  { name: '320x568', width: 320, height: 568 },
  { name: 'landscape 844x390', width: 844, height: 390 }
];

const GEOMETRY_HTML = `${STYLE}
<div class="bar">
  <select id="ghost" aria-label="Ghost" data-flow-select data-fs-variant="ghost"><option value="a">Ghost</option><option value="b">${LONG}</option>${list(4, 'Ghost')}</select>
  <select id="pill" aria-label="Pill" data-flow-select data-fs-variant="pill" data-fs-search="true"><option value="a">Short</option><option value="b">${LONG}</option>${list(12, 'Pill')}</select>
</div>
<div class="field"><label for="top">Top</label><select id="top" data-flow-select data-fs-search="false">${list(40)}</select></div>
<div class="field"><label for="multi">Multiple</label><select id="multi" multiple data-flow-select>${TAGS}</select></div>
<div style="height: 1000px"></div>
<div class="field"><label for="bottom">Bottom</label><select id="bottom" data-flow-select data-fs-search="false">${list(40)}</select></div>
<div class="tall"></div>`;

async function scrollControlTo(page, id, viewportY) {
  await page.evaluate(({ id, viewportY }) => {
    const ctl = document.getElementById(id).closest('.fs').querySelector('.fs-control');
    window.scrollBy(0, ctl.getBoundingClientRect().top - viewportY);
  }, { id, viewportY });
  await settle(page);
}

for (const size of SIZES) {
  test.describe(`geometry ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test.beforeEach(async ({ page }) => {
      await mount(page, GEOMETRY_HTML);
    });

    test('field popover is inside the viewport, attached below and matches the control width', async ({ page }) => {
      await trigger(page, 'top').tap();
      const geo = await geometry(page, 'top');
      expectInside(geo);
      expect(geo.placement).toBe('bottom');
      expectAttached(geo);
      expect(Math.abs(geo.pop.width - geo.control.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(geo.pop.left - geo.control.left)).toBeLessThanOrEqual(1);
      expect(geo.listScrollWidth).toBeLessThanOrEqual(geo.listClientWidth);
    });

    test('height shrinks to the space that is available and the list scrolls', async ({ page }) => {
      await trigger(page, 'top').tap();
      const geo = await geometry(page, 'top');
      const below = geo.view.top + geo.view.height - geo.control.bottom - GAP - MARGIN;
      expect(geo.pop.height).toBeLessThanOrEqual(Math.max(below, 120) + 1);
      expect(geo.listScrollHeight).toBeGreaterThan(geo.listClientHeight);
      expectInside(geo);
    });

    test('flips above when the control is near the bottom of the screen', async ({ page }) => {
      await scrollControlTo(page, 'bottom', size.height - 70);
      await trigger(page, 'bottom').tap();
      const geo = await geometry(page, 'bottom');
      expect(geo.placement).toBe('top');
      expectAttached(geo);
      expectInside(geo);
    });

    test('pill with long labels is not wider than the screen and stays inside', async ({ page }) => {
      await trigger(page, 'pill').tap();
      const geo = await geometry(page, 'pill');
      expect(geo.pop.width).toBeLessThanOrEqual(geo.view.width - 2 * MARGIN + 1);
      expectInside(geo);
      expectAttached(geo);
      expect(geo.listScrollWidth).toBeLessThanOrEqual(geo.listClientWidth);
    });

    test('ghost with long labels is not wider than the screen and stays inside', async ({ page }) => {
      await trigger(page, 'ghost').tap();
      const geo = await geometry(page, 'ghost');
      expect(geo.pop.width).toBeLessThanOrEqual(geo.view.width - 2 * MARGIN + 1);
      expectInside(geo);
      expectAttached(geo);
      expect(geo.pop.left).toBeLessThanOrEqual(geo.control.left + 1);
    });

    test('multiple popover is inside the viewport and attached', async ({ page }) => {
      await control(page, 'multi').tap();
      const geo = await geometry(page, 'multi');
      expectInside(geo);
      expectAttached(geo);
    });

    test('follows the control when the page scrolls', async ({ page }) => {
      await trigger(page, 'top').tap();
      const before = await geometry(page, 'top');
      await page.evaluate(() => window.scrollBy(0, 30));
      const after = await geometry(page, 'top');
      expect(after.control.top).toBeLessThan(before.control.top - 10);
      expectAttached(after);
      expect(await isOpen(page, 'top')).toBe(true);
    });
  });
}

// ---------- scroll containers, resize, RTL, keyboard ----------

test.describe('layout', () => {
  test('follows the control inside a scrolling container', async ({ page }) => {
    await mount(page, `${STYLE}
      <div id="box" style="height: 240px; overflow: auto; border: 1px solid #ccc; padding: 8px">
        <div style="height: 80px"></div>
        <div class="field"><select id="boxed" aria-label="Boxed" data-flow-select>${FRUITS}</select></div>
        <div style="height: 600px"></div>
      </div>
      <div class="tall"></div>`);
    await trigger(page, 'boxed').tap();
    const before = await geometry(page, 'boxed');
    expectAttached(before);
    await page.evaluate(() => {
      document.getElementById('box').scrollTop = 50;
    });
    const after = await geometry(page, 'boxed');
    expect(after.control.top).toBeLessThan(before.control.top - 40);
    expectAttached(after);
    expect(await isOpen(page, 'boxed')).toBe(true);
  });

  test('repositions on resize and orientation change', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await mount(page, `${STYLE}
      <div class="field"><select id="rot" aria-label="Rotate" data-flow-select data-fs-search="false">${list(40)}</select></div>
      <div class="tall"></div>`);
    await trigger(page, 'rot').tap();
    const portrait = await geometry(page, 'rot');
    expectInside(portrait, 'portrait');
    await page.setViewportSize({ width: 915, height: 412 });
    const landscape = await geometry(page, 'rot');
    expectInside(landscape, 'landscape');
    expectAttached(landscape, 'landscape');
    expect(landscape.pop.width).toBeGreaterThan(portrait.pop.width);
    await page.setViewportSize({ width: 320, height: 568 });
    const narrow = await geometry(page, 'rot');
    expectInside(narrow, 'narrow');
    expectAttached(narrow, 'narrow');
    expect(Math.abs(narrow.pop.width - narrow.control.width)).toBeLessThanOrEqual(1);
  });

  test('RTL: field aligns to the right edge of the control, pills at both edges stay inside', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mount(page, `${STYLE}
      <div dir="rtl">
        <div class="field"><select id="rtl-field" aria-label="RTL field" data-flow-select>${FRUITS}</select></div>
        <div class="bar">
          <select id="rtl-pill-start" aria-label="RTL pill start" data-flow-select data-fs-variant="pill"><option value="a">A</option><option value="b">${LONG}</option></select>
          <select id="rtl-pill-end" aria-label="RTL pill end" data-flow-select data-fs-variant="pill"><option value="a">B</option><option value="b">${LONG}</option></select>
        </div>
      </div>`);
    await trigger(page, 'rtl-field').tap();
    const field = await geometry(page, 'rtl-field');
    expect(Math.abs(field.pop.right - field.control.right)).toBeLessThanOrEqual(1);
    expectInside(field, 'field');
    for (const id of ['rtl-pill-start', 'rtl-pill-end']) {
      await tapEmpty(page);
      await trigger(page, id).tap();
      const pill = await geometry(page, id);
      expectInside(pill, id);
      expectAttached(pill, id);
      if (id === 'rtl-pill-start') {
        expect(pill.pop.right, 'RTL popover hugs the right edge').toBeGreaterThan(pill.view.width - MARGIN - 2);
      }
    }
  });

  test('simulated on-screen keyboard: popover still fits a shorter viewport (inline search focused)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mount(page, `${STYLE}
      <div style="height: 110px"></div>
      <div class="field"><label for="kb">Search</label><select id="kb" data-flow-select data-fs-search="true">${list(30, 'Item')}</select></div>
      <div class="tall"></div>`);
    await trigger(page, 'kb').tap();
    expect(await activeClass(page)).toBe('input.fs-input');
    await page.keyboard.type('1');
    const before = await geometry(page, 'kb');
    expectInside(before, 'before keyboard');
    await page.setViewportSize({ width: 375, height: 667 - 290 });
    const after = await geometry(page, 'kb');
    expect(await isOpen(page, 'kb')).toBe(true);
    expectInside(after, 'with keyboard');
    expectAttached(after, 'with keyboard');
    expect(after.pop.height).toBeLessThan(before.pop.height + 1);
  });

  // BUG: Popover overflows the screen when less than 120px is free on both sides
  test('simulated keyboard in landscape: very little room on both sides still keeps the popover on screen', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await mount(page, `${STYLE}
      <div style="height: 40px"></div>
      <div class="field"><label for="kb2">Search</label><select id="kb2" data-flow-select data-fs-search="true">${list(30, 'Item')}</select></div>
      <div class="tall"></div>`);
    await trigger(page, 'kb2').tap();
    await page.setViewportSize({ width: 844, height: 170 });
    const geo = await geometry(page, 'kb2');
    test.info().annotations.push({ type: 'measured', description: JSON.stringify({ pop: geo.pop, control: geo.control, view: geo.view }) });
    expect(await isOpen(page, 'kb2')).toBe(true);
    expectInside(geo, 'landscape with keyboard');
  });
});

// ---------- touch comfort ----------

test.describe('touch comfort', () => {
  test('rows are at least 44px tall with a 16px base font', async ({ page }) => {
    await mount(page, `${STYLE}<style>body { font-size: 16px; }</style>
      <div class="field"><select id="rows16" aria-label="Rows" data-flow-select>${FRUITS}</select></div>`);
    await trigger(page, 'rows16').tap();
    const heights = await options(page, 'rows16').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });

  // BUG: Option rows are shorter than 44px on phones when the page font is below 16px
  test('rows are at least 44px tall at the demo font size (15px)', async ({ page }) => {
    await openDemo(page);
    await trigger(page, 'category').tap();
    const heights = await options(page, 'category').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    test.info().annotations.push({ type: 'measured', description: JSON.stringify(heights) });
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });

  test('every text input uses at least 16px font (no iOS focus zoom)', async ({ page }) => {
    await mount(page, `${STYLE}<style>body { font-size: 13px; }</style>
      <div class="field"><select id="i1" aria-label="Inline" data-flow-select data-fs-search="true">${FRUITS}</select></div>
      <div class="field"><select id="i2" aria-label="Dropdown" data-flow-select data-fs-search="dropdown">${FRUITS}</select></div>
      <div class="field"><select id="i3" aria-label="Multiple" multiple data-flow-select>${FRUITS}</select></div>
      <div class="bar"><select id="i4" aria-label="Pill" data-flow-select data-fs-variant="pill" data-fs-search="true">${FRUITS}</select></div>`);
    for (const id of ['i1', 'i3']) {
      const size = await root(page, id).locator('.fs-control .fs-input').evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect(size, id).toBeGreaterThanOrEqual(16);
    }
    for (const id of ['i2', 'i4']) {
      await tapEmpty(page);
      await trigger(page, id).tap();
      const size = await popover(page, id).locator('.fs-search .fs-input').evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect(size, id).toBeGreaterThanOrEqual(16);
    }
  });

  test('a 16px input does not grow the control taller than the closed field', async ({ page }) => {
    await mount(page, `${STYLE}<style>body { font-size: 13px; }</style>
      <div class="field"><select id="h1" aria-label="Button" data-flow-select data-fs-search="false">${FRUITS}</select></div>
      <div class="field"><select id="h2" aria-label="Inline" data-flow-select data-fs-search="true">${FRUITS}</select></div>`);
    const heights = await page.evaluate(() => ['h1', 'h2'].map((id) => document.getElementById(id).closest('.fs').querySelector('.fs-control').getBoundingClientRect().height));
    expect(Math.abs(heights[0] - heights[1])).toBeLessThanOrEqual(1);
  });

  // BUG: Chip remove and clear buttons are too small to tap reliably
  test('chip remove and clear buttons are at least 24x24px on a coarse pointer', async ({ page }) => {
    await openDemo(page);
    await page.evaluate(() => {
      window.FlowSelect.get('#tags').setValue(['css']);
      window.FlowSelect.get('#fruit-inline').setValue('apple');
    });
    const sizes = await page.evaluate(() => {
      const box = (node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      };
      return {
        remove: box(document.querySelector('#tags').closest('.fs').querySelector('.fs-chip-remove')),
        clear: box(document.querySelector('#fruit-inline').closest('.fs').querySelector('.fs-clear'))
      };
    });
    test.info().annotations.push({ type: 'measured', description: JSON.stringify(sizes) });
    expect(Math.min(sizes.remove.width, sizes.remove.height), 'chip remove').toBeGreaterThanOrEqual(24);
    expect(Math.min(sizes.clear.width, sizes.clear.height), 'clear').toBeGreaterThanOrEqual(24);
  });
});

// ---------- content layout ----------

test.describe('content at 320px', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('descriptions wrap inside the popover with no horizontal overflow', async ({ page }) => {
    await mount(page, `${STYLE}<div class="field"><label for="desc">Tier</label><select id="desc" data-flow-select>${DESCRIPTIONS}</select></div>`);
    await trigger(page, 'desc').tap();
    const geo = await geometry(page, 'desc');
    expectInside(geo);
    expect(geo.listScrollWidth).toBeLessThanOrEqual(geo.listClientWidth);
    const rows = await options(page, 'desc').evaluateAll((nodes) => nodes.map((row) => {
      const description = row.querySelector('.fs-description');
      const lineHeight = parseFloat(getComputedStyle(description).lineHeight);
      return {
        overflow: row.scrollWidth - row.clientWidth,
        lines: Math.round(description.getBoundingClientRect().height / lineHeight),
        right: description.getBoundingClientRect().right,
        rowRight: row.getBoundingClientRect().right
      };
    }));
    for (const row of rows) {
      expect(row.overflow).toBeLessThanOrEqual(0);
      expect(row.right).toBeLessThanOrEqual(row.rowRight + 0.5);
    }
    expect(rows[1].lines).toBeGreaterThan(1);
    expect(rows[3].lines).toBeGreaterThan(1);
  });

  test('long labels truncate with an ellipsis in the list and in the control', async ({ page }) => {
    await mount(page, `${STYLE}<div class="field"><label for="lab">Long</label><select id="lab" data-flow-select><option value="a" selected>${LONG}</option><option value="b">Short</option></select></div>`);
    const value = root(page, 'lab').locator('.fs-value-text');
    const closed = await value.evaluate((node) => ({
      truncated: node.scrollWidth > node.clientWidth,
      ellipsis: getComputedStyle(node).textOverflow,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(closed.truncated).toBe(true);
    expect(closed.ellipsis).toBe('ellipsis');
    expect(closed.pageOverflow).toBeLessThanOrEqual(0);
    await trigger(page, 'lab').tap();
    const label = options(page, 'lab').first().locator('.fs-label');
    const row = await label.evaluate((node) => ({
      truncated: node.scrollWidth > node.clientWidth,
      ellipsis: getComputedStyle(node).textOverflow
    }));
    expect(row.truncated).toBe(true);
    expect(row.ellipsis).toBe('ellipsis');
    const geo = await geometry(page, 'lab');
    expect(geo.listScrollWidth).toBeLessThanOrEqual(geo.listClientWidth);
  });

  test('long chips truncate inside the control', async ({ page }) => {
    await mount(page, `${STYLE}<div class="field"><label for="lchip">Chips</label><select id="lchip" multiple data-flow-select><option value="a" selected>${LONG}</option><option value="b">Short</option></select></div>`);
    const chip = await root(page, 'lchip').locator('.fs-chip').evaluate((node) => {
      const controlRect = node.closest('.fs-control').getBoundingClientRect();
      const label = node.querySelector('.fs-chip-label');
      return {
        chipRight: node.getBoundingClientRect().right,
        controlRight: controlRect.right,
        labelTruncated: label.scrollWidth > label.clientWidth,
        removeRight: node.querySelector('.fs-chip-remove').getBoundingClientRect().right
      };
    });
    expect(chip.chipRight).toBeLessThanOrEqual(chip.controlRight);
    expect(chip.labelTruncated).toBe(true);
    expect(chip.removeRight).toBeLessThanOrEqual(chip.controlRight);
  });

  test('many chips wrap and the popover moves below the taller control while open', async ({ page }) => {
    await mount(page, `${STYLE}<div class="field"><label for="chips">Tags</label><select id="chips" multiple data-flow-select>${TAGS}</select></div><div class="tall"></div>`);
    await control(page, 'chips').tap();
    const first = await geometry(page, 'chips');
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta']) {
      await tapOption(page, 'chips', name);
    }
    const after = await geometry(page, 'chips');
    expect(after.control.height).toBeGreaterThan(first.control.height + 20);
    expectAttached(after, 'after chips wrapped');
    expectInside(after);
    const overflow = await control(page, 'chips').evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// ---------- containers ----------

test.describe('containers', () => {
  test('inside a modal <dialog>: popover is on top, inside the viewport, tap selects', async ({ page }) => {
    await mount(page, `${STYLE}
      <dialog id="dlg" style="width: min(360px, calc(100vw - 48px)); max-height: 200px; overflow: auto">
        <div class="field"><label for="in-dialog">Priority</label><select id="in-dialog" data-flow-select>${list(12, 'Level')}</select></div>
        <p>Text below.</p>
      </dialog>`);
    await page.evaluate(() => document.getElementById('dlg').showModal());
    await trigger(page, 'in-dialog').tap();
    await expectOpen(page, 'in-dialog');
    const geo = await geometry(page, 'in-dialog');
    expectInside(geo);
    expectAttached(geo);
    expect(await hitTestInside(page, 'in-dialog', -1)).toBe(true);
    await tapOption(page, 'in-dialog', 'Level 5');
    expect(await nativeValue(page, 'in-dialog')).toBe('v5');
    expect(await page.evaluate(() => document.getElementById('dlg').open)).toBe(true);
  });

  test('inside a modal <dialog>: tap elsewhere in the dialog closes the popover but not the dialog', async ({ page }) => {
    await mount(page, `${STYLE}
      <dialog id="dlg" style="width: min(360px, calc(100vw - 48px))"><div class="field"><select id="in-dialog" aria-label="Pick" data-flow-select>${FRUITS}</select></div><p style="height: 260px">Text below.</p></dialog>`);
    await page.evaluate(() => document.getElementById('dlg').showModal());
    await trigger(page, 'in-dialog').tap();
    await expectOpen(page, 'in-dialog');
    const box = await page.locator('#dlg').boundingBox();
    await page.touchscreen.tap(box.x + box.width - 10, box.y + box.height - 10);
    await expectOpen(page, 'in-dialog', false);
    expect(await page.evaluate(() => document.getElementById('dlg').open)).toBe(true);
  });

  test('inside overflow: hidden the popover escapes the clip', async ({ page }) => {
    await mount(page, `${STYLE}
      <div style="height: 60px; overflow: hidden; border: 1px solid #ccc; padding: 8px">
        <div class="field"><select id="clipped" aria-label="Clipped" data-flow-select>${list(8)}</select></div>
      </div>`);
    await trigger(page, 'clipped').tap();
    const geo = await geometry(page, 'clipped');
    expect(geo.pop.height).toBeGreaterThan(150);
    expect(await hitTestInside(page, 'clipped', -1)).toBe(true);
    await tapOption(page, 'clipped', 'Option 8');
    expect(await nativeValue(page, 'clipped')).toBe('v8');
  });

  test('inside a transformed, clipped container the popover is positioned against the viewport', async ({ page }) => {
    await mount(page, `${STYLE}
      <div style="transform: translate(12px, 30px) scale(0.98); overflow: hidden; height: 80px; contain: paint; width: calc(100% - 24px)">
        <div class="field"><select id="moved" aria-label="Moved" data-flow-select>${list(6)}</select></div>
      </div>`);
    await trigger(page, 'moved').tap();
    const geo = await geometry(page, 'moved');
    expectAttached(geo);
    expectInside(geo);
    expect(await hitTestInside(page, 'moved', -1)).toBe(true);
    await tapOption(page, 'moved', 'Option 6');
    expect(await nativeValue(page, 'moved')).toBe('v6');
  });

  test.describe('bootstrap 5', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/tests/fixtures/bootstrap.html');
      await page.waitForFunction(() => window.fixtureReady === true && window.bootstrap);
    });

    async function openModal(page) {
      await page.locator('#open-modal').tap();
      await page.waitForFunction(() => document.querySelector('#demo-modal').classList.contains('show'));
      await settle(page, 6);
    }

    test('modal: search select and multiple open on top, tap selects, the modal stays open', async ({ page }) => {
      await openModal(page);
      await trigger(page, 'modal-select').tap();
      await expectOpen(page, 'modal-select');
      const geo = await geometry(page, 'modal-select');
      expectInside(geo);
      expectAttached(geo);
      expect(await hitTestInside(page, 'modal-select', -1)).toBe(true);
      await tapOption(page, 'modal-select', 'Urgent');
      expect(await nativeValue(page, 'modal-select')).toBe('urgent');
      await expectOpen(page, 'modal-select', false);

      await control(page, 'modal-tags').tap();
      await expectOpen(page, 'modal-tags');
      expect(await hitTestInside(page, 'modal-tags', -1)).toBe(true);
      await tapOption(page, 'modal-tags', 'Gamma');
      await expectOpen(page, 'modal-tags');
      expect(await nativeValue(page, 'modal-tags')).toEqual(['c']);
      await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    });

    test('modal: tap elsewhere in the modal closes the popover but not the modal', async ({ page }) => {
      await openModal(page);
      await trigger(page, 'modal-select').tap();
      await expectOpen(page, 'modal-select');
      await page.locator('#demo-modal-title').tap();
      await expectOpen(page, 'modal-select', false);
      await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    });

    test('modal: the popover follows the control when the modal body scrolls', async ({ page }) => {
      await openModal(page);
      await trigger(page, 'modal-select').tap();
      const before = await geometry(page, 'modal-select');
      await page.evaluate(() => {
        document.querySelector('#demo-modal .modal-body').scrollTop = 30;
      });
      const after = await geometry(page, 'modal-select');
      expect(after.control.top).toBeLessThan(before.control.top - 10);
      expectAttached(after);
    });

    test('offcanvas: tap opens, the popover is inside the viewport, tap selects', async ({ page }) => {
      await page.locator('#open-offcanvas').tap();
      await page.waitForFunction(() => document.querySelector('#demo-offcanvas').classList.contains('show'));
      await settle(page, 6);
      await trigger(page, 'offcanvas-select').tap();
      await expectOpen(page, 'offcanvas-select');
      const geo = await geometry(page, 'offcanvas-select');
      expectInside(geo);
      expectAttached(geo);
      expect(await hitTestInside(page, 'offcanvas-select', -1)).toBe(true);
      await tapOption(page, 'offcanvas-select', 'Published');
      expect(await nativeValue(page, 'offcanvas-select')).toBe('published');
      await expect(page.locator('#demo-offcanvas')).toHaveClass(/show/);
    });
  });
});

// ---------- demo page ----------

test.describe('demo at 320px', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  // BUG: Demo keyboard table overflows the page at 320px (demo markup, not the library)
  test('no horizontal page scroll', async ({ page }) => {
    await openDemo(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('no select control is wider than the screen and popovers stay inside it', async ({ page }) => {
    await openDemo(page);
    const offenders = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll('.fs'))
        .filter((node) => node.getBoundingClientRect().right > width + 0.5)
        .map((node) => node.querySelector('select').id);
    });
    expect(offenders).toEqual([]);
    const before = await page.evaluate(() => document.documentElement.scrollWidth);
    for (const id of ['workspace', 'sort-by', 'tier', 'tags', 'rtl']) {
      if (id === 'tags') {
        await chipInput(page, id).tap();
      } else {
        await trigger(page, id).tap();
      }
      await expectOpen(page, id);
      const geo = await geometry(page, id);
      expectInside(geo, id);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), id).toBeLessThanOrEqual(before);
      await tapEmpty(page);
      await expectOpen(page, id, false);
    }
  });

  test('demo scroll box and dialog work by touch', async ({ page }) => {
    await openDemo(page);
    await trigger(page, 'in-scroll').tap();
    await expectOpen(page, 'in-scroll');
    const geo = await geometry(page, 'in-scroll');
    expectInside(geo);
    expectAttached(geo);
    await tapEmpty(page);
    await page.locator('#open-dialog').tap();
    await expect(page.locator('#demo-dialog')).toBeVisible();
    await trigger(page, 'dialog-select').tap();
    await expectOpen(page, 'dialog-select');
    expectInside(await geometry(page, 'dialog-select'));
    expect(await hitTestInside(page, 'dialog-select', -1)).toBe(true);
  });
});

// ---------- screenshots ----------

for (const theme of ['light', 'dark']) {
  test(`screenshots (${theme})`, async ({ page }, info) => {
    test.setTimeout(60000);
    mkdirSync(SHOTS, { recursive: true });
    const prefix = `${SHOTS}/${info.project.name}-${theme}`;
    await page.goto(`/demo/?theme=${theme}`);
    await page.waitForFunction(() => window.FlowSelect && document.querySelectorAll('.fs').length >= 34);
    await page.evaluate(() => document.querySelector('#fields').scrollIntoView());
    await settle(page);
    await page.screenshot({ path: `${prefix}-01-closed-form.png` });

    const shoot = async (id, name, open) => {
      await root(page, id).scrollIntoViewIfNeeded();
      await open();
      await expectOpen(page, id);
      await settle(page);
      await page.screenshot({ path: `${prefix}-${name}.png` });
      await tapEmpty(page);
      await expectOpen(page, id, false);
    };

    await shoot('category', '02-field-open', () => trigger(page, 'category').tap());
    await shoot('source', '03-pill-open', () => trigger(page, 'source').tap());
    await shoot('workspace', '04-pill-search-open', () => trigger(page, 'workspace').tap());
    await shoot('group-by', '05-ghost-open', () => trigger(page, 'group-by').tap());
    await shoot('fruit-dropdown', '06-dropdown-search-open', () => trigger(page, 'fruit-dropdown').tap());
    await shoot('fruit-inline', '07-inline-typing', async () => {
      await trigger(page, 'fruit-inline').tap();
      await page.keyboard.type('ap');
    });
    await page.evaluate(() => window.FlowSelect.get('#tags').setValue(['design', 'javascript', 'css', 'a11y', 'jamstack']));
    await shoot('tags', '08-multiple-chips', () => chipInput(page, 'tags').tap());
    await shoot('tier', '09-descriptions', () => trigger(page, 'tier').tap());
    await shoot('author', '10-avatars', () => trigger(page, 'author').tap());
  });
}



