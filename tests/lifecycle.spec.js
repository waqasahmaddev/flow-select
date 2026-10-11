import { test, expect } from '@playwright/test';
import { mount, root, trigger, popover, options, nativeValue, expectOpen } from './helpers.js';

function valueText(page, id) {
  return root(page, id).locator('.fs-value');
}

function chips(page, id) {
  return root(page, id).locator('.fs-chip');
}

function exact(text) {
  return new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}

function row(page, id, label) {
  return options(page, id).filter({ has: page.locator('.fs-label', { hasText: exact(label) }) });
}

async function choose(page, id, label) {
  await trigger(page, id).click();
  await expectOpen(page, id);
  await row(page, id, label).click();
}

function formData(page, formId) {
  return page.evaluate((formId) => {
    const data = new FormData(document.getElementById(formId));
    const result = {};
    for (const key of new Set(data.keys())) {
      result[key] = data.getAll(key);
    }
    return result;
  }, formId);
}

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

test.describe('early init from a script in the head', () => {
  test('selects are enhanced while the page is parsing, once each', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/tests/fixtures/api-early-init.html');
    await page.waitForFunction(() => document.readyState === 'complete' && window.htmx);
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => ({ parse: window.parseLog, log: window.initLog, atDcl: window.atDomContentLoaded }));

    expect(state.parse.first).toEqual({ enhanced: true, wrapped: true, shown: 'Beta' });
    expect(state.log.map((entry) => entry.id)).toEqual(['first', 'split', 'filled', 'tags', 'cell']);
    expect(state.log.filter((entry) => entry.id !== 'cell').every((entry) => entry.ready === 'loading')).toBe(true);
    expect(state.atDcl).toBe(5);
    await expect(page.locator('.fs')).toHaveCount(5);
    await expect(page.locator('.fs .fs')).toHaveCount(0);
    expect(state.parse.manual).toBeNull();
    expect(errors).toEqual([]);
  });

  test('a select is not enhanced until all of its options are parsed', async ({ page }) => {
    await page.goto('/tests/fixtures/api-early-init.html');
    await page.waitForFunction(() => document.readyState === 'complete');
    const state = await page.evaluate(() => window.parseLog);
    expect(state.splitMidway).toBe(false);
    expect(state.splitAfter).toBe('two');
    await expect(valueText(page, 'split')).toHaveText('Two');
    await trigger(page, 'split').click();
    await expect(options(page, 'split')).toHaveText(['One', 'Two', 'Three']);
  });

  test('options added by a script right after an early-enhanced select are picked up', async ({ page }) => {
    await page.goto('/tests/fixtures/api-early-init.html');
    await page.waitForFunction(() => document.readyState === 'complete');
    expect(await page.evaluate(() => window.parseLog.filledEnhanced)).toBe(true);
    await expect(valueText(page, 'filled')).toHaveText('Late two');
    await trigger(page, 'filled').click();
    await expect(options(page, 'filled')).toHaveText(['Pick one', 'Late one', 'Late two']);
  });

  test('early-enhanced selects post and work like the others', async ({ page }) => {
    await page.goto('/tests/fixtures/api-early-init.html');
    await page.waitForFunction(() => document.readyState === 'complete');
    await choose(page, 'first', 'Alpha');
    await choose(page, 'cell', 'Yankee');
    await page.keyboard.press('Escape');
    expect(await formData(page, 'early-form')).toEqual({
      first: ['a'],
      split: ['two'],
      filled: ['late2'],
      'tags[]': ['css', 'js'],
      manual: ['m'],
      cell: ['y']
    });
    await expect(chips(page, 'tags')).toHaveText(['CSS', 'JavaScript']);
  });
});

const ALL_MODES = `
  <form id="f" method="post" action="/api/echo">
    <label for="single">Single</label>
    <select id="single" name="single" data-flow-select>
      <option value="s1">Single one</option>
      <option value="s2">Single two</option>
    </select>
    <label for="empty">Placeholder</label>
    <select id="empty" name="empty" data-flow-select data-fs-clearable="true">
      <option value="">Nothing yet</option>
      <option value="e1">Empty one</option>
    </select>
    <label for="grouped">Grouped</label>
    <select id="grouped" name="grouped" data-flow-select>
      <optgroup label="First"><option value="g1">Group one</option></optgroup>
      <optgroup label="Second"><option value="g2">Group two</option><option value="g3" disabled>Group three</option></optgroup>
    </select>
    <label for="multi">Multiple</label>
    <select id="multi" name="multi[]" multiple data-flow-select>
      <option value="m1">Multi one</option>
      <option value="m2">Multi two</option>
      <option value="m3">Multi three</option>
    </select>
    <label for="remote">Remote</label>
    <select id="remote" name="remote" data-flow-select data-fs-url="/api/people?delay=0"></select>
    <label for="remote-multi">Remote multiple</label>
    <select id="remote-multi" name="remoteMulti" multiple data-flow-select data-fs-url="/api/tags?delay=0"></select>
    <label for="created">Create</label>
    <select id="created" name="created" data-flow-select data-fs-create="true">
      <option value="">Pick or create</option>
      <option value="c1">Known</option>
    </select>
    <label for="created-multi">Create multiple</label>
    <select id="created-multi" name="createdMulti" multiple data-flow-select data-fs-create="true">
      <option value="k1">Known one</option>
    </select>
    <label for="off">Disabled</label>
    <select id="off" name="off" data-flow-select disabled>
      <option value="o1">Off</option>
    </select>
    <button type="submit" id="submit">Submit</button>
  </form>`;

test.describe('forms', () => {
  test('FormData matches the selections for every mode', async ({ page }) => {
    await mount(page, ALL_MODES);
    expect(await formData(page, 'f')).toEqual({ single: ['s1'], empty: [''], grouped: ['g1'], created: [''] });

    await choose(page, 'single', 'Single two');
    await choose(page, 'empty', 'Empty one');
    await choose(page, 'grouped', 'Group two');
    await choose(page, 'multi', 'Multi three');
    await row(page, 'multi', 'Multi one').click();
    await page.keyboard.press('Escape');

    await trigger(page, 'remote').click();
    await page.keyboard.type('nora');
    await expect(options(page, 'remote').first()).toContainText('Nora');
    await page.keyboard.press('Enter');

    await trigger(page, 'remote-multi').click();
    await expect(options(page, 'remote-multi').first()).toBeVisible();
    await row(page, 'remote-multi', 'Rust').click();
    await row(page, 'remote-multi', 'Go').click();
    await page.keyboard.press('Escape');

    await trigger(page, 'created').click();
    await page.keyboard.type('Brand new');
    await expect(root(page, 'created').locator('.fs-create')).toBeVisible();
    await page.keyboard.press('Enter');

    await trigger(page, 'created-multi').click();
    await page.keyboard.type('Fresh');
    await expect(root(page, 'created-multi').locator('.fs-create')).toBeVisible();
    await page.keyboard.press('Enter');
    await row(page, 'created-multi', 'Known one').click();
    await page.keyboard.press('Escape');

    const data = await formData(page, 'f');
    const remoteMulti = data.remoteMulti;
    delete data.remoteMulti;
    expect(data).toEqual({
      single: ['s2'],
      empty: ['e1'],
      grouped: ['g2'],
      'multi[]': ['m1', 'm3'],
      remote: [expect.stringMatching(/^p\d+$/)],
      created: ['Brand new'],
      createdMulti: ['k1', 'Fresh']
    });
    expect(remoteMulti.sort()).toEqual(['go', 'rust']);
    await expect(valueText(page, 'remote')).toContainText('Nora');
  });

  test('a real submit posts every mode', async ({ page }) => {
    await mount(page, ALL_MODES);
    await choose(page, 'grouped', 'Group two');
    await trigger(page, 'remote-multi').click();
    await expect(options(page, 'remote-multi').first()).toBeVisible();
    await row(page, 'remote-multi', 'CSS').click();
    await page.keyboard.press('Escape');
    await trigger(page, 'created-multi').click();
    await page.keyboard.type('Fresh');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.FlowSelect.get('#remote').setValue({ value: 'p3', label: 'Person three' }));

    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/echo') && request.method() === 'POST');
    await page.click('#submit');
    const body = new URLSearchParams((await requestPromise).postData() ?? '');
    expect(body.get('single')).toBe('s1');
    expect(body.get('empty')).toBe('');
    expect(body.get('grouped')).toBe('g2');
    expect(body.getAll('multi[]')).toEqual([]);
    expect(body.get('remote')).toBe('p3');
    expect(body.getAll('remoteMulti')).toEqual(['css']);
    expect(body.get('created')).toBe('');
    expect(body.getAll('createdMulti')).toEqual(['Fresh']);
    expect(body.has('off')).toBe(false);
    await expect(page.getByTestId('echo')).toContainText('remote: p3');
  });

  test('clearing a clearable select posts the empty value', async ({ page }) => {
    await mount(page, ALL_MODES);
    await choose(page, 'empty', 'Empty one');
    await root(page, 'empty').locator('.fs-clear').click();
    expect((await formData(page, 'f')).empty).toEqual(['']);
    await expect(valueText(page, 'empty')).toHaveText('Nothing yet');
  });

  test('required: submitting focuses the control and marks it invalid, picking clears it', async ({ page }) => {
    await mount(page, `
      <form id="f" action="/api/echo" method="post">
        <label for="country">Country</label>
        <select id="country" name="country" required data-flow-select>
          <option value="">Choose a country</option>
          <option value="no">Norway</option>
          <option value="pe">Peru</option>
        </select>
        <label for="langs">Languages</label>
        <select id="langs" name="langs" multiple required data-flow-select>
          <option value="en">English</option>
          <option value="de">German</option>
        </select>
        <button type="submit" id="submit">Submit</button>
      </form>`);
    let posted = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST') {
        posted += 1;
      }
    });
    await expect(trigger(page, 'country')).toHaveAttribute('aria-required', 'true');
    await page.click('#submit');
    await expect(trigger(page, 'country')).toBeFocused();
    await expect(root(page, 'country')).toHaveClass(/is-invalid/);
    await expect(root(page, 'langs')).toHaveClass(/is-invalid/);
    expect(posted).toBe(0);

    await choose(page, 'country', 'Peru');
    await expect(root(page, 'country')).not.toHaveClass(/is-invalid/);
    await expect(root(page, 'langs')).toHaveClass(/is-invalid/);

    await page.click('#submit');
    await expect(trigger(page, 'langs')).toBeFocused();
    await choose(page, 'langs', 'German');
    await expect(root(page, 'langs')).not.toHaveClass(/is-invalid/);
    await page.keyboard.press('Escape');

    const requestPromise = page.waitForRequest((request) => request.method() === 'POST');
    await page.click('#submit');
    const body = new URLSearchParams((await requestPromise).postData() ?? '');
    expect(body.get('country')).toBe('pe');
    expect(body.getAll('langs')).toEqual(['de']);
  });

  test('form reset restores the initial UI for every mode, including a form-attribute select', async ({ page }) => {
    await mount(page, `
      <form id="f">
        <select id="plan" name="plan" data-flow-select>
          <option value="free">Free</option>
          <option value="team" selected>Team</option>
          <option value="business">Business</option>
        </select>
        <select id="tags" name="tags" multiple data-flow-select>
          <option value="css" selected>CSS</option>
          <option value="html">HTML</option>
          <option value="js">JavaScript</option>
        </select>
        <select id="person" name="person" multiple data-flow-select data-fs-url="/api/people?delay=0"></select>
        <button type="reset" id="reset">Reset</button>
      </form>
      <select id="outside" name="outside" form="f" data-flow-select>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </select>`);
    await choose(page, 'plan', 'Business');
    await choose(page, 'tags', 'JavaScript');
    await row(page, 'tags', 'CSS').click();
    await page.keyboard.press('Escape');
    await trigger(page, 'person').click();
    await expect(options(page, 'person').first()).toBeVisible();
    await options(page, 'person').first().click();
    await page.keyboard.press('Escape');
    await choose(page, 'outside', 'Option B');

    await expect(valueText(page, 'plan')).toHaveText('Business');
    await expect(chips(page, 'tags')).toHaveText(['JavaScript']);
    await expect(valueText(page, 'outside')).toHaveText('Option B');

    await page.click('#reset');
    await expect(valueText(page, 'plan')).toHaveText('Team');
    await expect(chips(page, 'tags')).toHaveText(['CSS']);
    await expect(valueText(page, 'outside')).toHaveText('Option A');
    await expect(root(page, 'person')).not.toHaveClass(/has-value/);
    expect(await nativeValue(page, 'plan')).toBe('team');
    expect(await nativeValue(page, 'tags')).toEqual(['css']);
    expect(await nativeValue(page, 'person')).toEqual([]);
    expect(await page.evaluate(() => window.FlowSelect.get('#plan').value)).toBe('team');
    expect(await page.evaluate(() => window.FlowSelect.get('#outside').value)).toBe('a');
  });

  // BUG: form reset keeps a remote single value because the library-added option is selected by the browser's reset
  test('form reset clears a remote single select that started empty', async ({ page }) => {
    await mount(page, `
      <form id="f">
        <select id="person" name="person" data-flow-select data-fs-url="/api/people?delay=0"></select>
        <button type="reset" id="reset">Reset</button>
      </form>`);
    await trigger(page, 'person').click();
    await expect(options(page, 'person').first()).toBeVisible();
    await options(page, 'person').first().click();
    expect(await nativeValue(page, 'person')).toBe('p1');
    await page.click('#reset');
    await expect(root(page, 'person')).not.toHaveClass(/has-value/);
    expect(await nativeValue(page, 'person')).toBe('');
    expect(await formData(page, 'f')).toEqual({});
  });

  test('form reset keeps a server-rendered remote value', async ({ page }) => {
    await mount(page, `
      <form id="f">
        <select id="person" name="person" data-flow-select data-fs-url="/api/people?delay=0"><option value="p5" selected>Person five</option></select>
        <button type="reset" id="reset">Reset</button>
      </form>`);
    await trigger(page, 'person').click();
    await expect(options(page, 'person').first()).toBeVisible();
    await options(page, 'person').first().click();
    expect(await nativeValue(page, 'person')).toBe('p1');
    await page.click('#reset');
    await expect(valueText(page, 'person')).toHaveText('Person five');
    expect(await formData(page, 'f')).toEqual({ person: ['p5'] });
  });

  test('a select associated with the form attribute is posted', async ({ page }) => {
    await mount(page, `
      <form id="f"><button type="submit">Go</button></form>
      <select id="outside" name="outside" form="f" data-flow-select>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </select>
      <select id="loose" name="loose" data-flow-select><option value="z">Zed</option></select>`);
    await choose(page, 'outside', 'Option B');
    expect(await formData(page, 'f')).toEqual({ outside: ['b'] });
  });

  test('name="x[]" posts one entry per selected value in order of the options', async ({ page }) => {
    await mount(page, `<form id="f"><select id="x" name="x[]" multiple data-flow-select>
      <option value="1">One</option><option value="2">Two</option><option value="3">Three</option></select></form>`);
    await choose(page, 'x', 'Three');
    await row(page, 'x', 'One').click();
    expect(await formData(page, 'f')).toEqual({ 'x[]': ['1', '3'] });
    expect(await page.evaluate(() => window.FlowSelect.get('#x').value)).toEqual(['3', '1']);
  });

  test('a select inside <fieldset disabled> starts disabled and is not posted', async ({ page }) => {
    await mount(page, `<form id="f"><fieldset id="fs1" disabled>
      <select id="inside" name="inside" data-flow-select><option value="a">A</option><option value="b">B</option></select>
    </fieldset></form>`);
    await expect(root(page, 'inside')).toHaveClass(/is-disabled/);
    await expect(trigger(page, 'inside')).toBeDisabled();
    expect(await page.evaluate(() => window.FlowSelect.get('#inside').disabled)).toBe(true);
    expect(await formData(page, 'f')).toEqual({});
  });

  // BUG: toggling disabled on an ancestor fieldset is not observed
  test('enabling and disabling an ancestor fieldset updates the control', async ({ page }) => {
    await mount(page, `<form id="f"><fieldset id="fs1" disabled>
      <select id="inside" name="inside" data-flow-select><option value="a">A</option><option value="b">B</option></select>
    </fieldset></form>`);
    await page.evaluate(() => { document.getElementById('fs1').disabled = false; });
    await expect(root(page, 'inside')).not.toHaveClass(/is-disabled/);
    await expect(trigger(page, 'inside')).toBeEnabled();
    await page.evaluate(() => { document.getElementById('fs1').disabled = true; });
    await expect(root(page, 'inside')).toHaveClass(/is-disabled/);
    await expect(trigger(page, 'inside')).toBeDisabled();
  });

  test('changing select.disabled from outside is observed, and closes an open list', async ({ page }) => {
    await mount(page, `<select id="s" name="s" data-flow-select><option value="a">A</option><option value="b">B</option></select>`);
    await trigger(page, 's').click();
    await expectOpen(page, 's');
    await page.evaluate(() => { document.getElementById('s').disabled = true; });
    await expect(root(page, 's')).toHaveClass(/is-disabled/);
    await expectOpen(page, 's', false);
    expect(await page.evaluate(() => window.FlowSelect.get('#s').disabled)).toBe(true);
    await page.evaluate(() => { document.getElementById('s').removeAttribute('disabled'); });
    await expect(root(page, 's')).not.toHaveClass(/is-disabled/);
    await trigger(page, 's').click();
    await expectOpen(page, 's');
  });
});

const LIST = `
  <label for="list">List</label>
  <select id="list" name="list" data-flow-select>
    <option value="">Pick one</option>
    <option value="a">Alpha</option>
    <option value="b">Beta</option>
    <option value="c">Gamma</option>
  </select>`;

test.describe('external changes to the options', () => {
  test('changes while closed show up on the next open', async ({ page }) => {
    await mount(page, LIST);
    await page.evaluate(() => {
      const select = document.getElementById('list');
      select.append(new Option('Delta', 'd'));
      select.querySelector('option[value="a"]').remove();
      select.querySelector('option[value="b"]').textContent = 'Beta renamed';
      select.querySelector('option[value="c"]').hidden = true;
    });
    await trigger(page, 'list').click();
    await expect(options(page, 'list')).toHaveText(['Pick one', 'Beta renamed', 'Delta']);
  });

  test('disabled and label attribute changes on options are observed', async ({ page }) => {
    await mount(page, LIST);
    await page.evaluate(() => {
      const select = document.getElementById('list');
      select.querySelector('option[value="a"]').disabled = true;
      select.querySelector('option[value="b"]').label = 'Beta label';
    });
    await trigger(page, 'list').click();
    await expect(row(page, 'list', 'Alpha')).toHaveAttribute('aria-disabled', 'true');
    await expect(row(page, 'list', 'Beta label')).toHaveCount(1);
  });

  test('removing the selected option from outside updates the display', async ({ page }) => {
    await mount(page, LIST);
    await choose(page, 'list', 'Beta');
    await page.evaluate(() => document.querySelector('#list option[value="b"]').remove());
    await expect(valueText(page, 'list')).toHaveText('Pick one');
    expect(await page.evaluate(() => window.FlowSelect.get('#list').value)).toBe('');
  });

  test('renaming the selected option updates the display', async ({ page }) => {
    await mount(page, LIST);
    await choose(page, 'list', 'Beta');
    await page.evaluate(() => { document.querySelector('#list option[value="b"]').textContent = 'Beta two'; });
    await expect(valueText(page, 'list')).toHaveText('Beta two');
  });

  // BUG: editing an option's text node in place (characterData) is not observed
  test('editing the text node of an option is observed', async ({ page }) => {
    await mount(page, LIST);
    await choose(page, 'list', 'Beta');
    await page.evaluate(() => { document.querySelector('#list option[value="b"]').firstChild.data = 'Beta edited'; });
    await expect(valueText(page, 'list')).toHaveText('Beta edited');
  });

  // BUG: setting the selected attribute on an option from outside is not observed
  test('setting the selected attribute on an option from outside updates the display', async ({ page }) => {
    await mount(page, LIST);
    await page.evaluate(() => document.querySelector('#list option[value="c"]').setAttribute('selected', ''));
    expect(await nativeValue(page, 'list')).toBe('c');
    await expect(valueText(page, 'list')).toHaveText('Gamma');
  });

  test('changes while open update the open list', async ({ page }) => {
    await mount(page, LIST);
    await trigger(page, 'list').click();
    await expect(options(page, 'list')).toHaveCount(4);
    await page.evaluate(() => {
      const select = document.getElementById('list');
      select.append(new Option('Delta', 'd'), new Option('Epsilon', 'e'));
    });
    await expect(options(page, 'list')).toHaveCount(6);
    await page.evaluate(() => { document.querySelector('#list option[value="a"]').disabled = true; });
    await expect(row(page, 'list', 'Alpha')).toHaveAttribute('aria-disabled', 'true');
    await expectOpen(page, 'list');
    await row(page, 'list', 'Epsilon').click();
    expect(await nativeValue(page, 'list')).toBe('e');
  });

  test('removing the active option while open keeps the keyboard working', async ({ page }) => {
    const errors = trackErrors(page);
    await mount(page, LIST);
    await trigger(page, 'list').focus();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'list');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'list', 'Beta')).toHaveClass(/is-active/);
    await page.evaluate(() => document.querySelector('#list option[value="b"]').remove());
    await expect(options(page, 'list')).toHaveCount(3);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(['a', 'c']).toContain(await nativeValue(page, 'list'));
    expect(errors).toEqual([]);
  });

  test('replacing all options with innerHTML while open shows the new list', async ({ page }) => {
    await mount(page, LIST);
    await trigger(page, 'list').click();
    await page.evaluate(() => {
      document.getElementById('list').innerHTML = '<option value="">Choose</option><option value="x">Xray</option><option value="y" selected>Yankee</option>';
    });
    await expect(options(page, 'list')).toHaveText(['Choose', 'Xray', 'Yankee']);
    await expect(valueText(page, 'list')).toHaveText('Yankee');
    await expect(row(page, 'list', 'Yankee')).toHaveAttribute('aria-selected', 'true');
  });

  test('external option changes do not emit change events', async ({ page }) => {
    await mount(page, LIST);
    await page.evaluate(() => {
      window.changes = 0;
      document.getElementById('list').addEventListener('change', () => { window.changes += 1; });
      document.getElementById('list').append(new Option('Delta', 'd'));
    });
    await trigger(page, 'list').click();
    await expect(options(page, 'list')).toHaveCount(5);
    expect(await page.evaluate(() => window.changes)).toBe(0);
  });
});

test.describe('lifecycle edge cases', () => {
  test('a select removed from the page while open closes its popover', async ({ page }) => {
    const errors = trackErrors(page);
    await mount(page, LIST + '<button id="after">After</button>');
    await trigger(page, 'list').click();
    await expectOpen(page, 'list');
    await page.evaluate(() => document.querySelector('.fs:has(> #list)').remove());
    await expect.poll(() => page.evaluate(() => document.querySelectorAll(':popover-open').length)).toBe(0);
    expect(await page.evaluate(() => window.FlowSelect.get('#list'))).toBeNull();
    expect(errors).toEqual([]);
  });

  test('moving an enhanced select wrapper to another container keeps it working', async ({ page }) => {
    await mount(page, '<div id="one">' + LIST + '</div><div id="two"></div>');
    await page.evaluate(() => document.getElementById('two').append(document.querySelector('.fs:has(> #list)')));
    await choose(page, 'list', 'Gamma');
    expect(await nativeValue(page, 'list')).toBe('c');
    await expect(page.locator('#two .fs')).toHaveCount(1);
  });

  test('two instances keep separate state', async ({ page }) => {
    await mount(page, `<div style="display: flex; gap: 24px; align-items: flex-start;"><div style="width: 220px">${LIST}</div><div style="width: 220px">${LIST.replaceAll('list', 'other')}</div></div>`);
    await choose(page, 'list', 'Alpha');
    await choose(page, 'other', 'Gamma');
    expect(await nativeValue(page, 'list')).toBe('a');
    expect(await nativeValue(page, 'other')).toBe('c');
    await expect(valueText(page, 'list')).toHaveText('Alpha');
    await expect(valueText(page, 'other')).toHaveText('Gamma');
  });
});
