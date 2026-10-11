import { test, expect } from '@playwright/test';
import { mount, root, trigger, popover, options, nativeValue, expectOpen } from './helpers.js';

const EVENT_NAMES = ['input', 'change', 'flowselect:init', 'flowselect:open', 'flowselect:close', 'flowselect:change', 'flowselect:search', 'flowselect:create', 'flowselect:destroy', 'flowselect:load', 'flowselect:error'];

async function record(page) {
  await page.evaluate((names) => {
    window.events = [];
    for (const name of names) {
      document.addEventListener(name, (event) => {
        if (!(event.target instanceof HTMLSelectElement)) {
          return;
        }
        const detail = event.detail && typeof event.detail === 'object' ? event.detail : null;
        window.events.push({
          type: event.type,
          id: event.target.id,
          value: detail ? detail.value : undefined,
          items: detail && detail.items ? detail.items.map((item) => item.value) : undefined,
          sameInstance: detail ? detail.instance === window.FlowSelect.get(event.target) || event.type === 'flowselect:destroy' : undefined,
          query: detail ? detail.query : undefined,
          created: detail && detail.item ? detail.item.value : undefined
        });
      });
    }
  }, EVENT_NAMES);
}

async function events(page, id) {
  const list = await page.evaluate(() => window.events);
  return id ? list.filter((event) => event.id === id) : list;
}

async function types(page, id) {
  return (await events(page, id)).map((event) => event.type);
}

async function reset(page) {
  await page.evaluate(() => { window.events = []; });
}

function call(page, id, body) {
  return page.evaluate(({ id, body }) => {
    const instance = window.FlowSelect.get(`#${id}`);
    return new Function('fs', 'select', body)(instance, document.getElementById(id));
  }, { id, body });
}

function valueText(page, id) {
  return root(page, id).locator('.fs-value');
}

function chips(page, id) {
  return root(page, id).locator('.fs-chip');
}

const FRUIT = `
  <label for="fruit">Fruit</label>
  <select id="fruit" name="fruit" data-flow-select>
    <option value="">Pick a fruit</option>
    <option value="apple">Apple</option>
    <option value="banana">Banana</option>
    <option value="cherry">Cherry</option>
  </select>`;

const PLAN = `
  <label for="plan">Plan</label>
  <select id="plan" name="plan" data-flow-select>
    <option value="free">Free</option>
    <option value="team" selected>Team</option>
    <option value="business">Business</option>
  </select>`;

const TAGS = `
  <label for="tags">Tags</label>
  <select id="tags" name="tags[]" multiple data-flow-select>
    <option value="css">CSS</option>
    <option value="html" selected>HTML</option>
    <option value="js">JavaScript</option>
    <option value="go">Go</option>
  </select>`;

test.describe('value and selection API', () => {
  test('value getter returns a string for single and an array for multiple', async ({ page }) => {
    await mount(page, FRUIT + PLAN + TAGS);
    expect(await call(page, 'fruit', 'return fs.value;')).toBe('');
    expect(await call(page, 'plan', 'return fs.value;')).toBe('team');
    expect(await call(page, 'tags', 'return fs.value;')).toEqual(['html']);
    expect(await call(page, 'tags', 'const v = fs.value; v.push("x"); return fs.value;')).toEqual(['html']);
  });

  test('value setter updates native value and display and emits one change', async ({ page }) => {
    await mount(page, PLAN + TAGS);
    await record(page);
    await call(page, 'plan', 'fs.value = "business";');
    expect(await nativeValue(page, 'plan')).toBe('business');
    await expect(valueText(page, 'plan')).toHaveText('Business');
    expect(await types(page, 'plan')).toEqual(['input', 'change', 'flowselect:change']);

    await call(page, 'tags', 'fs.value = ["js", "css"];');
    expect(await nativeValue(page, 'tags')).toEqual(['css', 'js']);
    expect(await call(page, 'tags', 'return fs.value;')).toEqual(['js', 'css']);
    await expect(chips(page, 'tags')).toHaveText(['JavaScript', 'CSS']);
  });

  test('selectedItems returns the full items of the selection', async ({ page }) => {
    await mount(page, PLAN + TAGS);
    const single = await call(page, 'plan', 'return fs.selectedItems.map((i) => [i.value, i.label]);');
    expect(single).toEqual([['team', 'Team']]);
    await call(page, 'tags', 'fs.setValue(["go", "css"]);');
    const multiple = await call(page, 'tags', 'return fs.selectedItems.map((i) => [i.value, i.label]);');
    expect(multiple).toEqual([['go', 'Go'], ['css', 'CSS']]);
  });

  test('setValue with silent emits nothing but still updates native value and display', async ({ page }) => {
    await mount(page, PLAN + TAGS);
    await record(page);
    await call(page, 'plan', 'fs.setValue("free", { silent: true });');
    await call(page, 'tags', 'fs.setValue(["css", "js"], { silent: true });');
    expect(await nativeValue(page, 'plan')).toBe('free');
    await expect(valueText(page, 'plan')).toHaveText('Free');
    expect(await nativeValue(page, 'tags')).toEqual(['css', 'js']);
    await expect(chips(page, 'tags')).toHaveText(['CSS', 'JavaScript']);
    expect(await events(page)).toEqual([]);
  });

  test('setValue with the current value emits nothing', async ({ page }) => {
    await mount(page, PLAN + TAGS);
    await record(page);
    await call(page, 'plan', 'fs.setValue("team");');
    await call(page, 'plan', 'fs.setValue(["team"]);');
    await call(page, 'tags', 'fs.setValue(["html"]);');
    await call(page, 'tags', 'fs.setValue("html");');
    expect(await events(page)).toEqual([]);
  });

  test('setValue ignores unknown local values and keeps known ones', async ({ page }) => {
    await mount(page, TAGS);
    await call(page, 'tags', 'fs.setValue(["nope", "css", "", null, "css", "js"]);');
    expect(await call(page, 'tags', 'return fs.value;')).toEqual(['css', 'js']);
    expect(await nativeValue(page, 'tags')).toEqual(['css', 'js']);
    expect(await page.locator('#tags option').count()).toBe(4);
  });

  test('setValue on a single select takes the first value of an array', async ({ page }) => {
    await mount(page, PLAN);
    await call(page, 'plan', 'fs.setValue(["business", "free"]);');
    expect(await nativeValue(page, 'plan')).toBe('business');
  });

  test('setValue with item objects adds a posted option for values that are not in the list', async ({ page }) => {
    await mount(page, `<form id="f">${PLAN}${TAGS}</form>`);
    await call(page, 'plan', 'fs.setValue({ value: "enterprise", label: "Enterprise" });');
    await expect(valueText(page, 'plan')).toHaveText('Enterprise');
    await call(page, 'tags', 'fs.setValue([{ value: "rust", label: "Rust" }, "css"]);');
    await expect(chips(page, 'tags')).toHaveText(['Rust', 'CSS']);
    const data = await page.evaluate(() => {
      const form = new FormData(document.getElementById('f'));
      return { plan: form.getAll('plan'), tags: form.getAll('tags[]') };
    });
    expect(data.plan).toEqual(['enterprise']);
    expect(data.tags.sort()).toEqual(['css', 'rust']);

    await call(page, 'plan', 'fs.setValue("free");');
    expect(await page.locator('#plan option[value="enterprise"]').count()).toBe(0);
  });

  test('setValue respects maxItems on a multiple select', async ({ page }) => {
    await mount(page, TAGS.replace('data-flow-select', 'data-flow-select data-fs-max-items="2"'));
    await call(page, 'tags', 'fs.setValue(["css", "html", "js"]);');
    expect(await call(page, 'tags', 'return fs.value;')).toEqual(['css', 'html']);
  });

  test('setValue(null) and clear() empty the selection', async ({ page }) => {
    await mount(page, PLAN.replace('<option value="free">', '<option value="">None</option><option value="free">') + TAGS);
    await record(page);
    await call(page, 'plan', 'fs.setValue(null);');
    expect(await nativeValue(page, 'plan')).toBe('');
    await call(page, 'tags', 'fs.clear();');
    expect(await nativeValue(page, 'tags')).toEqual([]);
    await expect(chips(page, 'tags')).toHaveCount(0);
    expect(await types(page, 'tags')).toEqual(['input', 'change', 'flowselect:change']);
    await reset(page);
    await call(page, 'tags', 'fs.clear();');
    expect(await events(page)).toEqual([]);
  });

  test('clear({ silent: true }) emits nothing', async ({ page }) => {
    await mount(page, PLAN.replace('<option value="free">', '<option value="">None</option><option value="free">'));
    await record(page);
    await call(page, 'plan', 'fs.clear({ silent: true });');
    expect(await nativeValue(page, 'plan')).toBe('');
    await expect(valueText(page, 'plan')).toHaveText('None');
    expect(await events(page)).toEqual([]);
  });

  test('clear() on a single select without a placeholder option leaves no option selected', async ({ page }) => {
    await mount(page, PLAN);
    await call(page, 'plan', 'fs.clear();');
    expect(await page.evaluate(() => document.getElementById('plan').selectedIndex)).toBe(-1);
    expect(await call(page, 'plan', 'return fs.value;')).toBe('');
    await expect(root(page, 'plan')).not.toHaveClass(/has-value/);
  });
});

test.describe('option API', () => {
  test('addOption appends a native option and shows it in the list', async ({ page }) => {
    await mount(page, FRUIT);
    await record(page);
    const item = await call(page, 'fruit', 'const i = fs.addOption({ value: "kiwi", label: "Kiwi", description: "Green" }); return [i.value, i.label];');
    expect(item).toEqual(['kiwi', 'Kiwi']);
    expect(await page.locator('#fruit option[value="kiwi"]').count()).toBe(1);
    expect(await nativeValue(page, 'fruit')).toBe('');
    expect(await events(page)).toEqual([]);
    await trigger(page, 'fruit').click();
    await expect(options(page, 'fruit').filter({ hasText: 'Kiwi' })).toHaveCount(1);
    await expect(options(page, 'fruit').filter({ hasText: 'Kiwi' })).toContainText('Green');
  });

  test('addOption while open updates the open list', async ({ page }) => {
    await mount(page, FRUIT);
    await trigger(page, 'fruit').click();
    await expect(options(page, 'fruit')).toHaveCount(4);
    await call(page, 'fruit', 'fs.addOption("mango");');
    await expect(options(page, 'fruit')).toHaveCount(5);
    await options(page, 'fruit').filter({ hasText: 'mango' }).click();
    expect(await nativeValue(page, 'fruit')).toBe('mango');
  });

  test('addOption with selected selects it and emits one change', async ({ page }) => {
    await mount(page, FRUIT + TAGS);
    await record(page);
    await call(page, 'fruit', 'fs.addOption({ value: "kiwi", label: "Kiwi" }, { selected: true });');
    expect(await nativeValue(page, 'fruit')).toBe('kiwi');
    await expect(valueText(page, 'fruit')).toHaveText('Kiwi');
    expect(await types(page, 'fruit')).toEqual(['input', 'change', 'flowselect:change']);

    await call(page, 'tags', 'fs.addOption({ value: "rust", label: "Rust" }, { selected: true });');
    expect(await call(page, 'tags', 'return fs.value;')).toEqual(['html', 'rust']);
    await expect(chips(page, 'tags')).toHaveText(['HTML', 'Rust']);
    expect(await types(page, 'tags')).toEqual(['input', 'change', 'flowselect:change']);
  });

  test('addOption returns null for an item without a value', async ({ page }) => {
    await mount(page, FRUIT);
    expect(await call(page, 'fruit', 'return fs.addOption({ label: "No value" });')).toBeNull();
    expect(await call(page, 'fruit', 'return fs.addOption(null);')).toBeNull();
    expect(await page.locator('#fruit option').count()).toBe(4);
  });

  test('removeOption removes an unselected option and keeps the value', async ({ page }) => {
    await mount(page, PLAN);
    await call(page, 'plan', 'fs.removeOption("free");');
    expect(await page.locator('#plan option').count()).toBe(2);
    expect(await nativeValue(page, 'plan')).toBe('team');
    await trigger(page, 'plan').click();
    await expect(options(page, 'plan')).toHaveText(['Team', 'Business']);
  });

  test('removeOption of the selected value updates display to what the native select now holds', async ({ page }) => {
    await mount(page, FRUIT + TAGS);
    await call(page, 'fruit', 'fs.setValue("banana");');
    await call(page, 'fruit', 'fs.removeOption("banana");');
    expect(await nativeValue(page, 'fruit')).toBe('');
    expect(await call(page, 'fruit', 'return fs.value;')).toBe('');
    await expect(valueText(page, 'fruit')).toHaveText('Pick a fruit');

    await call(page, 'tags', 'fs.removeOption("html");');
    expect(await call(page, 'tags', 'return fs.value;')).toEqual([]);
    await expect(chips(page, 'tags')).toHaveCount(0);
  });

  test('setOptions with keepSelection keeps a value that is still present and emits nothing', async ({ page }) => {
    await mount(page, PLAN);
    await record(page);
    await call(page, 'plan', 'fs.setOptions([{ value: "team", label: "Team v2" }, { value: "solo", label: "Solo" }]);');
    expect(await nativeValue(page, 'plan')).toBe('team');
    await expect(valueText(page, 'plan')).toHaveText('Team v2');
    expect(await events(page)).toEqual([]);
    await trigger(page, 'plan').click();
    await expect(options(page, 'plan')).toHaveText(['Team v2', 'Solo']);
  });

  test('setOptions with keepSelection: false drops the selection and emits one change', async ({ page }) => {
    await mount(page, FRUIT + TAGS);
    await call(page, 'fruit', 'fs.setValue("apple", { silent: true });');
    await record(page);
    await call(page, 'fruit', 'fs.setOptions([{ value: "apple", label: "Apple" }, { value: "pear", label: "Pear" }], { keepSelection: false });');
    expect(await nativeValue(page, 'fruit')).toBe('');
    await expect(valueText(page, 'fruit')).toHaveText('Pick a fruit');
    expect(await page.locator('#fruit option').count()).toBe(3);
    expect(await types(page, 'fruit')).toEqual(['input', 'change', 'flowselect:change']);

    await call(page, 'tags', 'fs.setOptions(["a", "b"], { keepSelection: false });');
    expect(await call(page, 'tags', 'return fs.value;')).toEqual([]);
    expect(await types(page, 'tags')).toEqual(['input', 'change', 'flowselect:change']);
  });

  test('setOptions drops a kept value that is no longer present and emits one change', async ({ page }) => {
    await mount(page, TAGS);
    await call(page, 'tags', 'fs.setValue(["css", "html"], { silent: true });');
    await record(page);
    await call(page, 'tags', 'fs.setOptions([{ value: "css", label: "CSS" }, { value: "rust", label: "Rust" }]);');
    expect(await call(page, 'tags', 'return fs.value;')).toEqual(['css']);
    await expect(chips(page, 'tags')).toHaveText(['CSS']);
    expect(await types(page, 'tags')).toEqual(['input', 'change', 'flowselect:change']);
  });

  test('setOptions while open refreshes the open list', async ({ page }) => {
    await mount(page, FRUIT);
    await trigger(page, 'fruit').click();
    await call(page, 'fruit', 'fs.setOptions(["x", "y"]);');
    await expect(options(page, 'fruit')).toHaveText(['Pick a fruit', 'x', 'y']);
    await expectOpen(page, 'fruit');
  });

  test('refresh after select.value = ... updates display, returns true once, emits nothing', async ({ page }) => {
    await mount(page, PLAN + TAGS);
    await record(page);
    await page.evaluate(() => { document.getElementById('plan').value = 'business'; });
    expect(await call(page, 'plan', 'return fs.refresh();')).toBe(true);
    await expect(valueText(page, 'plan')).toHaveText('Business');
    expect(await call(page, 'plan', 'return fs.value;')).toBe('business');
    expect(await call(page, 'plan', 'return fs.refresh();')).toBe(false);

    await page.evaluate(() => { document.querySelector('#tags option[value="go"]').selected = true; });
    expect(await call(page, 'tags', 'return fs.refresh();')).toBe(true);
    await expect(chips(page, 'tags')).toHaveText(['HTML', 'Go']);
    expect(await events(page)).toEqual([]);
  });

  test('reload on a local select refreshes from the native select', async ({ page }) => {
    await mount(page, PLAN);
    await page.evaluate(() => { document.getElementById('plan').value = 'free'; });
    await call(page, 'plan', 'fs.reload();');
    await expect(valueText(page, 'plan')).toHaveText('Free');
  });

  test('reload on a remote select drops the cache so the next open fetches again', async ({ page }) => {
    const requests = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/tags')) {
        requests.push(request.url());
      }
    });
    await mount(page, '<label for="remote">Remote</label><select id="remote" name="remote" data-flow-select data-fs-url="/api/tags?delay=0"></select>');
    await trigger(page, 'remote').click();
    await expect(options(page, 'remote').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await trigger(page, 'remote').click();
    await expect(options(page, 'remote').first()).toBeVisible();
    expect(requests).toHaveLength(1);
    await page.keyboard.press('Escape');
    await call(page, 'remote', 'fs.reload();');
    await trigger(page, 'remote').click();
    await expect(options(page, 'remote').first()).toBeVisible();
    expect(requests).toHaveLength(2);
  });
});

test.describe('open, close, focus, enable, disable', () => {
  test('open, close and toggle change isOpen and fire one event per action', async ({ page }) => {
    await mount(page, FRUIT);
    await record(page);
    await call(page, 'fruit', 'fs.open();');
    await expectOpen(page, 'fruit');
    expect(await call(page, 'fruit', 'return fs.isOpen;')).toBe(true);
    await call(page, 'fruit', 'fs.open();');
    await call(page, 'fruit', 'fs.close();');
    await expectOpen(page, 'fruit', false);
    await call(page, 'fruit', 'fs.close();');
    expect(await call(page, 'fruit', 'return fs.isOpen;')).toBe(false);
    await call(page, 'fruit', 'fs.toggle();');
    expect(await call(page, 'fruit', 'return fs.isOpen;')).toBe(true);
    await call(page, 'fruit', 'fs.toggle();');
    expect(await call(page, 'fruit', 'return fs.isOpen;')).toBe(false);
    expect(await types(page, 'fruit')).toEqual(['flowselect:open', 'flowselect:close', 'flowselect:open', 'flowselect:close']);
  });

  test('aria-expanded follows the open state', async ({ page }) => {
    await mount(page, FRUIT);
    await call(page, 'fruit', 'fs.open();');
    await expect(trigger(page, 'fruit')).toHaveAttribute('aria-expanded', 'true');
    await call(page, 'fruit', 'fs.close();');
    await expect(trigger(page, 'fruit')).toHaveAttribute('aria-expanded', 'false');
  });

  test('focus() moves focus to the control', async ({ page }) => {
    await mount(page, FRUIT + PLAN);
    await call(page, 'plan', 'fs.focus();');
    await expect(trigger(page, 'plan')).toBeFocused();
    await call(page, 'fruit', 'fs.focus();');
    await expect(trigger(page, 'fruit')).toBeFocused();
  });

  test('focusing the native select (label click, select.focus()) moves focus to the control', async ({ page }) => {
    await mount(page, PLAN);
    await page.evaluate(() => document.getElementById('plan').focus());
    await expect(trigger(page, 'plan')).toBeFocused();
  });

  test('disable() and enable() update state, native disabled and interaction', async ({ page }) => {
    await mount(page, PLAN);
    await record(page);
    await call(page, 'plan', 'fs.disable();');
    expect(await call(page, 'plan', 'return [fs.disabled, select.disabled];')).toEqual([true, true]);
    await expect(root(page, 'plan')).toHaveClass(/is-disabled/);
    await expect(trigger(page, 'plan')).toBeDisabled();
    await call(page, 'plan', 'fs.open();');
    expect(await call(page, 'plan', 'return fs.isOpen;')).toBe(false);
    await call(page, 'plan', 'fs.enable();');
    expect(await call(page, 'plan', 'return [fs.disabled, select.disabled];')).toEqual([false, false]);
    await expect(root(page, 'plan')).not.toHaveClass(/is-disabled/);
    await trigger(page, 'plan').click();
    await expectOpen(page, 'plan');
    expect(await types(page, 'plan')).toEqual(['flowselect:open']);
  });

  test('disable() while open closes the popover', async ({ page }) => {
    await mount(page, PLAN);
    await trigger(page, 'plan').click();
    await expectOpen(page, 'plan');
    await call(page, 'plan', 'fs.disable();');
    await expectOpen(page, 'plan', false);
    expect(await page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(0);
  });

  test('disabling a multiple select removes the chip remove buttons', async ({ page }) => {
    await mount(page, TAGS);
    await expect(root(page, 'tags').locator('.fs-chip-remove')).toHaveCount(1);
    await call(page, 'tags', 'fs.disable();');
    await expect(root(page, 'tags').locator('.fs-chip-remove')).toHaveCount(0);
    await call(page, 'tags', 'fs.enable();');
    await expect(root(page, 'tags').locator('.fs-chip-remove')).toHaveCount(1);
  });

  test('only one popover is open at a time across instances', async ({ page }) => {
    await mount(page, `<div style="display: flex; gap: 24px; align-items: flex-start;"><div style="width: 200px">${FRUIT}</div><div style="width: 200px">${PLAN}</div><div style="width: 200px">${TAGS}</div></div>`);
    await record(page);
    await trigger(page, 'fruit').click();
    await expectOpen(page, 'fruit');
    await trigger(page, 'plan').click();
    await expectOpen(page, 'plan');
    await expectOpen(page, 'fruit', false);
    await call(page, 'tags', 'fs.open();');
    await expectOpen(page, 'tags');
    await expectOpen(page, 'plan', false);
    expect(await page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(1);
    expect(await page.evaluate(() => [...document.querySelectorAll('select')].map((s) => window.FlowSelect.get(s).isOpen))).toEqual([false, false, true]);
    expect((await events(page)).map((event) => `${event.id}:${event.type}`)).toEqual([
      'fruit:flowselect:open',
      'fruit:flowselect:close',
      'plan:flowselect:open',
      'plan:flowselect:close',
      'tags:flowselect:open'
    ]);
  });

  test('opening another instance after destroying the open one works', async ({ page }) => {
    await mount(page, FRUIT + PLAN);
    await call(page, 'fruit', 'fs.open();');
    await call(page, 'fruit', 'fs.destroy();');
    await call(page, 'plan', 'fs.open();');
    await expectOpen(page, 'plan');
    expect(await page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(1);
  });
});

test.describe('events', () => {
  test('a pick fires input, change, flowselect:change in that order with detail', async ({ page }) => {
    await mount(page, FRUIT + TAGS);
    await record(page);
    await trigger(page, 'fruit').click();
    await options(page, 'fruit').filter({ hasText: 'Cherry' }).click();
    const list = await events(page, 'fruit');
    expect(list.map((event) => event.type)).toEqual(['flowselect:open', 'input', 'change', 'flowselect:change', 'flowselect:close']);
    const change = list.find((event) => event.type === 'flowselect:change');
    expect(change).toMatchObject({ value: 'cherry', items: ['cherry'], sameInstance: true });

    await reset(page);
    await trigger(page, 'tags').click();
    await options(page, 'tags').filter({ hasText: 'Go' }).click();
    const multi = await events(page, 'tags');
    expect(multi.map((event) => event.type)).toEqual(['flowselect:open', 'input', 'change', 'flowselect:change']);
    expect(multi[3]).toMatchObject({ value: ['html', 'go'], items: ['html', 'go'], sameInstance: true });
  });

  test('native listeners see the new value when change fires', async ({ page }) => {
    await mount(page, PLAN);
    await page.evaluate(() => {
      window.seen = [];
      const select = document.getElementById('plan');
      select.addEventListener('input', () => window.seen.push(`input:${select.value}`));
      select.addEventListener('change', () => window.seen.push(`change:${select.value}`));
    });
    await trigger(page, 'plan').click();
    await options(page, 'plan').filter({ hasText: 'Business' }).click();
    expect(await page.evaluate(() => window.seen)).toEqual(['input:business', 'change:business']);
  });

  test('change events bubble to the form and document', async ({ page }) => {
    await mount(page, `<form id="f">${PLAN}</form>`);
    await page.evaluate(() => {
      window.bubbled = [];
      document.getElementById('f').addEventListener('change', (event) => window.bubbled.push(`form:${event.target.id}`));
      document.addEventListener('flowselect:change', (event) => window.bubbled.push(`doc:${event.target.id}`));
    });
    await call(page, 'plan', 'fs.setValue("free");');
    expect(await page.evaluate(() => window.bubbled)).toEqual(['form:plan', 'doc:plan']);
  });

  test('flowselect:init fires once per instance with the instance in detail', async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await page.waitForFunction(() => window.fixtureReady === true);
    const result = await page.evaluate((html) => {
      const seen = [];
      document.addEventListener('flowselect:init', (event) => seen.push({ id: event.target.id, ok: event.detail.instance === window.FlowSelect.get(event.target) }));
      const app = document.getElementById('app');
      app.innerHTML = html;
      window.FlowSelect.init(app);
      window.FlowSelect.init(app);
      window.FlowSelect.init(document.getElementById('plan'));
      return seen;
    }, FRUIT + PLAN);
    expect(result).toEqual([{ id: 'fruit', ok: true }, { id: 'plan', ok: true }]);
  });

  test('flowselect:search carries the query', async ({ page }) => {
    await mount(page, FRUIT.replace('data-flow-select', 'data-flow-select data-fs-search="true"'));
    await record(page);
    await trigger(page, 'fruit').click();
    await page.keyboard.type('ch');
    await expect(options(page, 'fruit')).toHaveCount(1);
    const queries = (await events(page, 'fruit')).filter((event) => event.type === 'flowselect:search').map((event) => event.query);
    expect(queries).toEqual(['c', 'ch']);
  });

  test('flowselect:create fires before the change and the created value is posted', async ({ page }) => {
    await mount(page, `<form id="f"><label for="topic">Topic</label><select id="topic" name="topic" data-flow-select data-fs-create="true"><option value="">Pick a topic</option><option value="news">News</option></select></form>`);
    await record(page);
    await trigger(page, 'topic').click();
    await page.keyboard.type('Weather');
    await expect(root(page, 'topic').locator('.fs-create')).toBeVisible();
    await page.keyboard.press('Enter');
    const list = (await events(page, 'topic')).filter((event) => event.type !== 'flowselect:search');
    expect(list.map((event) => event.type)).toEqual(['flowselect:open', 'flowselect:create', 'input', 'change', 'flowselect:change', 'flowselect:close']);
    expect(list[1].created).toBe('Weather');
    expect(await page.evaluate(() => new FormData(document.getElementById('f')).get('topic'))).toBe('Weather');
    await expect(valueText(page, 'topic')).toHaveText('Weather');
  });

  test('flowselect:load and flowselect:error fire for remote data', async ({ page }) => {
    await mount(page, `
      <label for="ok">Ok</label><select id="ok" name="ok" data-flow-select data-fs-url="/api/tags?delay=0"></select>
      <label for="bad">Bad</label><select id="bad" name="bad" data-flow-select data-fs-url="/api/fail"></select>`);
    await record(page);
    await trigger(page, 'ok').click();
    await expect(options(page, 'ok').first()).toBeVisible();
    expect(await types(page, 'ok')).toContain('flowselect:load');
    await page.keyboard.press('Escape');
    await trigger(page, 'bad').click();
    await expect(popover(page, 'bad').locator('.fs-retry')).toBeVisible();
    expect(await types(page, 'bad')).toContain('flowselect:error');
  });
});

test.describe('statics, config and lifecycle', () => {
  test('statics are exposed', async ({ page }) => {
    await mount(page, FRUIT);
    const info = await page.evaluate(() => ({
      version: window.FlowSelect.version,
      selector: window.FlowSelect.selector,
      hasDefaults: typeof window.FlowSelect.defaults === 'object',
      fns: ['get', 'init', 'destroy', 'observe', 'autoInit'].map((name) => typeof window.FlowSelect[name])
    }));
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.selector).toContain('data-flow-select');
    expect(info.hasDefaults).toBe(true);
    expect(info.fns).toEqual(['function', 'function', 'function', 'function', 'function']);
  });

  test('FlowSelect.get accepts an element or a selector and returns null for plain selects', async ({ page }) => {
    await mount(page, FRUIT + '<select id="plain"><option>One</option></select>');
    const result = await page.evaluate(() => {
      const select = document.getElementById('fruit');
      return {
        byElement: window.FlowSelect.get(select) !== null,
        bySelector: window.FlowSelect.get('#fruit') === window.FlowSelect.get(select),
        plain: window.FlowSelect.get('#plain'),
        missing: window.FlowSelect.get('#missing'),
        nothing: window.FlowSelect.get(null)
      };
    });
    expect(result).toEqual({ byElement: true, bySelector: true, plain: null, missing: null, nothing: null });
  });

  test('new FlowSelect on an enhanced select returns the same instance', async ({ page }) => {
    await mount(page, FRUIT);
    const same = await page.evaluate(() => {
      const select = document.getElementById('fruit');
      return new window.FlowSelect(select) === window.FlowSelect.get(select) && new window.FlowSelect('#fruit') === window.FlowSelect.get(select);
    });
    expect(same).toBe(true);
    await expect(page.locator('.fs')).toHaveCount(1);
  });

  test('new FlowSelect throws a TypeError for something that is not a select', async ({ page }) => {
    await mount(page, '<div id="box"></div>');
    const error = await page.evaluate(() => {
      try {
        new window.FlowSelect('#box');
        return null;
      } catch (e) {
        return e.name;
      }
    });
    expect(error).toBe('TypeError');
  });

  test('FlowSelect.init is idempotent and returns the instances', async ({ page }) => {
    await mount(page, FRUIT + PLAN);
    const result = await page.evaluate(() => {
      const app = document.getElementById('app');
      const first = window.FlowSelect.init(app);
      const second = window.FlowSelect.init(app);
      return { count: first.length, same: first.every((instance, index) => instance === second[index]) };
    });
    expect(result).toEqual({ count: 2, same: true });
    await expect(page.locator('.fs')).toHaveCount(2);
    await expect(page.locator('.fs .fs')).toHaveCount(0);
  });

  test('destroy restores the original select exactly', async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await page.waitForFunction(() => window.fixtureReady === true);
    const result = await page.evaluate(() => {
      const app = document.getElementById('app');
      app.innerHTML = `<form id="f"><span id="before">a</span><select id="s1" name="s1" class="custom" tabindex="3" data-flow-select><option value="a">A</option><option value="b">B</option></select><span id="after">b</span><select id="s2" name="s2" aria-hidden="false" multiple data-flow-select><option value="x" selected>X</option></select></form>`;
      const html = app.innerHTML;
      window.FlowSelect.init(app);
      const enhanced = app.innerHTML !== html;
      window.FlowSelect.get('#s1').setValue('b');
      window.FlowSelect.get('#s1').destroy();
      window.FlowSelect.get('#s2').destroy();
      const s1 = document.getElementById('s1');
      return {
        enhanced,
        html: app.innerHTML,
        expected: html,
        s1Value: s1.value,
        prev: s1.previousElementSibling?.id,
        next: s1.nextElementSibling?.id,
        parent: s1.parentElement.id,
        tabindex: s1.getAttribute('tabindex'),
        ariaHidden: [s1.getAttribute('aria-hidden'), document.getElementById('s2').getAttribute('aria-hidden')],
        className: s1.className,
        s2TabIndex: document.getElementById('s2').hasAttribute('tabindex'),
        fsLeft: document.querySelectorAll('.fs, .fs-popover').length,
        get: [window.FlowSelect.get(s1), window.FlowSelect.get('#s2')]
      };
    });
    expect(result.enhanced).toBe(true);
    expect(result.html.replace(/ class=""/g, '')).toBe(result.expected);
    expect(result.s1Value).toBe('b');
    expect(result.prev).toBe('before');
    expect(result.next).toBe('after');
    expect(result.parent).toBe('f');
    expect(result.tabindex).toBe('3');
    expect(result.ariaHidden).toEqual([null, 'false']);
    expect(result.className).toBe('custom');
    expect(result.s2TabIndex).toBe(false);
    expect(result.fsLeft).toBe(0);
    expect(result.get).toEqual([null, null]);
  });

  // BUG: destroy leaves an empty class attribute on a select that had none
  test('destroy does not leave an empty class attribute behind', async ({ page }) => {
    await mount(page, '<select id="bare" data-flow-select><option value="a">A</option></select>');
    await call(page, 'bare', 'fs.destroy();');
    expect(await page.evaluate(() => document.getElementById('bare').hasAttribute('class'))).toBe(false);
  });

  test('destroy fires flowselect:destroy once and detaches all listeners', async ({ page }) => {
    await mount(page, `<form id="f">${PLAN}</form>`);
    await record(page);
    await call(page, 'plan', 'fs.destroy(); fs.destroy();');
    expect(await types(page, 'plan')).toEqual(['flowselect:destroy']);
    await reset(page);
    await page.evaluate(() => {
      const select = document.getElementById('plan');
      select.append(new Option('Extra', 'extra'));
      select.value = 'extra';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('f').reset();
      select.focus();
    });
    await page.waitForTimeout(50);
    await expect(page.locator('#plan')).toBeFocused();
    expect(await types(page, 'plan')).toEqual(['change']);
    await expect(page.locator('.fs')).toHaveCount(0);
  });

  test('destroy while open removes the popover from the top layer', async ({ page }) => {
    await mount(page, PLAN);
    await trigger(page, 'plan').click();
    await expectOpen(page, 'plan');
    await call(page, 'plan', 'fs.destroy();');
    expect(await page.evaluate(() => document.querySelectorAll(':popover-open, .fs-popover').length)).toBe(0);
    await page.mouse.click(5, 5);
    await page.keyboard.press('Escape');
  });

  test('a new instance on a destroyed select works and keeps the value', async ({ page }) => {
    await mount(page, PLAN);
    await call(page, 'plan', 'fs.setValue("business"); fs.destroy();');
    await page.evaluate(() => new window.FlowSelect('#plan'));
    await expect(valueText(page, 'plan')).toHaveText('Business');
    await trigger(page, 'plan').click();
    await options(page, 'plan').filter({ hasText: 'Free' }).click();
    expect(await nativeValue(page, 'plan')).toBe('free');
    await expect(page.locator('.fs')).toHaveCount(1);
    await call(page, 'plan', 'fs.destroy();');
    expect(await page.evaluate(() => [document.getElementById('plan').getAttribute('tabindex'), document.getElementById('plan').getAttribute('aria-hidden')])).toEqual([null, null]);
  });

  test('FlowSelect.destroy(root) destroys every instance inside root only', async ({ page }) => {
    await mount(page, `<div id="a">${FRUIT}${TAGS}</div><div id="b">${PLAN}</div>`);
    await page.evaluate(() => window.FlowSelect.destroy(document.getElementById('a')));
    await expect(page.locator('#a .fs')).toHaveCount(0);
    await expect(page.locator('#b .fs')).toHaveCount(1);
    expect(await page.evaluate(() => [window.FlowSelect.get('#fruit'), window.FlowSelect.get('#tags')])).toEqual([null, null]);
    await page.evaluate(() => window.FlowSelect.destroy(document.getElementById('plan')));
    await expect(page.locator('.fs')).toHaveCount(0);
  });

  test('FlowSelect.observe enhances added selects once and stops after disconnect', async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await page.waitForFunction(() => window.fixtureReady === true);
    await page.evaluate(() => {
      window.inits = 0;
      document.addEventListener('flowselect:init', () => { window.inits += 1; });
      window.stopObserving = window.FlowSelect.observe(document.getElementById('app'));
      const wrapper = document.createElement('div');
      wrapper.innerHTML = '<select id="o1" data-flow-select><option>One</option></select>';
      document.getElementById('app').append(wrapper);
      const direct = document.createElement('select');
      direct.id = 'o2';
      direct.setAttribute('data-flow-select', '');
      direct.append(new Option('Two', 'two'));
      document.getElementById('app').append(direct);
    });
    await expect(page.locator('.fs')).toHaveCount(2);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.inits)).toBe(2);
    await expect(page.locator('.fs .fs')).toHaveCount(0);
    await page.evaluate(() => {
      window.stopObserving();
      document.getElementById('app').insertAdjacentHTML('beforeend', '<select id="o3" data-flow-select><option>Three</option></select>');
    });
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.FlowSelect.get('#o3'))).toBeNull();
  });

  test('changing FlowSelect.defaults affects new instances only', async ({ page }) => {
    await mount(page, '<select id="old" data-flow-select multiple><option value="a">A</option></select>');
    await page.evaluate(() => {
      window.FlowSelect.defaults.placeholder = 'Choose something';
      window.FlowSelect.defaults.messages.noResults = 'Nothing here';
      document.getElementById('app').insertAdjacentHTML('beforeend', '<select id="fresh" data-flow-select multiple data-fs-search="true"><option value="a">A</option></select>');
      window.FlowSelect.init(document.getElementById('app'));
    });
    await expect(root(page, 'fresh').locator('.fs-input')).toHaveAttribute('placeholder', 'Choose something');
    await expect(root(page, 'old').locator('.fs-input')).not.toHaveAttribute('placeholder', 'Choose something');
    await trigger(page, 'fresh').click();
    await page.keyboard.type('zzz');
    await expect(popover(page, 'fresh').locator('.fs-status')).toContainText('No results for');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.FlowSelect.defaults.messages.noResultsFor = 'None for {query}';
      document.getElementById('app').insertAdjacentHTML('beforeend', '<select id="third" data-flow-select multiple><option value="a">A</option></select>');
      window.FlowSelect.init(document.getElementById('app'));
    });
    await trigger(page, 'third').click();
    await page.keyboard.type('zzz');
    await expect(popover(page, 'third').locator('.fs-status')).toHaveText('None for zzz');
  });

  test('options passed to init override data attributes, which override defaults', async ({ page }) => {
    await mount(page, '<select id="cfg" data-flow-select data-fs-placeholder="From data" data-fs-clearable="true"><option value="">Empty</option><option value="a">A</option></select>', { placeholder: 'From init' });
    await expect(valueText(page, 'cfg')).toHaveText('From init');
    expect(await call(page, 'cfg', 'return [fs.options.placeholder, fs.options.clearable];')).toEqual(['From init', true]);
  });

  test('JSON config in data-flow-select is applied', async ({ page }) => {
    await mount(page, `<select id="json" name="json" data-flow-select='{"placeholder":"Pick from JSON","clearable":true,"search":true,"messages":{"noResultsFor":"Nothing for {query}"}}'><option value="">Empty</option><option value="a">Alpha</option><option value="b">Beta</option></select>`);
    await expect(valueText(page, 'json')).toHaveText('Pick from JSON');
    await expect(root(page, 'json').locator('.fs-input')).toHaveCount(1);
    await call(page, 'json', 'fs.setValue("a");');
    await expect(root(page, 'json').locator('.fs-clear')).toBeVisible();
    await root(page, 'json').locator('.fs-clear').click();
    expect(await nativeValue(page, 'json')).toBe('');
    await trigger(page, 'json').click();
    await page.keyboard.type('zz');
    await expect(popover(page, 'json').locator('.fs-status')).toHaveText('Nothing for zz');
  });

  test('invalid JSON config warns and still enhances with defaults', async ({ page }) => {
    const warnings = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });
    await mount(page, `<select id="broken" data-flow-select='{"placeholder": oops}'><option value="a">A</option></select>`);
    await expect(root(page, 'broken')).toHaveCount(1);
    expect(warnings.some((text) => text.includes('not valid JSON'))).toBe(true);
  });

  test('manual mode is skipped by init(root) but can be enhanced explicitly', async ({ page }) => {
    await mount(page, '<select id="man" data-flow-select="manual"><option value="a">A</option><option value="b">B</option></select>');
    await expect(page.locator('.fs')).toHaveCount(0);
    expect(await page.evaluate(() => window.FlowSelect.get('#man'))).toBeNull();
    await page.evaluate(() => window.FlowSelect.init(document.getElementById('app')));
    await expect(page.locator('.fs')).toHaveCount(0);
    await page.evaluate(() => new window.FlowSelect('#man', { placeholder: 'x' }));
    await expect(root(page, 'man')).toHaveCount(1);
    await trigger(page, 'man').click();
    await options(page, 'man').filter({ hasText: 'B' }).click();
    expect(await nativeValue(page, 'man')).toBe('b');
  });

  test('FlowSelect.init(select) enhances a manual select passed directly', async ({ page }) => {
    await mount(page, '<select id="man" data-flow-select="manual"><option value="a">A</option></select>');
    await page.evaluate(() => window.FlowSelect.init(document.getElementById('man')));
    await expect(root(page, 'man')).toHaveCount(1);
  });
});
