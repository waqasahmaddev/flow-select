import { test, expect } from '@playwright/test';
import { mount, root, control, trigger, popover, options, nativeValue, expectOpen } from './helpers.js';

const LISTENER_TRACKER = () => {
  const active = new Map();
  const ids = new WeakMap();
  let sequence = 0;
  const idOf = (listener) => {
    if (!ids.has(listener)) {
      sequence += 1;
      ids.set(listener, sequence);
    }
    return ids.get(listener);
  };
  const nameOf = (target) => {
    if (target === window) {
      return 'window';
    }
    if (target === document) {
      return 'document';
    }
    if (window.visualViewport && target === window.visualViewport) {
      return 'visualViewport';
    }
    return null;
  };
  const keyOf = (target, type, listener, options) => {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    return `${target}|${type}|${idOf(listener)}|${capture}`;
  };
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const target = nameOf(this);
    const once = typeof options === 'object' && options?.once;
    if (target && listener && !once) {
      const signal = typeof options === 'object' ? options?.signal : undefined;
      if (!signal?.aborted) {
        const key = keyOf(target, type, listener, options);
        active.set(key, `${target}:${type}`);
        signal?.addEventListener('abort', () => active.delete(key), { once: true });
      }
    }
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const target = nameOf(this);
    if (target && listener) {
      active.delete(keyOf(target, type, listener, options));
    }
    return remove.call(this, type, listener, options);
  };
  window.globalListeners = () => Array.from(active.values()).sort();
};

async function setup(page, html = '') {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(LISTENER_TRACKER);
  await mount(page, html);
  return errors;
}

const frames = (page, count = 2) => page.evaluate((count) => new Promise((resolve) => {
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

test('empty select opens, shows "No results" and keeps an empty value', async ({ page }) => {
  const errors = await setup(page, '<form id="f"><select id="empty" name="empty" data-flow-select></select></form>');
  await trigger(page, 'empty').click();
  await expectOpen(page, 'empty');
  await expect(options(page, 'empty')).toHaveCount(0);
  await expect(popover(page, 'empty').locator('.fs-status')).toHaveText('No results');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expectOpen(page, 'empty', false);
  expect(await nativeValue(page, 'empty')).toBe('');
  expect(await page.evaluate(() => [...new FormData(document.getElementById('f')).keys()])).toEqual([]);
  expect(errors).toEqual([]);
});

test('select with only a placeholder', async ({ page }) => {
  const errors = await setup(page, '<select id="ph" name="ph" data-flow-select><option value="">Choose one</option></select>');
  await expect(root(page, 'ph').locator('.fs-value')).toHaveText('Choose one');
  await trigger(page, 'ph').click();
  await expectOpen(page, 'ph');
  await expect(options(page, 'ph')).toHaveCount(1);
  await page.keyboard.press('Enter');
  expect(await nativeValue(page, 'ph')).toBe('');
  expect(await page.evaluate(() => window.FlowSelect.get('#ph').value)).toBe('');
  expect(errors).toEqual([]);
});

test('all options disabled: nothing becomes active or selectable', async ({ page }) => {
  const errors = await setup(page, `
    <select id="off" name="off" data-flow-select>
      <option value="a" disabled>Alpha</option>
      <option value="b" disabled>Beta</option>
      <optgroup label="Group" disabled><option value="c">Gamma</option></optgroup>
    </select>`);
  const before = await nativeValue(page, 'off');
  await trigger(page, 'off').click();
  await expectOpen(page, 'off');
  await expect(options(page, 'off')).toHaveCount(3);
  for (const key of ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'Enter']) {
    await page.keyboard.press(key);
  }
  await expect(popover(page, 'off').locator('.fs-option.is-active')).toHaveCount(0);
  await options(page, 'off').nth(1).click({ force: true });
  await options(page, 'off').nth(2).click({ force: true });
  expect(await nativeValue(page, 'off')).toBe(before);
  expect(await page.evaluate(() => document.querySelector('.fs-input, .fs-trigger').hasAttribute('aria-activedescendant'))).toBe(false);
  expect(errors).toEqual([]);
});

test('duplicate values do not break selection or the native value', async ({ page }) => {
  const errors = await setup(page, `
    <select id="dup" name="dup" data-flow-select>
      <option value="1">One</option>
      <option value="2">Two A</option>
      <option value="2">Two B</option>
      <option value="3">Three</option>
    </select>`);
  await trigger(page, 'dup').click();
  await options(page, 'dup').nth(2).click();
  expect(await nativeValue(page, 'dup')).toBe('2');
  await trigger(page, 'dup').click();
  await options(page, 'dup').nth(3).click();
  expect(await nativeValue(page, 'dup')).toBe('3');
  const state = await page.evaluate(() => {
    const select = document.getElementById('dup');
    return { selectedCount: Array.from(select.options).filter((option) => option.selected).length, value: window.FlowSelect.get(select).value };
  });
  expect(state).toEqual({ selectedCount: 1, value: '3' });
  expect(errors).toEqual([]);
});

test('"01" and "1" stay distinct values', async ({ page }) => {
  const errors = await setup(page, `
    <select id="num" name="num" data-flow-select>
      <option value="1">One</option>
      <option value="01">Zero one</option>
      <option value="1.0">One point zero</option>
    </select>`);
  const result = await page.evaluate(() => {
    const instance = window.FlowSelect.get('#num');
    const seen = [];
    for (const value of ['01', 1, '1.0', '1']) {
      instance.setValue(value);
      seen.push([instance.value, document.getElementById('num').value, document.querySelector('.fs-value').textContent]);
    }
    return seen;
  });
  expect(result).toEqual([
    ['01', '01', 'Zero one'],
    ['1', '1', 'One'],
    ['1.0', '1.0', 'One point zero'],
    ['1', '1', 'One']
  ]);
  await trigger(page, 'num').click();
  await options(page, 'num').nth(1).click();
  expect(await nativeValue(page, 'num')).toBe('01');
  expect(errors).toEqual([]);
});

test('very long labels do not overflow the page', async ({ page }) => {
  const long = 'Long label '.repeat(200) + 'END';
  const word = 'x'.repeat(3000);
  const errors = await setup(page, '');
  await page.evaluate(({ long, word }) => {
    document.getElementById('app').innerHTML = '<div class="field"><select id="long" name="long" data-flow-select></select></div><div class="field"><select id="longm" name="longm" multiple data-flow-select></select></div>';
    for (const id of ['long', 'longm']) {
      const select = document.getElementById(id);
      select.append(new Option(long, 'a', true, true), new Option(word, 'b', false, id === 'longm'), new Option('Short', 'c'));
    }
    window.FlowSelect.init(document.getElementById('app'));
  }, { long, word });
  const fieldWidth = await page.locator('.field').first().evaluate((node) => node.getBoundingClientRect().width);
  for (const id of ['long', 'longm']) {
    await page.evaluate((id) => window.FlowSelect.get(`#${id}`).open(), id);
    await expectOpen(page, id);
    const box = await popover(page, id).boundingBox();
    const viewport = page.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    const controlWidth = await control(page, id).evaluate((node) => node.getBoundingClientRect().width);
    expect(controlWidth).toBeLessThanOrEqual(fieldWidth + 1);
    await page.keyboard.press('Escape');
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('emoji, RTL and diacritics in options and query', async ({ page }) => {
  const errors = await setup(page, `
    <select id="intl" name="intl" data-flow-select data-fs-search="true">
      <option value="pizza">Pizza 🍕</option>
      <option value="family">Family 👨‍👩‍👧</option>
      <option value="ar">مرحبا بالعالم</option>
      <option value="he">שלום עולם</option>
      <option value="cafe">Café crème</option>
      <option value="jp">東京タワー</option>
    </select>`);
  const input = root(page, 'intl').locator('.fs-input');
  const cases = [['🍕', ['Pizza 🍕']], ['👨‍👩‍👧', ['Family 👨‍👩‍👧']], ['مرحبا', ['مرحبا بالعالم']], ['עולם', ['שלום עולם']], ['cafe creme', ['Café crème']], ['CRÈME', ['Café crème']], ['タワー', ['東京タワー']]];
  for (const [query, expected] of cases) {
    await input.fill(query);
    await expect(options(page, 'intl').locator('.fs-label')).toHaveText(expected);
  }
  await page.keyboard.press('Enter');
  expect(await nativeValue(page, 'intl')).toBe('jp');
  expect(errors).toEqual([]);
});

test('regex special characters and whitespace-only queries', async ({ page }) => {
  const errors = await setup(page, `
    <select id="rx" name="rx" data-flow-select data-fs-search="true">
      <option value="a">C++ (language)</option>
      <option value="b">a.b*c?</option>
      <option value="c">[brackets] {braces} $dollar ^caret |pipe \\back</option>
      <option value="d">Plain</option>
    </select>`);
  const input = root(page, 'rx').locator('.fs-input');
  const cases = [['c++', 1], ['(', 1], ['.', 1], ['*', 1], ['?', 1], ['[', 1], ['{braces}', 1], ['$', 1], ['^', 1], ['|', 1], ['\\', 1], ['.*', 0], ['(?:', 0], ['[^a]', 0]];
  for (const [query, count] of cases) {
    await input.fill(query);
    await expect(options(page, 'rx'), `query ${query}`).toHaveCount(count);
  }
  await input.fill('   ');
  await expect(options(page, 'rx')).toHaveCount(4);
  await expect(popover(page, 'rx').locator('.fs-status')).toBeHidden();
  await input.fill(' \t ');
  await expect(options(page, 'rx')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('options replaced while open (native DOM and setOptions)', async ({ page }) => {
  const errors = await setup(page, '<select id="swap" name="swap" data-flow-select><option value="a">Alpha</option><option value="b">Beta</option></select>');
  await trigger(page, 'swap').click();
  await expectOpen(page, 'swap');
  await page.evaluate(() => {
    const select = document.getElementById('swap');
    select.textContent = '';
    for (let index = 1; index <= 5; index += 1) {
      select.append(new Option(`New ${index}`, `n${index}`));
    }
  });
  await expect(options(page, 'swap')).toHaveText(['New 1', 'New 2', 'New 3', 'New 4', 'New 5']);
  await expectOpen(page, 'swap');
  await page.evaluate(() => window.FlowSelect.get('#swap').setOptions([{ value: 'x', label: 'Xray' }, { value: 'y', label: 'Yankee' }], { keepSelection: false }));
  await expect(options(page, 'swap')).toHaveText(['Xray', 'Yankee']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expectOpen(page, 'swap', false);
  expect(['x', 'y']).toContain(await nativeValue(page, 'swap'));
  await page.evaluate(() => {
    const instance = window.FlowSelect.get('#swap');
    instance.open();
    document.getElementById('swap').textContent = '';
  });
  await expect(options(page, 'swap')).toHaveCount(0);
  await expect(popover(page, 'swap').locator('.fs-status')).toHaveText('No results');
  expect(await page.evaluate(() => window.FlowSelect.get('#swap').value)).toBe('');
  expect(errors).toEqual([]);
});

test('rapid open/close/toggle spam ends in a consistent state', async ({ page }) => {
  const errors = await setup(page, '<div class="field" style="margin-bottom: 160px"><select id="a" name="a" data-flow-select><option>One</option><option>Two</option></select></div><div class="field"><select id="b" name="b" data-flow-select data-fs-search="true"><option>Three</option><option>Four</option></select></div>');
  const baseline = await page.evaluate(() => window.globalListeners());
  const result = await page.evaluate(async () => {
    const a = window.FlowSelect.get('#a');
    const b = window.FlowSelect.get('#b');
    const all = [a, b];
    for (let index = 0; index < 500; index += 1) {
      const target = all[index % 2];
      const action = index % 5;
      if (action === 0) {
        target.open();
      } else if (action === 1) {
        target.toggle();
      } else if (action === 2) {
        target.close();
      } else if (action === 3) {
        target.toggle();
        target.toggle();
      } else {
        target.open();
        target.open();
      }
      if (index % 50 === 0) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    const openCount = all.filter((instance) => instance.isOpen).length;
    return { openCount, popoversOpen: document.querySelectorAll(':popover-open').length, listeners: window.globalListeners() };
  });
  expect(result.openCount).toBeLessThanOrEqual(1);
  expect(result.popoversOpen).toBe(result.openCount);
  for (let round = 0; round < 15; round += 1) {
    await control(page, round % 2 ? 'a' : 'b').click();
  }
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expectOpen(page, 'a', false);
  await expectOpen(page, 'b', false);
  expect(await page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(0);
  expect(await page.evaluate(() => window.globalListeners())).toEqual(baseline);
  expect(errors).toEqual([]);
});

test('resize spam while open keeps the popover attached and inside the viewport', async ({ page }) => {
  const errors = await setup(page, '<div style="padding-top: 200px"><select id="rs" name="rs" data-flow-select></select></div>');
  await page.evaluate(() => {
    const select = document.getElementById('rs');
    for (let index = 1; index <= 60; index += 1) {
      select.append(new Option(`Option ${index}`, String(index)));
    }
    window.FlowSelect.get(select).refresh();
  });
  await trigger(page, 'rs').click();
  await expectOpen(page, 'rs');
  await page.evaluate(() => {
    for (let index = 0; index < 500; index += 1) {
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('scroll'));
    }
  });
  const sizes = [[900, 700], [400, 500], [1200, 400], [320, 640], [1000, 300], [800, 900]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
  }
  await frames(page, 3);
  await expectOpen(page, 'rs');
  const geometry = await page.evaluate(() => {
    const pop = document.querySelector('.fs-popover').getBoundingClientRect();
    const anchor = document.querySelector('.fs-control').getBoundingClientRect();
    return { pop: { top: pop.top, bottom: pop.bottom, left: pop.left, right: pop.right }, anchor: { top: anchor.top, bottom: anchor.bottom, left: anchor.left }, vw: document.documentElement.clientWidth, vh: window.innerHeight };
  });
  expect(geometry.pop.left).toBeGreaterThanOrEqual(0);
  expect(geometry.pop.right).toBeLessThanOrEqual(geometry.vw + 1);
  expect(geometry.pop.top).toBeGreaterThanOrEqual(0);
  expect(geometry.pop.bottom).toBeLessThanOrEqual(geometry.vh + 1);
  const attached = Math.abs(geometry.pop.top - geometry.anchor.bottom) < 20 || Math.abs(geometry.pop.bottom - geometry.anchor.top) < 20;
  expect(attached).toBe(true);
  expect(errors).toEqual([]);
});

// BUG: a visualViewport "scroll" event (pinch zoom, mobile keyboard) throws in the reposition handler instead of repositioning
test('visualViewport scroll while open repositions without errors', async ({ page }) => {
  const errors = await setup(page, '<select id="vv" name="vv" data-flow-select><option>One</option><option>Two</option></select>');
  await trigger(page, 'vv').click();
  await expectOpen(page, 'vv');
  const thrown = await page.evaluate(() => {
    const before = window.onerror;
    const caught = [];
    window.onerror = (message) => {
      caught.push(String(message));
      return true;
    };
    window.visualViewport.dispatchEvent(new Event('scroll'));
    window.visualViewport.dispatchEvent(new Event('resize'));
    window.onerror = before;
    return caught;
  });
  await frames(page, 2);
  await expectOpen(page, 'vv');
  expect(thrown).toEqual([]);
  expect(errors).toEqual([]);
});

// BUG: removing an open select from the DOM leaves it "open" with document/window listeners attached until the next user interaction
test('select removed from the DOM while open: no errors, popover gone, listeners cleaned', async ({ page }) => {
  const errors = await setup(page, '<div class="field" style="margin-bottom: 160px"><select id="gone" name="gone" data-flow-select><option>One</option><option>Two</option></select></div><div class="field"><select id="other" name="other" data-flow-select><option>Three</option></select></div>');
  await page.evaluate(() => {
    window.FlowSelect.get('#gone').close();
  });
  const baseline = await page.evaluate(() => window.globalListeners());
  await trigger(page, 'gone').click();
  await expectOpen(page, 'gone');
  await page.evaluate(() => {
    window.goneInstance = window.FlowSelect.get('#gone');
    document.querySelector('.fs:has(> #gone)').remove();
  });
  await frames(page, 3);
  const state = await page.evaluate(() => ({
    popoversOpen: document.querySelectorAll(':popover-open').length,
    isOpen: window.goneInstance.isOpen,
    listeners: window.globalListeners()
  }));
  expect(state.popoversOpen).toBe(0);
  expect(errors).toEqual([]);
  await trigger(page, 'other').click();
  await expectOpen(page, 'other');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  expect(state.isOpen).toBe(false);
  expect(state.listeners.filter((entry) => !entry.endsWith(':pageshow'))).toEqual(baseline.filter((entry) => !entry.endsWith(':pageshow')));
});

test('new FlowSelect(notASelect) throws a clear TypeError', async ({ page }) => {
  await setup(page, '<div id="div"></div><input id="input">');
  const results = await page.evaluate(() => {
    const attempts = [() => new window.FlowSelect(document.getElementById('div')), () => new window.FlowSelect('#missing'), () => new window.FlowSelect(null), () => new window.FlowSelect(undefined), () => new window.FlowSelect(document.getElementById('input')), () => new window.FlowSelect({})];
    return attempts.map((attempt) => {
      try {
        attempt();
        return 'no error';
      } catch (error) {
        return `${error.constructor.name}: ${error.message}`;
      }
    });
  });
  for (const result of results) {
    expect(result).toMatch(/^TypeError: .*<select>/);
  }
  expect(await page.evaluate(() => window.FlowSelect.get('#missing'))).toBeNull();
  expect(await page.evaluate(() => window.FlowSelect.init(null))).toEqual([]);
});

test('every public method after destroy() does not throw and leaves the native select restored', async ({ page }) => {
  const errors = await setup(page, '<form id="f"><select id="d1" name="d1" data-flow-select><option value="a">A</option><option value="b">B</option></select><select id="d2" name="d2" multiple data-flow-select data-fs-create="true"><option value="a" selected>A</option><option value="b">B</option></select></form>');
  const baseline = await page.evaluate(() => {
    window.FlowSelect.destroy(document.getElementById('app'));
    return window.globalListeners();
  });
  await mount(page, '<form id="f"><select id="d1" name="d1" data-flow-select><option value="a">A</option><option value="b">B</option></select><select id="d2" name="d2" multiple data-flow-select data-fs-create="true"><option value="a" selected>A</option><option value="b">B</option></select></form>');
  const result = await page.evaluate(() => {
    const outcomes = {};
    for (const id of ['d1', 'd2']) {
      const select = document.getElementById(id);
      const instance = window.FlowSelect.get(select);
      instance.open();
      instance.destroy();
      const calls = {
        open: () => instance.open(),
        close: () => instance.close(),
        toggle: () => instance.toggle(),
        focus: () => instance.focus(),
        clear: () => instance.clear(),
        setValue: () => instance.setValue('b'),
        valueSetter: () => {
          instance.value = 'a';
        },
        value: () => instance.value,
        selectedItems: () => instance.selectedItems,
        isOpen: () => instance.isOpen,
        disabled: () => instance.disabled,
        addOption: () => instance.addOption({ value: 'z', label: 'Zed' }),
        removeOption: () => instance.removeOption('z'),
        setOptions: () => instance.setOptions([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]),
        refresh: () => instance.refresh(),
        reload: () => instance.reload(),
        enable: () => instance.enable(),
        disable: () => instance.disable(),
        enableAgain: () => instance.enable(),
        destroyAgain: () => instance.destroy()
      };
      const thrown = [];
      for (const [name, call] of Object.entries(calls)) {
        try {
          call();
        } catch (error) {
          thrown.push(`${name}: ${error.message}`);
        }
      }
      outcomes[id] = {
        thrown,
        isOpen: instance.isOpen,
        restored: select.parentElement.id === 'f' && !select.classList.contains('fs-native') && !select.hasAttribute('aria-hidden') && !select.hasAttribute('tabindex'),
        registered: window.FlowSelect.get(select) !== null
      };
    }
    return { outcomes, wrappers: document.querySelectorAll('.fs').length, popoversOpen: document.querySelectorAll(':popover-open').length, listeners: window.globalListeners() };
  });
  for (const id of ['d1', 'd2']) {
    expect(result.outcomes[id]).toEqual({ thrown: [], isOpen: false, restored: true, registered: false });
  }
  expect(result.wrappers).toBe(0);
  expect(result.popoversOpen).toBe(0);
  expect(result.listeners).toEqual(baseline);
  expect(errors).toEqual([]);
});

test('init twice returns the same instance and re-init after destroy works', async ({ page }) => {
  const errors = await setup(page, '<select id="re" name="re" data-flow-select><option value="a">A</option><option value="b" selected>B</option></select>');
  const result = await page.evaluate(() => {
    const select = document.getElementById('re');
    const first = window.FlowSelect.get(select);
    const again = new window.FlowSelect(select);
    const fromInit = window.FlowSelect.init(document.getElementById('app'))[0];
    first.destroy();
    const fresh = new window.FlowSelect(select);
    return { same: first === again && again === fromInit, fresh: fresh !== first, wrappers: document.querySelectorAll('.fs').length, value: fresh.value };
  });
  expect(result).toEqual({ same: true, fresh: true, wrappers: 1, value: 'b' });
  expect(errors).toEqual([]);
});

test('only one popover is in the top layer when switching between selects', async ({ page }) => {
  const errors = await setup(page, '<div class="field" style="margin-bottom: 120px"><select id="p1" data-flow-select><option>A</option></select></div><div class="field" style="margin-bottom: 120px"><select id="p2" data-flow-select><option>B</option></select></div><div class="field"><select id="p3" data-flow-select data-fs-search="true"><option>C</option></select></div>');
  for (const id of ['p1', 'p2', 'p3', 'p1', 'p3']) {
    await control(page, id).click();
    await expectOpen(page, id);
    expect(await page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(1);
  }
  await page.keyboard.press('Tab');
  await expect(page.locator('.fs-popover:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});
