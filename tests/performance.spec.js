import { test, expect } from '@playwright/test';
import { mount, root, popover } from './helpers.js';

test.describe.configure({ mode: 'default' });

const PAGE_TOOLS = () => {
  window.perf = {
    frame: () => new Promise((resolve) => requestAnimationFrame(resolve)),
    paint: () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))),
    makeSelect({ id, count, multiple = false, selected = 0, prefix = 'Item', parent = null }) {
      const select = document.createElement('select');
      select.id = id;
      select.name = id;
      select.multiple = multiple;
      const fragment = document.createDocumentFragment();
      for (let index = 1; index <= count; index += 1) {
        fragment.append(new Option(`${prefix} ${index}`, String(index), false, index <= selected));
      }
      select.append(fragment);
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.append(select);
      (parent ?? document.getElementById('app')).append(wrap);
      return select;
    },
    longTasks: [],
    watchLongTasks() {
      window.perf.longTasks = [];
      if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        return false;
      }
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.perf.longTasks.push(Math.round(entry.duration));
        }
      }).observe({ type: 'longtask' });
      return true;
    }
  };
};

const isChrome = (testInfo) => testInfo.project.name === 'chrome';

const THROTTLED_FACTOR = 12;

function budget(ms, rate) {
  return rate === 1 ? ms : ms * THROTTLED_FACTOR;
}

function rates(testInfo) {
  return isChrome(testInfo) ? [1, 4] : [1];
}

function report(testInfo, name, rate, values) {
  const parts = Object.entries(values).map(([key, value]) => `${key}=${typeof value === 'number' ? value.toFixed(1) : JSON.stringify(value)}`);
  console.log(`PERF| ${testInfo.project.name} | x${rate} | ${name} | ${parts.join(' ')}`);
}

async function setup(page, testInfo, rate) {
  await page.addInitScript(PAGE_TOOLS);
  await mount(page, '');
  if (isChrome(testInfo)) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    return cdp;
  }
  return null;
}

for (const rate of [1, 4]) {
  test.describe(`timing x${rate}`, () => {
    test.beforeEach(async ({}, testInfo) => {
      test.skip(!rates(testInfo).includes(rate), 'CPU throttling needs CDP (chrome only)');
    });

    test('init one 10k select', async ({ page }, testInfo) => {
      await setup(page, testInfo, rate);
      const result = await page.evaluate(async () => {
        const select = window.perf.makeSelect({ id: 'big', count: 10000 });
        await window.perf.paint();
        const start = performance.now();
        new window.FlowSelect(select);
        const sync = performance.now() - start;
        await window.perf.paint();
        return { sync, paint: performance.now() - start, popoverBuilt: Boolean(document.querySelector('.fs-popover')) };
      });
      report(testInfo, 'init 10k', rate, result);
      expect(result.popoverBuilt).toBe(false);
      expect(result.sync).toBeLessThan(budget(150, rate));
    });

    test('init 200 small selects', async ({ page }, testInfo) => {
      await setup(page, testInfo, rate);
      const result = await page.evaluate(async () => {
        const host = document.createElement('div');
        document.getElementById('app').append(host);
        for (let index = 0; index < 200; index += 1) {
          const select = window.perf.makeSelect({ id: `s${index}`, count: 6, parent: host });
          select.setAttribute('data-flow-select', '');
        }
        await window.perf.paint();
        const start = performance.now();
        const instances = window.FlowSelect.init(host);
        const sync = performance.now() - start;
        await window.perf.paint();
        return { count: instances.length, sync, paint: performance.now() - start, perSelect: sync / instances.length };
      });
      report(testInfo, 'init 200 small', rate, result);
      expect(result.count).toBe(200);
      expect(result.sync).toBeLessThan(budget(250, rate));
    });

    test('first open of 10k', async ({ page }, testInfo) => {
      await setup(page, testInfo, rate);
      const result = await page.evaluate(async () => {
        const select = window.perf.makeSelect({ id: 'big', count: 10000 });
        const instance = new window.FlowSelect(select);
        await window.perf.paint();
        const start = performance.now();
        instance.open();
        const sync = performance.now() - start;
        await window.perf.paint();
        const paint = performance.now() - start;
        const pop = document.querySelector('.fs-popover');
        return { sync, paint, visible: pop.matches(':popover-open') && pop.offsetHeight > 0, rows: pop.querySelectorAll('.fs-option').length };
      });
      report(testInfo, 'first open 10k', rate, result);
      expect(result.visible).toBe(true);
      expect(result.rows).toBeLessThanOrEqual(100);
      expect(result.sync).toBeLessThan(budget(60, rate));
      expect(result.paint).toBeLessThan(budget(150, rate));
    });

    test('typing a query char by char into 10k', async ({ page }, testInfo) => {
      await setup(page, testInfo, rate);
      await page.evaluate(() => {
        const select = window.perf.makeSelect({ id: 'big', count: 10000 });
        new window.FlowSelect(select);
      });
      const input = root(page, 'big').locator('.fs-input');
      await input.focus();
      const hasLongTasks = await page.evaluate(() => window.perf.watchLongTasks());
      const timings = await page.evaluate(async () => {
        const input = document.querySelector('.fs-input');
        const query = 'item 9999';
        const result = [];
        input.value = '';
        for (const char of query) {
          input.value += char;
          const start = performance.now();
          input.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
          const sync = performance.now() - start;
          await window.perf.paint();
          result.push({ char, sync, paint: performance.now() - start });
        }
        return result;
      });
      const sync = timings.map((entry) => entry.sync);
      const paint = timings.map((entry) => entry.paint);
      const longTasks = await page.evaluate(() => window.perf.longTasks.slice());
      report(testInfo, 'typing 10k (synthetic input)', rate, {
        firstChar: sync[0], maxSync: Math.max(...sync), avgSync: sync.reduce((a, b) => a + b, 0) / sync.length, maxPaint: Math.max(...paint), longTasks
      });
      await expect(popover(page, 'big').locator('.fs-option')).toHaveCount(1);
      await expect(popover(page, 'big').locator('.fs-option')).toHaveText('Item 9999');
      expect(Math.max(...sync)).toBeLessThan(budget(50, rate));

      await page.evaluate(() => window.perf.watchLongTasks());
      await input.fill('');
      await input.pressSequentially('item 50', { delay: 20 });
      await expect(popover(page, 'big').locator('.fs-option').first()).toHaveText('Item 50');
      const realLongTasks = await page.evaluate(() => window.perf.longTasks.slice());
      report(testInfo, 'typing 10k (real keyboard)', rate, { longTasks: realLongTasks, supported: hasLongTasks });
      if (hasLongTasks && rate === 1) {
        expect(realLongTasks.filter((duration) => duration > 50)).toEqual([]);
      }
    });

    // End on 10k renders every row up to the end; true virtualisation would be needed to be faster
    test('End and Home keys on 10k', async ({ page }, testInfo) => {
      await setup(page, testInfo, rate);
      const result = await page.evaluate(async () => {
        const select = window.perf.makeSelect({ id: 'big', count: 10000 });
        const instance = new window.FlowSelect(select);
        instance.open();
        await window.perf.paint();
        const input = document.querySelector('.fs-input');
        const press = async (key) => {
          const start = performance.now();
          input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          const sync = performance.now() - start;
          await window.perf.paint();
          return { sync, paint: performance.now() - start };
        };
        const end = await press('End');
        const active = document.querySelector('.fs-option.is-active');
        const list = document.querySelector('.fs-list');
        const listRect = list.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const renderedAfterEnd = list.querySelectorAll('.fs-option').length;
        const home = await press('Home');
        const endAgain = await press('End');
        return {
          endSync: end.sync,
          endPaint: end.paint,
          homeSync: home.sync,
          endAgainSync: endAgain.sync,
          activeText: active.textContent,
          activeVisible: activeRect.top >= listRect.top - 1 && activeRect.bottom <= listRect.bottom + 1,
          renderedAfterEnd
        };
      });
      report(testInfo, 'End/Home 10k', rate, result);
      expect(result.activeText).toBe('Item 10000');
      expect(result.activeVisible).toBe(true);
      expect(result.endPaint).toBeLessThan(budget(900, rate));
    });

    test('scrolling through 10k', async ({ page }, testInfo) => {
      test.setTimeout(180000);
      await setup(page, testInfo, rate);
      const result = await page.evaluate(async () => {
        const select = window.perf.makeSelect({ id: 'big', count: 10000 });
        const instance = new window.FlowSelect(select);
        instance.open();
        await window.perf.paint();
        const list = document.querySelector('.fs-list');
        const handler = [];
        let started = 0;
        window.addEventListener('scroll', (event) => {
          if (event.target === list) {
            started = performance.now();
          }
        }, { capture: true });
        list.addEventListener('scroll', () => {
          handler.push(performance.now() - started);
        });
        const steps = [];
        const start = performance.now();
        let rendered = list.querySelectorAll('.fs-option').length;
        while (rendered < 10000 && steps.length < 400) {
          const before = performance.now();
          list.scrollTop = list.scrollHeight;
          await window.perf.frame();
          await window.perf.frame();
          steps.push(performance.now() - before);
          rendered = list.querySelectorAll('.fs-option').length;
        }
        return {
          steps: steps.length,
          total: performance.now() - start,
          maxScrollHandler: Math.max(...handler),
          avgScrollHandler: handler.reduce((a, b) => a + b, 0) / handler.length,
          maxStepWithLayout: Math.max(...steps),
          avgStepWithLayout: steps.reduce((a, b) => a + b, 0) / steps.length,
          rendered
        };
      });
      report(testInfo, 'scroll through 10k', rate, result);
      expect(result.rendered).toBe(10000);
      expect(result.avgScrollHandler).toBeLessThan(budget(16, rate));
      expect(result.maxScrollHandler).toBeLessThan(budget(50, rate));
    });

    test('multiple select with 500 chips', async ({ page }, testInfo) => {
      await setup(page, testInfo, rate);
      const result = await page.evaluate(async () => {
        const select = window.perf.makeSelect({ id: 'multi', count: 1000, multiple: true, selected: 500 });
        await window.perf.paint();
        let start = performance.now();
        const instance = new window.FlowSelect(select);
        const init = performance.now() - start;
        await window.perf.paint();
        const initPaint = performance.now() - start;
        start = performance.now();
        instance.open();
        const open = performance.now() - start;
        await window.perf.paint();
        const input = document.querySelector('.fs-input');
        input.value = 'item 750';
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await window.perf.paint();
        const row = [...document.querySelectorAll('.fs-option')].find((node) => node.textContent === 'Item 750');
        start = performance.now();
        row.click();
        const choose = performance.now() - start;
        await window.perf.paint();
        const remove = document.querySelector('.fs-chip-remove');
        start = performance.now();
        remove.click();
        const removeChip = performance.now() - start;
        await window.perf.paint();
        start = performance.now();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
        const backspace = performance.now() - start;
        return {
          init, initPaint, open, choose, removeChip, backspace,
          chips: document.querySelectorAll('.fs-chip').length,
          selected: select.selectedOptions.length
        };
      });
      report(testInfo, 'multiple 500 chips', rate, result);
      expect(result.chips).toBe(499);
      expect(result.selected).toBe(499);
      expect(result.init).toBeLessThan(budget(200, rate));
      expect(result.choose).toBeLessThan(budget(80, rate));
      expect(result.removeChip).toBeLessThan(budget(80, rate));
    });

    test('pointerdown to visible popover on a normal select', async ({ page }, testInfo) => {
      await setup(page, testInfo, rate);
      await page.evaluate(() => {
        const select = window.perf.makeSelect({ id: 'small', count: 6 });
        new window.FlowSelect(select);
      });
      const box = await root(page, 'small').locator('.fs-control').boundingBox();
      const samples = [];
      for (let round = 0; round < 5; round += 1) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.evaluate(() => {
          window.openLatency = null;
          window.addEventListener('pointerdown', () => {
            const start = performance.now();
            setTimeout(() => {
              const handled = document.querySelector('.fs-popover')?.matches(':popover-open') ?? false;
              requestAnimationFrame(() => setTimeout(() => {
                window.openLatency = { handled, paint: performance.now() - start, visible: document.querySelector('.fs-popover').offsetHeight > 0 };
              }, 0));
            }, 0);
          }, { capture: true, once: true });
        });
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForFunction(() => window.openLatency !== null);
        samples.push(await page.evaluate(() => window.openLatency));
        await page.keyboard.press('Escape');
        await expect(popover(page, 'small')).toBeHidden();
      }
      const paints = samples.map((sample) => sample.paint);
      report(testInfo, 'pointerdown -> painted popover', rate, { first: paints[0], max: Math.max(...paints), median: paints.slice().sort((a, b) => a - b)[2] });
      for (const sample of samples) {
        expect(sample.handled).toBe(true);
        expect(sample.visible).toBe(true);
      }
      expect(Math.max(...paints)).toBeLessThan(budget(100, rate));
    });
  });
}

async function metrics(cdp, page) {
  await page.waitForTimeout(300);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  const value = (name) => list.find((metric) => metric.name === name).value;
  return { listeners: value('JSEventListeners'), nodes: value('Nodes'), heap: value('JSHeapUsedSize') };
}

test('memory: open/close 200 times returns to baseline (CDP)', async ({ page }, testInfo) => {
  test.skip(!isChrome(testInfo), 'heap and listener metrics need CDP (chrome only)');
  const cdp = await setup(page, testInfo, 1);
  await cdp.send('Performance.enable');
  const cycle = (count) => page.evaluate(async (count) => {
    const instance = window.FlowSelect.get('#big');
    const input = document.querySelector('.fs-input');
    for (let index = 0; index < count; index += 1) {
      instance.open();
      if (index % 2 === 0) {
        input.value = String(index % 9 + 1);
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      instance.close();
      if (index % 20 === 0) {
        await window.perf.frame();
      }
    }
    await window.perf.paint();
  }, count);
  await page.evaluate(() => new window.FlowSelect(window.perf.makeSelect({ id: 'big', count: 2000 })));
  await cycle(4);
  const before = await metrics(cdp, page);
  await cycle(200);
  const after = await metrics(cdp, page);
  report(testInfo, 'open/close x200', 1, {
    listenersBefore: before.listeners, listenersAfter: after.listeners,
    nodesBefore: before.nodes, nodesAfter: after.nodes,
    heapBeforeKB: before.heap / 1024, heapAfterKB: after.heap / 1024
  });
  expect(after.listeners - before.listeners).toBeLessThanOrEqual(2);
  expect(after.nodes - before.nodes).toBeLessThanOrEqual(300);
  expect(after.heap - before.heap).toBeLessThan(1024 * 1024);
  expect(await page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(0);
});

test('memory: create/destroy 200 instances returns to baseline (CDP)', async ({ page }, testInfo) => {
  test.skip(!isChrome(testInfo), 'heap and listener metrics need CDP (chrome only)');
  const cdp = await setup(page, testInfo, 1);
  await cdp.send('Performance.enable');
  const cycle = (count) => page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      const select = window.perf.makeSelect({ id: `c${index}`, count: 50 });
      const instance = new window.FlowSelect(select);
      instance.open();
      instance.setValue(String(index % 50 + 1));
      instance.close();
      instance.destroy();
      select.parentElement.remove();
      if (index % 25 === 0) {
        await window.perf.frame();
      }
    }
    await window.perf.paint();
  }, count);
  await cycle(5);
  const before = await metrics(cdp, page);
  await cycle(200);
  const after = await metrics(cdp, page);
  report(testInfo, 'create/destroy x200', 1, {
    listenersBefore: before.listeners, listenersAfter: after.listeners,
    nodesBefore: before.nodes, nodesAfter: after.nodes,
    heapBeforeKB: before.heap / 1024, heapAfterKB: after.heap / 1024
  });
  expect(after.listeners - before.listeners).toBeLessThanOrEqual(2);
  expect(after.nodes - before.nodes).toBeLessThanOrEqual(300);
  expect(after.heap - before.heap).toBeLessThan(1024 * 1024);
});

async function globalListeners(cdp) {
  const list = async (expression) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: 0 });
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId });
    return listeners.map((listener) => `${expression}:${listener.type}`);
  };
  return [...await list('window'), ...await list('document'), ...await list('window.visualViewport')].sort();
}

test('window/document listeners: open adds, close and destroy remove them (CDP)', async ({ page }, testInfo) => {
  test.skip(!isChrome(testInfo), 'DOMDebugger.getEventListeners needs CDP (chrome only)');
  const cdp = await setup(page, testInfo, 1);
  const baseline = await globalListeners(cdp);
  await page.evaluate(() => {
    window.instanceA = new window.FlowSelect(window.perf.makeSelect({ id: 'a', count: 20 }));
  });
  const afterInit = await globalListeners(cdp);
  await page.evaluate(() => window.instanceA.open());
  const whileOpen = await globalListeners(cdp);
  await page.evaluate(() => window.instanceA.close());
  const afterClose = await globalListeners(cdp);
  await page.evaluate(() => {
    window.instanceA.open();
    window.instanceA.destroy();
  });
  const afterDestroy = await globalListeners(cdp);
  report(testInfo, 'window/document listeners', 1, {
    baseline: baseline.length, afterInit: afterInit.length, whileOpen: whileOpen.length, afterClose: afterClose.length, afterDestroy: afterDestroy.length,
    addedByInit: afterInit.filter((entry) => !baseline.includes(entry))
  });
  expect(whileOpen.length).toBeGreaterThan(afterInit.length);
  expect(afterClose).toEqual(afterInit);
  expect(afterDestroy).toEqual(baseline);
  expect(await page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(0);
});

// BUG: every instance keeps a window "pageshow" listener for its whole life, so a select removed without destroy() is never collected
test('selects removed from the DOM without destroy() can be garbage collected (CDP)', async ({ page }, testInfo) => {
  test.skip(!isChrome(testInfo), 'forced GC needs CDP (chrome only)');
  const cdp = await setup(page, testInfo, 1);
  const baseline = await globalListeners(cdp);
  await page.evaluate(() => {
    window.refs = [];
    for (let index = 0; index < 20; index += 1) {
      const select = window.perf.makeSelect({ id: `g${index}`, count: 30 });
      new window.FlowSelect(select);
      window.refs.push(new WeakRef(select));
    }
  });
  const withInstances = await globalListeners(cdp);
  await page.evaluate(() => {
    document.getElementById('app').textContent = '';
  });
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(200);
  await cdp.send('HeapProfiler.collectGarbage');
  const alive = await page.evaluate(() => window.refs.filter((ref) => ref.deref()).length);
  report(testInfo, 'removed without destroy', 1, {
    baselineListeners: baseline.length, listenersWith20: withInstances.length, selectsStillAliveAfterGc: alive
  });
  expect(alive).toBe(0);
});

test('dist bundle: min JS + min CSS auto-initialise and expose window.FlowSelect', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const sizes = {};
  page.on('response', async (response) => {
    if (response.url().includes('/dist/')) {
      sizes[response.url().split('/').pop()] = (await response.body()).length;
    }
  });
  await page.goto('/tests/fixtures/perf-dist.html');
  await page.waitForFunction(() => document.querySelectorAll('.fs').length === 2);
  const state = await page.evaluate(() => ({
    global: typeof window.FlowSelect,
    version: window.FlowSelect.version,
    autoInit: typeof window.FlowSelect.autoInit,
    enhanced: Array.from(document.querySelectorAll('.fs > select'), (select) => select.id),
    manual: window.FlowSelect.get('#manual'),
    popovers: document.querySelectorAll('.fs-popover').length,
    domContentLoadedToInteractive: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd
  }));
  report(testInfo, 'dist bundle', 1, { ...sizes, version: state.version, domContentLoadedEnd: state.domContentLoadedToInteractive });
  expect(state.global).toBe('function');
  expect(state.autoInit).toBe('function');
  expect(state.enhanced).toEqual(['fruit', 'tags']);
  expect(state.manual).toBeNull();
  expect(state.popovers).toBe(0);
  await root(page, 'fruit').locator('.fs-trigger, .fs-input').first().click();
  await expect(popover(page, 'fruit')).toBeVisible();
  await popover(page, 'fruit').locator('.fs-option', { hasText: 'Cherry' }).click();
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).get('fruit'))).toBe('cherry');
  expect(await page.evaluate(() => new FormData(document.getElementById('form')).getAll('tags'))).toEqual(['css']);
  expect(errors).toEqual([]);
});
