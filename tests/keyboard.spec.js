import { test, expect } from '@playwright/test';
import { mount, root, trigger, popover, options, nativeValue, expectOpen } from './helpers.js';

// ---------------- Fixtures ----------------

const FRUIT_OPTIONS = `
  <option value="apple">Apple</option>
  <option value="apricot">Apricot</option>
  <option value="banana" selected>Banana</option>
  <option value="blueberry">Blueberry</option>
  <option value="cherry" disabled>Cherry</option>
  <option value="grape">Grape</option>
  <optgroup label="Citrus">
    <option value="lemon">Lemon</option>
    <option value="lime">Lime</option>
    <option value="orange">Orange</option>
  </optgroup>
  <optgroup label="Tropical">
    <option value="mango">Mango</option>
    <option value="papaya">Papaya</option>
    <option value="pineapple">Pineapple</option>
  </optgroup>`;

function fruits(attributes = '') {
  return `
    <input id="before" aria-label="Before">
    <label for="fruit">Fruit</label>
    <select id="fruit" name="fruit" data-flow-select data-fs-search="false" ${attributes}>${FRUIT_OPTIONS}</select>
    <input id="after" aria-label="After">`;
}

const COUNTRY_OPTIONS = `
  <option value="">Pick a country</option>
  <option value="ci">Côte d'Ivoire</option>
  <option value="fr">France</option>
  <option value="de">Germany</option>
  <option value="nz">New Zealand</option>
  <option value="no">Norway</option>
  <option value="pe">Peru</option>`;

function countries(search = 'true', attributes = '') {
  return `
    <input id="before" aria-label="Before">
    <label for="country">Country</label>
    <select id="country" name="country" data-flow-select data-fs-search="${search}" ${attributes}>${COUNTRY_OPTIONS}</select>
    <input id="after" aria-label="After">`;
}

function colours(attributes = '') {
  return `
    <input id="before" aria-label="Before">
    <label for="colours">Colours</label>
    <select id="colours" name="colours" multiple data-flow-select ${attributes}>
      <option value="red" selected>Red</option>
      <option value="green" selected>Green</option>
      <option value="blue">Blue</option>
      <option value="yellow">Yellow</option>
      <option value="purple">Purple</option>
      <option value="orange" disabled>Orange</option>
    </select>
    <input id="after" aria-label="After">`;
}

const ALL_MODES = `
  <input id="before" aria-label="Before">
  <label for="m-none">None</label>
  <select id="m-none" data-flow-select data-fs-search="false">
    <option value="a">Alpha</option><option value="b" selected>Beta</option><option value="c">Gamma</option>
  </select>
  <label for="m-inline">Inline</label>
  <select id="m-inline" data-flow-select data-fs-search="inline">
    <option value="a">Alpha</option><option value="b" selected>Beta</option><option value="c">Gamma</option>
  </select>
  <label for="m-dropdown">Dropdown</label>
  <select id="m-dropdown" data-flow-select data-fs-search="dropdown" data-fs-variant="pill">
    <option value="a">Alpha</option><option value="b" selected>Beta</option><option value="c">Gamma</option>
  </select>
  <label for="m-multi">Multi</label>
  <select id="m-multi" multiple data-flow-select>
    <option value="a" selected>Alpha</option><option value="b">Beta</option><option value="c">Gamma</option>
  </select>
  <input id="after" aria-label="After">`;

const MODE_IDS = ['m-none', 'm-inline', 'm-dropdown', 'm-multi'];

// ---------------- Helpers ----------------

function activeRow(page, id) {
  return popover(page, id).locator('.fs-option.is-active');
}

async function expectActive(page, id, label) {
  await expect(activeRow(page, id)).toHaveCount(1);
  await expect(activeRow(page, id).locator('.fs-label')).toHaveText(label);
}

function searchBox(page, id) {
  return popover(page, id).locator('.fs-search input');
}

function live(page, id) {
  return root(page, id).locator('.fs-sr');
}

async function focusFromBefore(page, id) {
  await page.locator('#before').focus();
  await page.keyboard.press('Tab');
  await expect(trigger(page, id)).toBeFocused();
}

async function countChanges(page, id) {
  await page.evaluate((id) => {
    window.changes = 0;
    document.getElementById(id).addEventListener('change', () => {
      window.changes += 1;
    });
  }, id);
}

async function changes(page) {
  return page.evaluate(() => window.changes);
}

/**
 * aria-activedescendant invariant for one control:
 * open   -> exactly one owner (the focused combobox) pointing at an existing [role=option] in the
 *           listbox it controls, which is the only row with .is-active
 * closed -> no owner
 */
async function ariaSnapshot(page, id) {
  return page.evaluate((id) => {
    const fs = document.querySelector(`.fs:has(> select#${id})`);
    const owners = Array.from(fs.querySelectorAll('[aria-activedescendant]'));
    const actives = fs.querySelectorAll('.fs-option.is-active');
    const pop = fs.querySelector('.fs-popover');
    const open = Boolean(pop && pop.matches(':popover-open'));
    const owner = owners[0] ?? null;
    const ref = owner ? document.getElementById(owner.getAttribute('aria-activedescendant')) : null;
    return {
      open,
      owners: owners.length,
      ownerRole: owner?.getAttribute('role') ?? null,
      ownerFocused: owner ? owner === document.activeElement : null,
      ownerControls: owner?.getAttribute('aria-controls') ?? null,
      refExists: Boolean(ref),
      refRole: ref?.getAttribute('role') ?? null,
      refActive: ref ? ref.classList.contains('is-active') : null,
      refListbox: ref?.closest('[role=listbox]')?.id ?? null,
      actives: actives.length
    };
  }, id);
}

async function expectAriaConsistent(page, id) {
  const state = await ariaSnapshot(page, id);
  if (!state.open) {
    expect(state.owners, 'no aria-activedescendant while closed').toBe(0);
    return;
  }
  if (state.owners === 0) {
    expect(state.actives, 'no highlighted row without aria-activedescendant').toBe(0);
    return;
  }
  expect(state).toMatchObject({
    owners: 1,
    ownerRole: 'combobox',
    ownerFocused: true,
    refExists: true,
    refRole: 'option',
    refActive: true,
    actives: 1,
    refListbox: state.ownerControls
  });
}

async function isOpen(page, id) {
  return page.evaluate((id) => window.FlowSelect.get(`#${id}`).isOpen, id);
}

async function caretColor(page, id) {
  return page.evaluate((id) => {
    const input = document.querySelector(`.fs:has(> select#${id}) .fs-control .fs-input`);
    return getComputedStyle(input).caretColor;
  }, id);
}

function isTransparent(color) {
  return color === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color);
}

async function valueStyle(page, id) {
  return page.evaluate((id) => {
    const value = document.querySelector(`.fs:has(> select#${id}) .fs-value`);
    const style = getComputedStyle(value);
    return { text: value.textContent.trim(), visibility: style.visibility, opacity: Number(style.opacity) };
  }, id);
}

// ---------------- Single select without search ----------------

test.describe('single without search', () => {
  test.beforeEach(async ({ page }) => {
    await mount(page, fruits());
  });

  test('ArrowDown opens on the selected option without changing the value', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'fruit');
    await expectActive(page, 'fruit', 'Banana');
    expect(await nativeValue(page, 'fruit')).toBe('banana');
    await expectAriaConsistent(page, 'fruit');
  });

  test('ArrowUp opens on the selected option', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowUp');
    await expectOpen(page, 'fruit');
    await expectActive(page, 'fruit', 'Banana');
  });

  test('arrows skip disabled options and group headers', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'fruit', 'Blueberry');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'fruit', 'Grape');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'fruit', 'Lemon');
    await expect(popover(page, 'fruit').locator('.fs-group.is-active')).toHaveCount(0);
    await page.keyboard.press('ArrowUp');
    await expectActive(page, 'fruit', 'Grape');
    await page.keyboard.press('ArrowUp');
    await expectActive(page, 'fruit', 'Blueberry');
    await expectAriaConsistent(page, 'fruit');
  });

  test('ArrowDown on the last option and ArrowUp on the first stay put', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'fruit', 'Pineapple');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await expectActive(page, 'fruit', 'Apple');
  });

  test('Home, End, PageUp and PageDown move the highlight', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Home');
    await expectActive(page, 'fruit', 'Apple');
    await page.keyboard.press('PageDown');
    await expectActive(page, 'fruit', 'Papaya');
    await page.keyboard.press('PageDown');
    await expectActive(page, 'fruit', 'Pineapple');
    await page.keyboard.press('PageUp');
    await expectActive(page, 'fruit', 'Apricot');
    await page.keyboard.press('PageUp');
    await expectActive(page, 'fruit', 'Apple');
    await page.keyboard.press('End');
    await expectActive(page, 'fruit', 'Pineapple');
    expect(await nativeValue(page, 'fruit')).toBe('banana');
    await expectAriaConsistent(page, 'fruit');
  });

  test('Home and End on the closed control open on the first and last option', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('End');
    await expectOpen(page, 'fruit');
    await expectActive(page, 'fruit', 'Pineapple');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Home');
    await expectActive(page, 'fruit', 'Apple');
  });

  test('Enter opens, then selects the highlighted option and closes', async ({ page }) => {
    await countChanges(page, 'fruit');
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('Enter');
    await expectOpen(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expectOpen(page, 'fruit', false);
    expect(await nativeValue(page, 'fruit')).toBe('blueberry');
    await expect(trigger(page, 'fruit')).toBeFocused();
    await expect(trigger(page, 'fruit')).toHaveText('Blueberry');
    await page.waitForTimeout(200);
    expect(await isOpen(page, 'fruit')).toBe(false);
    expect(await changes(page)).toBe(1);
  });

  test('Space opens, then selects and closes without reopening on keyup', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press(' ');
    await expectOpen(page, 'fruit');
    await page.waitForTimeout(100);
    expect(await isOpen(page, 'fruit')).toBe(true);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press(' ');
    await expectOpen(page, 'fruit', false);
    await page.waitForTimeout(200);
    expect(await isOpen(page, 'fruit')).toBe(false);
    expect(await nativeValue(page, 'fruit')).toBe('apricot');
    await expect(trigger(page, 'fruit')).toBeFocused();
  });

  test('Alt+ArrowUp selects the highlighted option and closes', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Alt+ArrowUp');
    await expectOpen(page, 'fruit', false);
    expect(await nativeValue(page, 'fruit')).toBe('blueberry');
    await expect(trigger(page, 'fruit')).toBeFocused();
  });

  test('Escape closes without change and keeps focus on the control', async ({ page }) => {
    await countChanges(page, 'fruit');
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'fruit', false);
    expect(await nativeValue(page, 'fruit')).toBe('banana');
    await expect(trigger(page, 'fruit')).toBeFocused();
    expect(await changes(page)).toBe(0);
    await expectAriaConsistent(page, 'fruit');
  });

  test('Escape after a mouse open returns focus to the control', async ({ page }) => {
    await trigger(page, 'fruit').click();
    await expectOpen(page, 'fruit');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'fruit', false);
    await expect(trigger(page, 'fruit')).toBeFocused();
  });

  test('Escape on the closed control is not swallowed', async ({ page }) => {
    await page.evaluate(() => {
      window.escapes = [];
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          window.escapes.push(event.defaultPrevented);
        }
      });
    });
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.escapes)).toEqual([false]);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.escapes)).toEqual([false]);
  });

  test('typeahead on the closed control changes the value like a native select', async ({ page }) => {
    await countChanges(page, 'fruit');
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('g');
    expect(await nativeValue(page, 'fruit')).toBe('grape');
    await expect(trigger(page, 'fruit')).toHaveText('Grape');
    await expectOpen(page, 'fruit', false);
    expect(await changes(page)).toBe(1);
  });

  test('typeahead with a repeated letter cycles through the matches', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('b');
    expect(await nativeValue(page, 'fruit')).toBe('blueberry');
    await page.keyboard.press('b');
    expect(await nativeValue(page, 'fruit')).toBe('banana');
    await page.keyboard.press('b');
    expect(await nativeValue(page, 'fruit')).toBe('blueberry');
    await page.waitForTimeout(700);
    await page.keyboard.press('p');
    expect(await nativeValue(page, 'fruit')).toBe('papaya');
    await page.keyboard.press('p');
    expect(await nativeValue(page, 'fruit')).toBe('pineapple');
  });

  test('typeahead with several letters matches the prefix', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.type('li');
    expect(await nativeValue(page, 'fruit')).toBe('lime');
    await page.waitForTimeout(700);
    await page.keyboard.type('ap');
    expect(await nativeValue(page, 'fruit')).toBe('apple');
  });

  test('typeahead skips disabled options', async ({ page }) => {
    await countChanges(page, 'fruit');
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('c');
    expect(await nativeValue(page, 'fruit')).toBe('banana');
    expect(await changes(page)).toBe(0);
  });

  test('typeahead while open moves the highlight but not the value', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('p');
    await expectActive(page, 'fruit', 'Papaya');
    await page.keyboard.press('p');
    await expectActive(page, 'fruit', 'Pineapple');
    expect(await nativeValue(page, 'fruit')).toBe('banana');
    await expectAriaConsistent(page, 'fruit');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'fruit')).toBe('pineapple');
  });

  test('Tab while open closes and moves focus to the next field', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expectOpen(page, 'fruit', false);
    await expect(page.locator('#after')).toBeFocused();
    expect(await nativeValue(page, 'fruit')).toBe('banana');
  });

  test('Shift+Tab while open closes and moves focus to the previous field', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+Tab');
    await expectOpen(page, 'fruit', false);
    await expect(page.locator('#before')).toBeFocused();
  });

  test('Delete and Backspace do nothing on a control that is not clearable', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    expect(await nativeValue(page, 'fruit')).toBe('banana');
  });
});

test.describe('page step at disabled edges', () => {
  const items = Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const disabled = index === 0 || index === 11 ? ' disabled' : '';
    const selected = index === 5 ? ' selected' : '';
    return `<option value="i${number}"${disabled}${selected}>Item ${number}</option>`;
  }).join('');
  const html = `<label for="items">Items</label><select id="items" data-flow-select data-fs-search="false">${items}</select>`;

  test('Home and End skip disabled edge rows', async ({ page }) => {
    await mount(page, html);
    await trigger(page, 'items').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await expectActive(page, 'items', 'Item 11');
    await page.keyboard.press('Home');
    await expectActive(page, 'items', 'Item 02');
  });

  // BUG: PageDown/PageUp do not move at all when the edge row is disabled
  test('PageDown and PageUp land on the last and first enabled option when the edge row is disabled', async ({ page }) => {
    await mount(page, html);
    await trigger(page, 'items').focus();
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'items', 'Item 06');
    await page.keyboard.press('PageDown');
    await expectActive(page, 'items', 'Item 11');
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press('ArrowUp');
    }
    await expectActive(page, 'items', 'Item 06');
    await page.keyboard.press('PageUp');
    await expectActive(page, 'items', 'Item 02');
  });
});

test.describe('clearable single', () => {
  test('Delete and Backspace on the closed control clear the value', async ({ page }) => {
    await mount(page, fruits('data-fs-clearable'));
    await countChanges(page, 'fruit');
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('Delete');
    expect(await nativeValue(page, 'fruit')).toBe('');
    await expect(root(page, 'fruit')).not.toHaveClass(/has-value/);
    await page.keyboard.press('g');
    expect(await nativeValue(page, 'fruit')).toBe('grape');
    await page.keyboard.press('Backspace');
    expect(await nativeValue(page, 'fruit')).toBe('');
    expect(await changes(page)).toBe(3);
    await expect(trigger(page, 'fruit')).toBeFocused();
  });

  test('the clear button is not a tab stop', async ({ page }) => {
    await mount(page, fruits('data-fs-clearable'));
    await focusFromBefore(page, 'fruit');
    await expect(root(page, 'fruit').locator('.fs-clear')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
  });

  // BUG: Backspace/Delete do not clear while the list is open (the demo key table says "Same" for open)
  test('Delete on the open control clears the value, as documented in the key table', async ({ page }) => {
    await mount(page, fruits('data-fs-clearable'));
    await focusFromBefore(page, 'fruit');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Delete');
    expect(await nativeValue(page, 'fruit')).toBe('');
  });
});

// ---------------- Inline search (field default) ----------------

test.describe('inline search', () => {
  test('typing on the focused control opens and filters the list', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    await expect(trigger(page, 'country')).toHaveAttribute('role', 'combobox');
    await expect(root(page, 'country').locator('.fs-trigger')).toHaveCount(0);
    await page.keyboard.type('no');
    await expectOpen(page, 'country');
    await expect(options(page, 'country')).toHaveText(['Norway']);
    await expectActive(page, 'country', 'Norway');
    await expect(trigger(page, 'country')).toHaveValue('no');
    await expectAriaConsistent(page, 'country');
  });

  test('the caret is hidden while closed and visible while open', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    expect(isTransparent(await caretColor(page, 'country'))).toBe(true);
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'country');
    expect(isTransparent(await caretColor(page, 'country'))).toBe(false);
    await page.keyboard.press('Escape');
    expect(isTransparent(await caretColor(page, 'country'))).toBe(true);
  });

  test('the value fades while open and hides while there is a query', async ({ page }) => {
    await mount(page, countries('true'));
    await page.evaluate(() => window.FlowSelect.get('#country').setValue('fr'));
    await focusFromBefore(page, 'country');
    expect(await valueStyle(page, 'country')).toEqual({ text: 'France', visibility: 'visible', opacity: 1 });
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await valueStyle(page, 'country')).opacity).toBeLessThan(1);
    await page.keyboard.type('ge');
    await expect.poll(async () => (await valueStyle(page, 'country')).visibility).toBe('hidden');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await valueStyle(page, 'country')).visibility).toBe('visible');
  });

  test('after selecting, the input is empty, the value shows again and focus stays', async ({ page }) => {
    await mount(page, countries('true'));
    await countChanges(page, 'country');
    await focusFromBefore(page, 'country');
    await page.keyboard.type('ger');
    await page.keyboard.press('Enter');
    await expectOpen(page, 'country', false);
    expect(await nativeValue(page, 'country')).toBe('de');
    await expect(trigger(page, 'country')).toHaveValue('');
    await expect(trigger(page, 'country')).toBeFocused();
    await expect(root(page, 'country')).not.toHaveClass(/has-query/);
    await expect.poll(() => valueStyle(page, 'country')).toEqual({ text: 'Germany', visibility: 'visible', opacity: 1 });
    expect(await changes(page)).toBe(1);
  });

  test('arrows move inside the filtered list and Enter selects', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('n');
    await expectActive(page, 'country', 'New Zealand');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'country', 'Norway');
    await expectAriaConsistent(page, 'country');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'country')).toBe('no');
  });

  test('search ignores diacritics', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('cote');
    await expect(options(page, 'country')).toHaveText(["Côte d'Ivoire"]);
  });

  test('Escape restores the value display and keeps the value and focus', async ({ page }) => {
    await mount(page, countries('true'));
    await page.evaluate(() => window.FlowSelect.get('#country').setValue('pe'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('fra');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'country', false);
    await expect(trigger(page, 'country')).toHaveValue('');
    await expect(trigger(page, 'country')).toBeFocused();
    expect(await nativeValue(page, 'country')).toBe('pe');
    await expect.poll(() => valueStyle(page, 'country')).toEqual({ text: 'Peru', visibility: 'visible', opacity: 1 });
  });

  test('Backspace and Delete on an empty clearable control clear the value', async ({ page }) => {
    await mount(page, countries('true', 'data-fs-clearable'));
    await page.evaluate(() => window.FlowSelect.get('#country').setValue('pe'));
    await focusFromBefore(page, 'country');
    await page.keyboard.press('Backspace');
    expect(await nativeValue(page, 'country')).toBe('');
    await expect(root(page, 'country').locator('.fs-value')).toHaveText('Pick a country');
    await page.evaluate(() => window.FlowSelect.get('#country').setValue('fr'));
    await page.keyboard.press('Delete');
    expect(await nativeValue(page, 'country')).toBe('');
    await expectOpen(page, 'country', false);
  });

  test('Backspace while typing only edits the query', async ({ page }) => {
    await mount(page, countries('true', 'data-fs-clearable'));
    await page.evaluate(() => window.FlowSelect.get('#country').setValue('pe'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('fr');
    await page.keyboard.press('Backspace');
    await expect(trigger(page, 'country')).toHaveValue('f');
    expect(await nativeValue(page, 'country')).toBe('pe');
  });

  test('Home and End move the caret, not the highlight, once text is typed', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('n');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'country', 'Norway');
    await page.keyboard.press('Home');
    await expectActive(page, 'country', 'Norway');
    const caret = await trigger(page, 'country').evaluate((input) => input.selectionStart);
    expect(caret).toBe(0);
  });

  test('Space types a space while searching', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('new z');
    await expect(trigger(page, 'country')).toHaveValue('new z');
    await expect(options(page, 'country')).toHaveText(['New Zealand']);
  });

  // BUG: Space on the closed inline field types a space into the query and hides the value
  test('Space on the closed field opens the list and keeps the value visible', async ({ page }) => {
    await mount(page, countries('true'));
    await page.evaluate(() => window.FlowSelect.get('#country').setValue('fr'));
    await focusFromBefore(page, 'country');
    await page.keyboard.press(' ');
    await expectOpen(page, 'country');
    await expect(trigger(page, 'country')).toHaveValue('');
    expect((await valueStyle(page, 'country')).visibility).toBe('visible');
  });

  test('Tab and Shift+Tab while open close and leave the control', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('n');
    await page.keyboard.press('Tab');
    await expectOpen(page, 'country', false);
    await expect(page.locator('#after')).toBeFocused();
    expect(await nativeValue(page, 'country')).toBe('');
    await page.keyboard.press('Shift+Tab');
    await expect(trigger(page, 'country')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+Tab');
    await expectOpen(page, 'country', false);
    await expect(page.locator('#before')).toBeFocused();
  });

  test('the live region announces result counts', async ({ page }) => {
    await mount(page, countries('true'));
    await focusFromBefore(page, 'country');
    await expect(live(page, 'country')).toHaveAttribute('aria-live', 'polite');
    await page.keyboard.type('n');
    await expect(live(page, 'country')).toHaveText('4 results', { timeout: 2000 });
    await page.keyboard.type('o');
    await expect(live(page, 'country')).toHaveText('1 result', { timeout: 2000 });
    await page.keyboard.type('zz');
    await expect(live(page, 'country')).toHaveText(/No results/, { timeout: 2000 });
  });
});

// ---------------- Dropdown search ----------------

test.describe('dropdown search', () => {
  const html = countries('dropdown', 'data-fs-variant="pill"');

  test('a printable key on the closed trigger opens and types into the search box', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await expect(trigger(page, 'country')).not.toHaveAttribute('role', /./);
    await page.keyboard.type('ge');
    await expectOpen(page, 'country');
    await expect(searchBox(page, 'country')).toBeFocused();
    await expect(searchBox(page, 'country')).toHaveValue('ge');
    await expect(options(page, 'country')).toHaveText(['Germany']);
    await expectAriaConsistent(page, 'country');
    await page.keyboard.press('Enter');
    await expectOpen(page, 'country', false);
    expect(await nativeValue(page, 'country')).toBe('de');
    await expect(trigger(page, 'country')).toBeFocused();
  });

  test('Enter on the closed trigger opens and focuses the search box', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.press('Enter');
    await expectOpen(page, 'country');
    await expect(searchBox(page, 'country')).toBeFocused();
    await expect(searchBox(page, 'country')).toHaveValue('');
    await expect(trigger(page, 'country')).toHaveAttribute('aria-expanded', 'true');
  });

  test('Escape closes and returns focus to the trigger', async ({ page }) => {
    await mount(page, html);
    await page.evaluate(() => window.FlowSelect.get('#country').setValue('fr'));
    await focusFromBefore(page, 'country');
    await page.keyboard.type('no');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'country', false);
    await expect(trigger(page, 'country')).toBeFocused();
    expect(await nativeValue(page, 'country')).toBe('fr');
    await expect(trigger(page, 'country')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Space types a space in the search box', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.press('Enter');
    await page.keyboard.type('new z');
    await expect(searchBox(page, 'country')).toHaveValue('new z');
    await expect(options(page, 'country')).toHaveText(['New Zealand']);
    await expectOpen(page, 'country');
  });

  test('Space on the closed trigger opens without typing', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.press(' ');
    await expectOpen(page, 'country');
    await expect(searchBox(page, 'country')).toHaveValue('');
    await page.waitForTimeout(200);
    expect(await isOpen(page, 'country')).toBe(true);
  });

  test('Tab from the search box closes and moves to the next field', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.press('ArrowDown');
    await expect(searchBox(page, 'country')).toBeFocused();
    await page.keyboard.press('Tab');
    await expectOpen(page, 'country', false);
    await expect(page.locator('#after')).toBeFocused();
  });

  test('Shift+Tab from the search box closes and moves to the previous field', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+Tab');
    await expectOpen(page, 'country', false);
    await expect(page.locator('#before')).toBeFocused();
  });

  test('Home and End move the highlight while the query is empty', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await expectActive(page, 'country', 'Peru');
    await page.keyboard.press('Home');
    await expectActive(page, 'country', 'Pick a country');
    await expectAriaConsistent(page, 'country');
  });

  test('the search box owns aria-activedescendant, the trigger never does', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(trigger(page, 'country')).not.toHaveAttribute('aria-activedescendant', /./);
    await expect(searchBox(page, 'country')).toHaveAttribute('role', 'combobox');
    const listboxId = await popover(page, 'country').locator('[role=listbox]').getAttribute('id');
    await expect(searchBox(page, 'country')).toHaveAttribute('aria-controls', listboxId);
    await expectAriaConsistent(page, 'country');
  });

  test('the live region announces result counts', async ({ page }) => {
    await mount(page, html);
    await focusFromBefore(page, 'country');
    await page.keyboard.type('n');
    await expect(live(page, 'country')).toHaveText('4 results', { timeout: 2000 });
  });
});

// ---------------- Multiple ----------------

test.describe('multiple', () => {
  function chips(page, id) {
    return root(page, id).locator('.fs-chip .fs-chip-label');
  }

  test('Enter toggles the highlighted option and keeps the list open', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'colours', 'Red');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'colours', 'Blue');
    await page.keyboard.press('Enter');
    await expectOpen(page, 'colours');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'green', 'blue']);
    await expect(activeRow(page, 'colours')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'green']);
    await expect(activeRow(page, 'colours')).toHaveAttribute('aria-selected', 'false');
    await expectAriaConsistent(page, 'colours');
  });

  test('the query clears after a pick and the full list comes back', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.type('yel');
    await expect(options(page, 'colours')).toHaveText(['Yellow']);
    await page.keyboard.press('Enter');
    await expect(trigger(page, 'colours')).toHaveValue('');
    await expectOpen(page, 'colours');
    await expect(options(page, 'colours')).toHaveCount(6);
    await expect(chips(page, 'colours')).toHaveText(['Red', 'Green', 'Yellow']);
    await expect(trigger(page, 'colours')).toBeFocused();
    await expectAriaConsistent(page, 'colours');
  });

  test('Backspace in the empty input removes the last chip, closed or open', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.press('Backspace');
    expect(await nativeValue(page, 'colours')).toEqual(['red']);
    await expectOpen(page, 'colours', false);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Backspace');
    expect(await nativeValue(page, 'colours')).toEqual([]);
    await expectOpen(page, 'colours');
  });

  test('Backspace with text in the input only edits the text', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.type('bl');
    await page.keyboard.press('Backspace');
    await expect(trigger(page, 'colours')).toHaveValue('b');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'green']);
  });

  test('ArrowLeft walks the chips, ArrowRight goes back to the input, and the live region names the chip', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    const active = root(page, 'colours').locator('.fs-chip.is-active');
    await page.keyboard.press('ArrowLeft');
    await expect(active).toHaveAttribute('data-value', 'green');
    await expect(live(page, 'colours')).toHaveText('Green');
    await page.keyboard.press('ArrowLeft');
    await expect(active).toHaveAttribute('data-value', 'red');
    await expect(live(page, 'colours')).toHaveText('Red');
    await page.keyboard.press('ArrowLeft');
    await expect(active).toHaveAttribute('data-value', 'red');
    await page.keyboard.press('ArrowRight');
    await expect(active).toHaveAttribute('data-value', 'green');
    await page.keyboard.press('ArrowRight');
    await expect(active).toHaveCount(0);
    await expect(trigger(page, 'colours')).toBeFocused();
  });

  test('Delete and Backspace remove the highlighted chip', async ({ page }) => {
    await mount(page, colours());
    await page.evaluate(() => window.FlowSelect.get('#colours').setValue(['red', 'green', 'blue']));
    await focusFromBefore(page, 'colours');
    const active = root(page, 'colours').locator('.fs-chip.is-active');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(active).toHaveAttribute('data-value', 'green');
    await page.keyboard.press('Delete');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'blue']);
    await expect(active).toHaveAttribute('data-value', 'blue');
    await page.keyboard.press('Backspace');
    expect(await nativeValue(page, 'colours')).toEqual(['red']);
    await expect(active).toHaveAttribute('data-value', 'red');
    await page.keyboard.press('Backspace');
    expect(await nativeValue(page, 'colours')).toEqual([]);
    await expect(active).toHaveCount(0);
    await expect(trigger(page, 'colours')).toBeFocused();
  });

  test('typing after walking the chips clears the chip highlight and types', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('pu');
    await expect(root(page, 'colours').locator('.fs-chip.is-active')).toHaveCount(0);
    await expect(trigger(page, 'colours')).toHaveValue('pu');
    await expect(options(page, 'colours')).toHaveText(['Purple']);
  });

  test('maxItems stops at the limit and announces it', async ({ page }) => {
    await mount(page, colours('data-fs-max-items="2"'));
    await focusFromBefore(page, 'colours');
    await page.keyboard.type('blu');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'green']);
    await expect(live(page, 'colours')).toHaveText('You can choose up to 2');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('blu');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'blue']);
  });

  test('hideSelected leaves selected options out of the list', async ({ page }) => {
    await mount(page, colours('data-fs-hide-selected'));
    await focusFromBefore(page, 'colours');
    await page.keyboard.press('ArrowDown');
    await expect(options(page, 'colours')).toHaveText(['Blue', 'Yellow', 'Purple', 'Orange']);
    await expectActive(page, 'colours', 'Blue');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'green', 'blue']);
    await expect(options(page, 'colours')).toHaveText(['Yellow', 'Purple', 'Orange']);
    await expectActive(page, 'colours', 'Yellow');
    await expectAriaConsistent(page, 'colours');
    await page.keyboard.press('Backspace');
    await expect(options(page, 'colours')).toHaveText(['Blue', 'Yellow', 'Purple', 'Orange']);
    await expectAriaConsistent(page, 'colours');
  });

  test('the create row adds a new value with Enter', async ({ page }) => {
    await mount(page, colours('data-fs-create'));
    await focusFromBefore(page, 'colours');
    await page.keyboard.type('Teal');
    const create = popover(page, 'colours').locator('.fs-create');
    await expect(create).toHaveCount(1);
    await expect(create).toHaveClass(/is-active/);
    await expectAriaConsistent(page, 'colours');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'green', 'Teal']);
    await expect(trigger(page, 'colours')).toHaveValue('');
    await expect(chips(page, 'colours')).toHaveText(['Red', 'Green', 'Teal']);
    await expect(trigger(page, 'colours')).toBeFocused();
  });

  test('no create row when the text matches an existing option', async ({ page }) => {
    await mount(page, colours('data-fs-create'));
    await focusFromBefore(page, 'colours');
    await page.keyboard.type('blue');
    await expect(popover(page, 'colours').locator('.fs-create')).toHaveCount(0);
    await expect(options(page, 'colours')).toHaveText(['Blue']);
  });

  test('Escape closes and clears the typed text but keeps the value', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.type('pur');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'colours', false);
    await expect(trigger(page, 'colours')).toHaveValue('');
    expect(await nativeValue(page, 'colours')).toEqual(['red', 'green']);
    await expect(trigger(page, 'colours')).toBeFocused();
  });

  test('Tab and Shift+Tab leave the open control', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expectOpen(page, 'colours', false);
    await expect(page.locator('#after')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+Tab');
    await expectOpen(page, 'colours', false);
    await expect(page.locator('#before')).toBeFocused();
  });

  test('chip remove buttons are not tab stops', async ({ page }) => {
    await mount(page, colours());
    await focusFromBefore(page, 'colours');
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(trigger(page, 'colours')).toBeFocused();
  });
});

// ---------------- Forms ----------------

test.describe('Enter never submits the surrounding form', () => {
  const form = `
    <form id="form" action="/never">
      <label for="f-none">None</label>
      <select id="f-none" name="none" data-flow-select data-fs-search="false">
        <option value="a">Alpha</option><option value="b">Beta</option>
      </select>
      <label for="f-inline">Inline</label>
      <select id="f-inline" name="inline" data-flow-select data-fs-search="inline" data-fs-create>
        <option value="a">Alpha</option><option value="b">Beta</option>
      </select>
      <label for="f-dropdown">Dropdown</label>
      <select id="f-dropdown" name="dropdown" data-flow-select data-fs-search="dropdown">
        <option value="a">Alpha</option><option value="b">Beta</option>
      </select>
      <label for="f-multi">Multi</label>
      <select id="f-multi" name="multi" multiple data-flow-select>
        <option value="a">Alpha</option><option value="b">Beta</option>
      </select>
      <button id="submit" type="submit">Save</button>
    </form>`;

  async function countSubmits(page) {
    await page.evaluate(() => {
      window.submits = 0;
      document.getElementById('form').addEventListener('submit', (event) => {
        event.preventDefault();
        window.submits += 1;
      });
    });
  }

  for (const id of ['f-none', 'f-inline', 'f-dropdown', 'f-multi']) {
    test(`Enter in ${id}: closed, open, after a pick and with no results`, async ({ page }) => {
      await mount(page, form);
      await countSubmits(page);
      await trigger(page, id).focus();
      await page.keyboard.press('Enter');
      await expectOpen(page, id);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      if (id === 'f-multi') {
        await expectOpen(page, id);
        await page.keyboard.press('Escape');
      } else {
        await expectOpen(page, id, false);
      }
      await page.keyboard.press('Enter');
      await expectOpen(page, id);
      if (id !== 'f-none') {
        await page.keyboard.type('zzz');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.submits)).toBe(0);
      expect(page.url()).toContain('/tests/fixtures/blank.html');
    });
  }

  test('a form whose only field is an inline control does not submit implicitly', async ({ page }) => {
    await mount(page, `
      <form id="form" action="/never">
        <label for="solo">Solo</label>
        <select id="solo" name="solo" data-flow-select data-fs-search="inline">
          <option value="a">Alpha</option><option value="b">Beta</option>
        </select>
      </form>`);
    await countSubmits(page);
    await trigger(page, 'solo').focus();
    await page.keyboard.type('be');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    expect(await nativeValue(page, 'solo')).toBe('b');
    expect(await page.evaluate(() => window.submits)).toBe(0);
  });
});

// ---------------- Dialogs ----------------

test.describe('inside a native modal dialog', () => {
  const variants = [
    ['no search', 'data-fs-search="false"', ''],
    ['inline search', 'data-fs-search="inline"', ''],
    ['dropdown search', 'data-fs-search="dropdown"', ''],
    ['multiple', '', 'multiple']
  ];

  for (const [name, search, multiple] of variants) {
    test(`first Escape closes only the list, the second closes the dialog (${name})`, async ({ page }) => {
      await mount(page, `
        <dialog id="dialog">
          <label for="size">Size</label>
          <select id="size" ${multiple} data-flow-select ${search}>
            <option value="s">Small</option>
            <option value="m" selected>Medium</option>
            <option value="l">Large</option>
          </select>
          <button type="button" id="ok">OK</button>
        </dialog>`);
      await page.evaluate(() => document.getElementById('dialog').showModal());
      await trigger(page, 'size').focus();
      await page.keyboard.press('ArrowDown');
      await expectOpen(page, 'size');
      await page.keyboard.press('Escape');
      await expectOpen(page, 'size', false);
      expect(await page.evaluate(() => document.getElementById('dialog').open)).toBe(true);
      await expect(trigger(page, 'size')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => document.getElementById('dialog').open)).toBe(false);
    });
  }

  test('the open list is usable by keyboard above the modal dialog', async ({ page }) => {
    await mount(page, `
      <dialog id="dialog">
        <label for="size">Size</label>
        <select id="size" data-flow-select data-fs-search="false">
          <option value="s">Small</option>
          <option value="m" selected>Medium</option>
          <option value="l">Large</option>
        </select>
      </dialog>`);
    await page.evaluate(() => document.getElementById('dialog').showModal());
    await trigger(page, 'size').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'size')).toBe('l');
    expect(await page.evaluate(() => document.getElementById('dialog').open)).toBe(true);
  });
});

test.describe('Bootstrap 5 modal and offcanvas', () => {
  async function ready(page) {
    await page.goto('/tests/fixtures/bootstrap.html');
    await page.waitForFunction(() => window.fixtureReady === true && window.bootstrap && document.querySelectorAll('.fs').length === 4);
  }

  async function openModal(page) {
    await page.locator('#open-modal').click();
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    await page.waitForTimeout(400);
  }

  test('modal: first Escape closes only the list, second closes the modal', async ({ page }) => {
    await ready(page);
    await openModal(page);
    await trigger(page, 'modal-select').focus();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'modal-select');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'modal-select', false);
    await page.waitForTimeout(400);
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    await expect(trigger(page, 'modal-select')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#demo-modal')).toBeHidden();
  });

  test('modal: the multiple control also closes only its list on the first Escape', async ({ page }) => {
    await ready(page);
    await openModal(page);
    await trigger(page, 'modal-tags').focus();
    await page.keyboard.type('al');
    await expectOpen(page, 'modal-tags');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'modal-tags', false);
    await page.waitForTimeout(400);
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#demo-modal')).toBeHidden();
  });

  test('modal: focus stays inside the modal while the list is open', async ({ page }) => {
    await ready(page);
    await openModal(page);
    await trigger(page, 'modal-select').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('u');
    await expectOpen(page, 'modal-select');
    expect(await page.evaluate(() => document.getElementById('demo-modal').contains(document.activeElement))).toBe(true);
    await expect(trigger(page, 'modal-select')).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'modal-select')).toBe('urgent');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expectOpen(page, 'modal-select', false);
    await expect(trigger(page, 'modal-tags')).toBeFocused();
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
  });

  test('offcanvas: first Escape closes only the list, second closes the offcanvas', async ({ page }) => {
    await ready(page);
    await page.locator('#open-offcanvas').click();
    await expect(page.locator('#demo-offcanvas')).toHaveClass(/show/);
    await page.waitForTimeout(400);
    await trigger(page, 'offcanvas-select').focus();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'offcanvas-select');
    expect(await page.evaluate(() => document.getElementById('demo-offcanvas').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expectOpen(page, 'offcanvas-select', false);
    await page.waitForTimeout(400);
    await expect(page.locator('#demo-offcanvas')).toHaveClass(/show/);
    await expect(trigger(page, 'offcanvas-select')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#demo-offcanvas')).not.toHaveClass(/show/);
  });
});

// ---------------- Focus delegation ----------------

test.describe('focus delegation', () => {
  test('clicking the label focuses the control without opening it', async ({ page }) => {
    await mount(page, `
      <label for="lf">Fruit</label>
      <select id="lf" data-flow-select data-fs-search="false"><option value="a">Apple</option><option value="b">Banana</option></select>
      <label for="li">Inline</label>
      <select id="li" data-flow-select data-fs-search="inline"><option value="a">Apple</option></select>
      <label for="ld">Dropdown</label>
      <select id="ld" data-flow-select data-fs-search="dropdown"><option value="a">Apple</option></select>
      <label for="lm">Multi</label>
      <select id="lm" multiple data-flow-select><option value="a">Apple</option></select>`);
    for (const id of ['lf', 'li', 'ld', 'lm']) {
      await page.locator(`label[for=${id}]`).click();
      await expect(trigger(page, id)).toBeFocused();
      await expectOpen(page, id, false);
    }
  });

  test('select.focus() focuses the control', async ({ page }) => {
    await mount(page, ALL_MODES);
    for (const id of MODE_IDS) {
      await page.evaluate((id) => document.getElementById(id).focus(), id);
      await expect(trigger(page, id)).toBeFocused();
    }
  });

  test('browser validation focuses the control and marks it invalid', async ({ page }) => {
    await mount(page, `
      <form id="form">
        <label for="plan">Plan</label>
        <select id="plan" name="plan" required data-flow-select data-fs-search="false">
          <option value="">Choose a plan</option>
          <option value="basic">Basic</option>
          <option value="plus">Plus</option>
        </select>
        <button id="go" type="submit">Go</button>
      </form>`);
    await page.evaluate(() => {
      window.submitted = 0;
      document.getElementById('form').addEventListener('submit', (event) => {
        event.preventDefault();
        window.submitted += 1;
      });
    });
    await page.locator('#go').click();
    await expect(trigger(page, 'plan')).toBeFocused();
    await expect(root(page, 'plan')).toHaveClass(/is-invalid/);
    await expect(trigger(page, 'plan')).toHaveAttribute('aria-required', 'true');
    expect(await page.evaluate(() => window.submitted)).toBe(0);
    await page.keyboard.press('b');
    await expect(root(page, 'plan')).not.toHaveClass(/is-invalid/);
  });

  test('browser validation focuses a multiple control', async ({ page }) => {
    await mount(page, `
      <form id="form">
        <label for="needs">Needs</label>
        <select id="needs" name="needs" multiple required data-flow-select>
          <option value="a">Alpha</option>
          <option value="b">Beta</option>
        </select>
        <button id="go" type="submit">Go</button>
      </form>`);
    await page.evaluate(() => document.getElementById('form').addEventListener('submit', (event) => event.preventDefault()));
    await page.locator('#go').click();
    await expect(trigger(page, 'needs')).toBeFocused();
    await expect(root(page, 'needs')).toHaveClass(/is-invalid/);
  });

  // BUG: the invalid state is visual only, the control never gets aria-invalid
  test('the invalid state is exposed to assistive technology', async ({ page }) => {
    await mount(page, `
      <form id="form">
        <label for="plan">Plan</label>
        <select id="plan" name="plan" required data-flow-select data-fs-search="false">
          <option value="">Choose a plan</option>
          <option value="basic">Basic</option>
        </select>
        <button id="go" type="submit">Go</button>
      </form>`);
    await page.evaluate(() => document.getElementById('form').addEventListener('submit', (event) => event.preventDefault()));
    await page.locator('#go').click();
    await expect(root(page, 'plan')).toHaveClass(/is-invalid/);
    await expect(trigger(page, 'plan')).toHaveAttribute('aria-invalid', 'true');
  });

  test('no focus trap: each control is exactly one tab stop, forwards and backwards', async ({ page }) => {
    await mount(page, ALL_MODES);
    await page.locator('#before').focus();
    for (const id of MODE_IDS) {
      await page.keyboard.press('Tab');
      await expect(trigger(page, id)).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
    for (const id of [...MODE_IDS].reverse()) {
      await page.keyboard.press('Shift+Tab');
      await expect(trigger(page, id)).toBeFocused();
    }
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#before')).toBeFocused();
  });

  test('no focus trap: Tab and Shift+Tab leave every control while its list is open', async ({ page }) => {
    await mount(page, ALL_MODES);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    for (const id of MODE_IDS) {
      await expect(trigger(page, id)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expectOpen(page, id);
      await page.keyboard.press('Tab');
      await expectOpen(page, id, false);
    }
    await expect(page.locator('#after')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    for (const id of [...MODE_IDS].reverse()) {
      await expect(trigger(page, id)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expectOpen(page, id);
      await page.keyboard.press('Shift+Tab');
      await expectOpen(page, id, false);
    }
    await expect(page.locator('#before')).toBeFocused();
  });

  test('a disabled select is skipped by Tab and cannot be opened', async ({ page }) => {
    await mount(page, `
      <input id="before" aria-label="Before">
      <label for="off">Off</label>
      <select id="off" disabled data-flow-select data-fs-search="false"><option value="a">Alpha</option></select>
      <label for="off2">Off 2</label>
      <select id="off2" disabled data-flow-select data-fs-search="inline"><option value="a">Alpha</option></select>
      <input id="after" aria-label="After">`);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#after')).toBeFocused();
    await expect(trigger(page, 'off')).toBeDisabled();
    await expect(trigger(page, 'off2')).toBeDisabled();
    await expect(root(page, 'off')).toHaveClass(/is-disabled/);
  });
});

// ---------------- ARIA ----------------

test.describe('aria', () => {
  test('role, haspopup, expanded and controls are on the right element in every mode', async ({ page }) => {
    await mount(page, ALL_MODES);
    const expected = {
      'm-none': { selector: '.fs-trigger', role: 'combobox' },
      'm-inline': { selector: '.fs-control .fs-input', role: 'combobox' },
      'm-dropdown': { selector: '.fs-trigger', role: null },
      'm-multi': { selector: '.fs-control .fs-input', role: 'combobox' }
    };
    for (const id of MODE_IDS) {
      const focus = root(page, id).locator(expected[id].selector);
      await expect(focus).toHaveCount(1);
      if (expected[id].role) {
        await expect(focus).toHaveAttribute('role', expected[id].role);
      } else {
        await expect(focus).not.toHaveAttribute('role', /./);
      }
      expect(await root(page, id).locator('.fs-control [role=combobox]').count()).toBe(expected[id].role ? 1 : 0);
      await expect(focus).toHaveAttribute('aria-haspopup', 'listbox');
      await expect(focus).toHaveAttribute('aria-expanded', 'false');
      await focus.focus();
      await page.keyboard.press('ArrowDown');
      await expectOpen(page, id);
      await expect(focus).toHaveAttribute('aria-expanded', 'true');
      const listbox = popover(page, id).locator('[role=listbox]');
      await expect(listbox).toHaveCount(1);
      await expect(focus).toHaveAttribute('aria-controls', await listbox.getAttribute('id'));
      if (id === 'm-multi') {
        await expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
      } else {
        await expect(listbox).not.toHaveAttribute('aria-multiselectable', /./);
      }
      await expectAriaConsistent(page, id);
      await page.keyboard.press('Escape');
      await expect(focus).toHaveAttribute('aria-expanded', 'false');
      await expectAriaConsistent(page, id);
    }
  });

  test('aria-activedescendant always points to the highlighted option across a key sequence', async ({ page }) => {
    await mount(page, fruits() + colours('data-fs-hide-selected data-fs-create'));
    await trigger(page, 'fruit').focus();
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'End', 'PageUp', 'Home', 'p', 'p', 'ArrowUp', 'Escape', 'End', 'Enter']) {
      await page.keyboard.press(key);
      await expectAriaConsistent(page, 'fruit');
    }
    await trigger(page, 'colours').focus();
    for (const key of ['ArrowDown', 'Enter', 'ArrowDown', 'Enter', 'b', 'ArrowDown', 'Backspace', 'x', 'Enter', 'ArrowLeft', 'Delete', 'End', 'Escape']) {
      await page.keyboard.press(key);
      await expectAriaConsistent(page, 'colours');
    }
  });

  test('aria-activedescendant stays valid while filtering, including no results', async ({ page }) => {
    await mount(page, countries('true'));
    await trigger(page, 'country').focus();
    for (const key of ['n', 'o', 'Backspace', 'ArrowDown', 'z', 'z', 'Backspace', 'Backspace', 'Backspace', 'End']) {
      await page.keyboard.press(key);
      await expectAriaConsistent(page, 'country');
    }
    await page.keyboard.type('qq');
    await expect(popover(page, 'country').locator('.fs-option')).toHaveCount(0);
    await expect(trigger(page, 'country')).not.toHaveAttribute('aria-activedescendant', /./);
  });

  test('aria-selected follows the value after keyboard changes', async ({ page }) => {
    await mount(page, fruits());
    await trigger(page, 'fruit').focus();
    await page.keyboard.press('g');
    await page.keyboard.press('ArrowDown');
    const selected = popover(page, 'fruit').locator('[role=option][aria-selected=true]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveText('Grape');
    await expect(popover(page, 'fruit').locator('[role=option]:not([aria-selected])')).toHaveCount(0);
  });

  test('disabled options carry aria-disabled and are skipped', async ({ page }) => {
    await mount(page, fruits() + `
      <label for="grouped">Grouped</label>
      <select id="grouped" data-flow-select data-fs-search="false">
        <option value="x">Free</option>
        <optgroup label="Locked"><option value="y" disabled>Inside</option></optgroup>
        <optgroup label="Closed" disabled><option value="z">Shut</option></optgroup>
      </select>`);
    await trigger(page, 'fruit').focus();
    await page.keyboard.press('ArrowDown');
    await expect(options(page, 'fruit').filter({ hasText: 'Cherry' })).toHaveAttribute('aria-disabled', 'true');
    await expect(popover(page, 'fruit').locator('[aria-disabled=true]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await trigger(page, 'grouped').focus();
    await page.keyboard.press('ArrowDown');
    await expect(options(page, 'grouped').filter({ hasText: 'Inside' })).toHaveAttribute('aria-disabled', 'true');
    await expect(options(page, 'grouped').filter({ hasText: 'Shut' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await expectActive(page, 'grouped', 'Free');
  });

  test('group headers are not options and carry no id', async ({ page }) => {
    await mount(page, fruits());
    await trigger(page, 'fruit').focus();
    await page.keyboard.press('ArrowDown');
    const groups = popover(page, 'fruit').locator('.fs-group');
    await expect(groups).toHaveText(['Citrus', 'Tropical']);
    for (const group of await groups.all()) {
      await expect(group).not.toHaveAttribute('role', 'option');
      await expect(group).not.toHaveAttribute('id', /./);
    }
  });

  test('accessible names resolve to the label, and to label plus value where intended', async ({ page }) => {
    await mount(page, ALL_MODES);
    await expect(trigger(page, 'm-none')).toHaveAccessibleName('None');
    await expect(trigger(page, 'm-inline')).toHaveAccessibleName('Inline Beta');
    await expect(trigger(page, 'm-dropdown')).toHaveAccessibleName('Dropdown Beta');
    await expect(trigger(page, 'm-multi')).toHaveAccessibleName('Multi');
    const labels = { 'm-none': 'None', 'm-inline': 'Inline', 'm-dropdown': 'Dropdown', 'm-multi': 'Multi' };
    for (const id of MODE_IDS) {
      await trigger(page, id).focus();
      await page.keyboard.press('ArrowDown');
      await expect(popover(page, id).locator('[role=listbox]')).toHaveAccessibleName(labels[id]);
      await page.keyboard.press('Escape');
    }
    await trigger(page, 'm-dropdown').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('gam');
    await page.keyboard.press('Enter');
    await expect(trigger(page, 'm-dropdown')).toHaveAccessibleName('Dropdown Gamma');
  });

  test('aria-label on the select is copied when there is no label', async ({ page }) => {
    await mount(page, `
      <select id="bare" aria-label="Sort order" data-flow-select data-fs-search="false">
        <option value="new">Newest</option><option value="old">Oldest</option>
      </select>`);
    await expect(trigger(page, 'bare')).toHaveAccessibleName('Sort order');
    await trigger(page, 'bare').focus();
    await page.keyboard.press('ArrowDown');
    await expect(popover(page, 'bare').locator('[role=listbox]')).toHaveAccessibleName('Sort order');
  });

  test('aria-describedby on the select is copied to the control', async ({ page }) => {
    await mount(page, `
      <label for="described">Described</label>
      <select id="described" aria-describedby="hint" data-flow-select data-fs-search="false">
        <option value="a">Alpha</option>
      </select>
      <p id="hint">Pick one</p>`);
    await expect(trigger(page, 'described')).toHaveAccessibleDescription('Pick one');
  });

  test('a wrapping label names the control without repeating option text', async ({ page }) => {
    await mount(page, `
      <label>Fruit
        <select id="wrapped" data-flow-select data-fs-search="false">
          <option value="a">Apple</option><option value="b">Banana</option>
        </select>
      </label>`);
    await expect(trigger(page, 'wrapped')).toHaveAccessibleName(/^Fruit/);
    await trigger(page, 'wrapped').focus();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'wrapped');
    await expect(trigger(page, 'wrapped')).toHaveAccessibleName(/^Fruit/);
    await expect(trigger(page, 'wrapped')).not.toHaveAccessibleName(/Apple.*Banana/);
  });

  test('the hidden native select is aria-hidden and out of the tab order', async ({ page }) => {
    await mount(page, ALL_MODES);
    for (const id of MODE_IDS) {
      const select = page.locator(`select#${id}`);
      await expect(select).toHaveAttribute('aria-hidden', 'true');
      await expect(select).toHaveAttribute('tabindex', '-1');
      await expect(select).toHaveClass(/fs-native/);
    }
  });

  test('aria-required follows the required attribute', async ({ page }) => {
    await mount(page, `
      <label for="req">Req</label>
      <select id="req" required data-flow-select data-fs-search="inline"><option value="">Pick</option><option value="a">Alpha</option></select>
      <label for="opt">Opt</label>
      <select id="opt" data-flow-select data-fs-search="false"><option value="a">Alpha</option></select>`);
    await expect(trigger(page, 'req')).toHaveAttribute('aria-required', 'true');
    await expect(trigger(page, 'opt')).not.toHaveAttribute('aria-required', /./);
  });

  test('no duplicate ids and no dangling id references after opening several controls', async ({ page }) => {
    await mount(page, ALL_MODES + `
      <label for="extra">Extra</label>
      <select id="extra" data-flow-select data-fs-search="false">${FRUIT_OPTIONS}</select>`);
    for (const id of [...MODE_IDS, 'extra']) {
      await trigger(page, id).focus();
      await page.keyboard.press('ArrowDown');
      await expectOpen(page, id);
      await page.keyboard.press('Escape');
    }
    const report = await page.evaluate(() => {
      const seen = new Map();
      for (const node of document.querySelectorAll('[id]')) {
        seen.set(node.id, (seen.get(node.id) ?? 0) + 1);
      }
      const duplicates = Array.from(seen).filter(([, count]) => count > 1).map(([id]) => id);
      const dangling = [];
      for (const node of document.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby]')) {
        for (const name of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
          for (const ref of (node.getAttribute(name) ?? '').split(/\s+/).filter(Boolean)) {
            if (!document.getElementById(ref)) {
              dangling.push(`${name}=${ref}`);
            }
          }
        }
      }
      return { duplicates, dangling };
    });
    expect(report).toEqual({ duplicates: [], dangling: [] });
  });

  test('icons in the control and the list are hidden from assistive technology', async ({ page }) => {
    await mount(page, ALL_MODES);
    for (const id of MODE_IDS) {
      await trigger(page, id).focus();
      await page.keyboard.press('ArrowDown');
      expect(await root(page, id).locator('svg:not([aria-hidden=true])').count()).toBe(0);
      await page.keyboard.press('Escape');
    }
  });
});

// ---------------- Forced colors (Windows High Contrast) ----------------

test.describe('forced colors', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await mount(page, fruits());
    const supported = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
    test.skip(!supported, 'this browser cannot emulate forced colors');
  });

  // BUG: the keyboard highlight in the list is invisible in forced-colors mode
  test('the highlighted option is visibly different from the other options', async ({ page }) => {
    await trigger(page, 'fruit').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
    const rows = options(page, 'fruit');
    const active = await rows.nth(1).boundingBox();
    const other = await rows.nth(0).boundingBox();
    const strip = (box) => ({ x: box.x + 2, y: box.y + 2, width: 6, height: Math.max(4, box.height - 4) });
    const activePixels = await page.screenshot({ clip: strip(active) });
    const otherPixels = await page.screenshot({ clip: strip(other) });
    expect(activePixels.equals(otherPixels)).toBe(false);
  });

  // BUG: the control's keyboard focus indicator is invisible in forced-colors mode
  test('the focused control is visibly different from the unfocused control', async ({ page }) => {
    await focusFromBefore(page, 'fruit');
    await page.waitForTimeout(200);
    const focused = await root(page, 'fruit').locator('.fs-control').screenshot();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    const blurred = await root(page, 'fruit').locator('.fs-control').screenshot();
    expect(focused.equals(blurred)).toBe(false);
  });
});

// ---------------- Right to left ----------------

test.describe('right to left', () => {
  const html = `
    <div dir="rtl" style="padding: 40px 120px;">
      <label for="tint">Tint</label>
      <select id="tint" data-flow-select data-fs-variant="pill" data-fs-search="false">
        <option value="a">Amber</option>
        <option value="b" selected>Beige</option>
        <option value="c">Coral</option>
      </select>
    </div>`;

  test('arrows still move up and down', async ({ page }) => {
    await mount(page, html);
    await trigger(page, 'tint').focus();
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'tint', 'Beige');
    await page.keyboard.press('ArrowDown');
    await expectActive(page, 'tint', 'Coral');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expectActive(page, 'tint', 'Amber');
    await page.keyboard.press('Enter');
    expect(await nativeValue(page, 'tint')).toBe('a');
  });

  test('the popover aligns to the right edge of the control', async ({ page }) => {
    await mount(page, html);
    await trigger(page, 'tint').focus();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'tint');
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => {
      const fs = document.querySelector('.fs:has(> select#tint)');
      const control = fs.querySelector('.fs-control').getBoundingClientRect();
      const pop = fs.querySelector('.fs-popover').getBoundingClientRect();
      return { controlRight: control.right, popRight: pop.right, controlWidth: control.width, popWidth: pop.width };
    });
    expect(box.popWidth).toBeGreaterThan(box.controlWidth);
    expect(Math.abs(box.popRight - box.controlRight)).toBeLessThanOrEqual(1);
  });

  // BUG: chip arrow keys are not mirrored in right-to-left layouts
  test('multiple: the arrow key that points at the chips walks them', async ({ page }) => {
    await mount(page, `
      <div dir="rtl" style="width: 360px">
        <label for="rtl-tags">Tags</label>
        <select id="rtl-tags" multiple data-flow-select>
          <option value="a" selected>Alpha</option>
          <option value="b" selected>Beta</option>
          <option value="c">Gamma</option>
        </select>
      </div>`);
    const layout = await page.evaluate(() => {
      const fs = document.querySelector('.fs:has(> select#rtl-tags)');
      const chips = fs.querySelectorAll('.fs-chip');
      const input = fs.querySelector('.fs-control .fs-input').getBoundingClientRect();
      return { lastChipLeft: chips[chips.length - 1].getBoundingClientRect().left, inputLeft: input.left };
    });
    expect(layout.lastChipLeft).toBeGreaterThan(layout.inputLeft);
    await trigger(page, 'rtl-tags').focus();
    await page.keyboard.press('ArrowRight');
    await expect(root(page, 'rtl-tags').locator('.fs-chip.is-active')).toHaveAttribute('data-value', 'b');
  });
});
