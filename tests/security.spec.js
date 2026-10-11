import { test, expect } from '@playwright/test';
import { mount, root, control, popover, options, nativeValue, expectOpen } from './helpers.js';

const PAYLOADS = [
  '<img src=x onerror="window.__xss=(window.__xss||0)+1">',
  '"><script>window.__xss=(window.__xss||0)+1</script>',
  `'quoted' "double" <b>bold</b> &amp;`,
  '<svg onload="window.__xss=(window.__xss||0)+1"></svg>'
];

async function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectNoInjection(page, id) {
  await page.waitForTimeout(150);
  const result = await page.evaluate((id) => {
    const scope = document.querySelector(`.fs:has(> select#${id})`);
    return {
      xss: window.__xss ?? 0,
      img: scope.querySelectorAll('img').length,
      script: scope.querySelectorAll('script').length,
      svgOther: scope.querySelectorAll('svg:not(.fs-icon)').length,
      bold: scope.querySelectorAll('b').length,
      handlers: Array.from(scope.querySelectorAll('*')).filter((node) => Array.from(node.attributes).some((attribute) => attribute.name.startsWith('on'))).length
    };
  }, id);
  expect(result).toEqual({ xss: 0, img: 0, script: 0, svgOther: 0, bold: 0, handlers: 0 });
}

async function mountPayloadSelect(page, { multiple = false, attributes = '' } = {}) {
  await mount(page, '');
  await page.evaluate(({ payloads, multiple, attributes }) => {
    const app = document.getElementById('app');
    app.innerHTML = `<label for="evil">Evil</label><select id="evil" name="evil" ${multiple ? 'multiple' : ''} ${attributes} data-flow-select></select>`;
    const select = document.getElementById('evil');
    const group = document.createElement('optgroup');
    group.label = payloads[0];
    payloads.forEach((payload, index) => {
      const option = new Option(payload, `v${index}`);
      option.dataset.description = payload;
      option.dataset.meta = payload;
      option.dataset.badge = payload;
      option.dataset.avatar = payload;
      group.append(option);
    });
    const second = document.createElement('optgroup');
    second.label = payloads[1];
    second.append(new Option('Plain option', 'plain'));
    select.append(group, second);
    window.FlowSelect.init(app);
  }, { payloads: PAYLOADS, multiple, attributes });
}

test('labels, description, meta, badge, avatar text and group labels render as text', async ({ page }) => {
  const errors = await trackErrors(page);
  await mountPayloadSelect(page);
  await control(page, 'evil').click();
  await expectOpen(page, 'evil');
  await expect(options(page, 'evil')).toHaveCount(PAYLOADS.length + 1);
  const first = options(page, 'evil').first();
  await expect(first.locator('.fs-label')).toHaveText(PAYLOADS[0]);
  await expect(first.locator('.fs-description')).toHaveText(PAYLOADS[0]);
  await expect(first.locator('.fs-meta-text')).toHaveText(PAYLOADS[0]);
  await expect(first.locator('.fs-badge')).toHaveText(PAYLOADS[0]);
  await expect(popover(page, 'evil').locator('.fs-group').first()).toHaveText(PAYLOADS[0]);
  await expect(popover(page, 'evil').locator('.fs-group').nth(1)).toHaveText(PAYLOADS[1]);
  await options(page, 'evil').nth(1).click();
  await expect(root(page, 'evil').locator('.fs-value-text')).toHaveText(PAYLOADS[1]);
  await expectNoInjection(page, 'evil');
  expect(errors).toEqual([]);
});

test('the search query renders as text in "No results for" and in the create row', async ({ page }) => {
  const errors = await trackErrors(page);
  await mountPayloadSelect(page, { attributes: `data-fs-create="true"` });
  const input = root(page, 'evil').locator('.fs-input');
  for (const payload of PAYLOADS) {
    await input.fill(payload + ' zz');
    await expect(popover(page, 'evil').locator('.fs-create')).toContainText(payload + ' zz');
    await expectNoInjection(page, 'evil');
  }
  await mount(page, '<select id="plain" data-flow-select data-fs-search="true"><option value="a">Alpha</option></select>');
  const plainInput = root(page, 'plain').locator('.fs-input');
  await plainInput.fill(PAYLOADS[0]);
  await expect(popover(page, 'plain').locator('.fs-status')).toContainText(PAYLOADS[0]);
  await plainInput.fill(PAYLOADS[1]);
  await expect(popover(page, 'plain').locator('.fs-status')).toContainText(PAYLOADS[1]);
  await expectNoInjection(page, 'plain');
  expect(errors).toEqual([]);
});

test('created items and chips with markup stay text and round-trip into the native select and FormData', async ({ page }) => {
  const errors = await trackErrors(page);
  await mount(page, `<form id="form"><select id="tags" name="tags" multiple data-flow-select data-fs-create="true"><option value="x">Existing</option></select></form>`);
  const input = root(page, 'tags').locator('.fs-input');
  for (const payload of PAYLOADS) {
    await input.fill(payload);
    await page.keyboard.press('Enter');
  }
  const chips = root(page, 'tags').locator('.fs-chip-label');
  await expect(chips).toHaveCount(PAYLOADS.length);
  for (let index = 0; index < PAYLOADS.length; index += 1) {
    await expect(chips.nth(index)).toHaveText(PAYLOADS[index].trim());
  }
  const removeLabels = await root(page, 'tags').locator('.fs-chip-remove').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  expect(removeLabels).toEqual(PAYLOADS.map((payload) => `Remove ${payload.trim()}`));
  expect(await nativeValue(page, 'tags')).toEqual(PAYLOADS.map((payload) => payload.trim()));
  const posted = await page.evaluate(() => new FormData(document.getElementById('form')).getAll('tags'));
  expect(posted).toEqual(PAYLOADS.map((payload) => payload.trim()));
  await expectNoInjection(page, 'tags');
  expect(errors).toEqual([]);
});

test('javascript: and other non-image avatar values never become an img src', async ({ page }) => {
  await mount(page, '');
  const avatars = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'vbscript:msgbox(1)', 'jav&#x09;ascript:alert(1)', 'data:text/html,<script>alert(1)</script>'];
  await page.evaluate((avatars) => {
    const app = document.getElementById('app');
    app.innerHTML = '<select id="av" data-flow-select></select>';
    const select = document.getElementById('av');
    avatars.forEach((value, index) => {
      const option = new Option(`Person ${index}`, `p${index}`);
      option.dataset.avatar = value;
      select.append(option);
    });
    window.FlowSelect.init(app);
  }, avatars);
  await control(page, 'av').click();
  await expect(options(page, 'av')).toHaveCount(avatars.length);
  const sources = await popover(page, 'av').locator('img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));
  for (const source of sources) {
    expect(source.toLowerCase().trim().startsWith('javascript:')).toBe(false);
    expect(source.toLowerCase().startsWith('vbscript:')).toBe(false);
  }
  const texts = await popover(page, 'av').locator('.fs-avatar').evaluateAll((nodes) => nodes.map((node) => node.querySelector('img') ? null : node.textContent));
  expect(texts.slice(0, 4)).toEqual(['ja', 'Ja', ' j', 'vb']);
  const valueAvatar = await page.evaluate(() => {
    window.FlowSelect.get('#av').setValue('p0');
    return document.querySelector('.fs-value .fs-avatar img');
  });
  expect(valueAvatar).toBeNull();
});

test('values with quotes, markup and unicode round-trip into the native select and FormData', async ({ page }) => {
  const values = [`he said "hi"`, `it's`, '<b>&amp;</b>', 'Café 日本 😀', 'a\\b', '01', '1', 'trailing space '];
  await mount(page, '<form id="form"><select id="single" name="single" data-flow-select><option value="">Pick</option></select><select id="many" name="many" multiple data-flow-select></select></form>');
  const result = await page.evaluate((values) => {
    const single = window.FlowSelect.get('#single');
    const many = window.FlowSelect.get('#many');
    const items = values.map((value) => ({ value, label: `Label ${value}` }));
    single.setOptions(items);
    many.setOptions(items);
    const singleSeen = [];
    for (const value of values) {
      single.setValue(value);
      singleSeen.push([single.value, document.getElementById('single').value, new FormData(document.getElementById('form')).get('single')]);
    }
    many.setValue(values);
    return {
      singleSeen,
      many: many.value,
      manyNative: Array.from(document.getElementById('many').selectedOptions, (option) => option.value),
      manyPosted: new FormData(document.getElementById('form')).getAll('many')
    };
  }, values);
  for (let index = 0; index < values.length; index += 1) {
    expect(result.singleSeen[index]).toEqual([values[index], values[index], values[index]]);
  }
  expect(result.many).toEqual(values);
  expect(result.manyNative).toEqual(values);
  expect(result.manyPosted).toEqual(values);

  await page.evaluate(() => window.FlowSelect.get('#many').open());
  await expect(options(page, 'many')).toHaveCount(values.length);
  await expect(options(page, 'many').nth(2).locator('.fs-label')).toHaveText('Label <b>&amp;</b>');
});

test('JSON in data-flow-select cannot inject markup or pollute prototypes', async ({ page }) => {
  const errors = await trackErrors(page);
  const json = JSON.stringify({
    placeholder: PAYLOADS[0],
    searchPlaceholder: PAYLOADS[1],
    className: 'x" onmouseover="window.__xss=1',
    maxHeight: '10px; background: url(javascript:alert(1))',
    search: true,
    messages: { noResults: PAYLOADS[0], noResultsFor: '<b>{query}</b>', clear: PAYLOADS[1] },
    clearable: true,
    variant: '<img src=x onerror=alert(1)>'
  });
  const raw = `${json.slice(0, -1)},"__proto__":{"polluted":"yes"}}`;
  await mount(page, '');
  await page.evaluate((raw) => {
    const app = document.getElementById('app');
    app.innerHTML = '<select id="cfg" name="cfg"><option value="">Empty</option></select>';
    document.getElementById('cfg').setAttribute('data-flow-select', raw);
    window.FlowSelect.init(app);
  }, raw);
  await expect(root(page, 'cfg')).toHaveClass(/fs--field/);
  await expect(root(page, 'cfg').locator('.fs-value')).toHaveText(PAYLOADS[0]);
  await root(page, 'cfg').locator('.fs-input').fill(PAYLOADS[1]);
  await expect(popover(page, 'cfg').locator('.fs-status')).toHaveText(`<b>${PAYLOADS[1]}</b>`);
  const state = await page.evaluate(() => ({
    polluted: ({}).polluted,
    rootAttributes: Array.from(document.querySelector('.fs').attributes, (attribute) => attribute.name)
  }));
  expect(state.polluted).toBeUndefined();
  expect(state.rootAttributes).toEqual(['class']);
  await expectNoInjection(page, 'cfg');
  expect(errors).toEqual([]);
});

test('remote results with markup render as text', async ({ page }) => {
  const errors = await trackErrors(page);
  await mount(page, '<select id="remote" name="remote" data-flow-select></select>');
  await page.evaluate((payloads) => {
    const select = document.getElementById('remote');
    window.FlowSelect.get(select)?.destroy();
    new window.FlowSelect(select, {
      debounce: 0,
      load: async () => payloads.map((payload, index) => ({ value: `r${index}`, label: payload, description: payload, meta: payload, badge: payload, group: payload, avatar: 'javascript:alert(1)' }))
    });
  }, PAYLOADS);
  await control(page, 'remote').click();
  await expect(options(page, 'remote')).toHaveCount(PAYLOADS.length);
  await expect(options(page, 'remote').first().locator('.fs-label')).toHaveText(PAYLOADS[0]);
  await options(page, 'remote').first().click();
  await expect(root(page, 'remote').locator('.fs-value-text')).toHaveText(PAYLOADS[0]);
  await expectNoInjection(page, 'remote');
  expect(errors).toEqual([]);
});
