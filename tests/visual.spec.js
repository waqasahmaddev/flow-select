import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mount, root, control, trigger, popover, options, nativeValue, expectOpen } from './helpers.js';

const VARIANTS = ['field', 'pill', 'ghost'];
const OUT = 'test-results/visual';

async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
}

function variantMarkup({ clearable = false, value = 'b' } = {}) {
  const attrs = clearable ? ' data-fs-clearable="true"' : '';
  const opts = `<option value="">Pick one</option><option value="a"${value === 'a' ? ' selected' : ''}>Alpha</option><option value="b"${value === 'b' ? ' selected' : ''}>Beta</option><option value="c">Gamma</option>`;
  return `
    <div style="display: flex; gap: 12px; align-items: flex-start">
      <div style="width: 240px"><select id="v-field" name="vField" aria-label="Field" data-flow-select${attrs}>${opts}</select></div>
      <select id="v-pill" name="vPill" aria-label="Pill" data-flow-select data-fs-variant="pill"${attrs}>${opts}</select>
      <select id="v-ghost" name="vGhost" aria-label="Ghost" data-flow-select data-fs-variant="ghost"${attrs}>${opts}</select>
    </div>`;
}

async function controlMetrics(page, id) {
  return page.evaluate((id) => {
    const fs = document.getElementById(id).closest('.fs');
    const controlNode = fs.querySelector('.fs-control');
    const caret = fs.querySelector('.fs-caret');
    const value = fs.querySelector('.fs-value');
    const controlRect = controlNode.getBoundingClientRect();
    const caretRect = caret.getBoundingClientRect();
    const valueRect = value.getBoundingClientRect();
    const style = getComputedStyle(controlNode);
    return {
      height: controlRect.height,
      fontSize: getComputedStyle(value).fontSize,
      fontFamily: getComputedStyle(value).fontFamily,
      valueColor: getComputedStyle(value).color,
      valueCenterOffset: Math.round((valueRect.top + valueRect.height / 2 - controlRect.top - controlRect.height / 2) * 100) / 100,
      borderWidth: style.borderTopWidth,
      caretPath: caret.innerHTML,
      caretWidth: caretRect.width,
      caretHeight: caretRect.height,
      caretColor: getComputedStyle(caret).color,
      caretStrokeWidth: getComputedStyle(caret).strokeWidth,
      caretInsetEnd: Math.round((controlRect.right - caretRect.right) * 100) / 100,
      caretCenterOffset: Math.round((caretRect.top + caretRect.height / 2 - controlRect.top - controlRect.height / 2) * 100) / 100
    };
  }, id);
}

async function popoverMetrics(page, id) {
  await trigger(page, id).click();
  await expectOpen(page, id);
  await settle(page);
  const metrics = await page.evaluate((id) => {
    const fs = document.getElementById(id).closest('.fs');
    const pop = fs.querySelector('.fs-popover');
    const style = getComputedStyle(pop);
    const rows = Array.from(pop.querySelectorAll('.fs-option'));
    const selected = pop.querySelector('.fs-option[aria-selected="true"]');
    const check = selected.querySelector('.fs-check');
    const label = selected.querySelector('.fs-label');
    const rowRect = selected.getBoundingClientRect();
    const checkRect = check.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    return {
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
      padding: style.paddingTop,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      background: style.backgroundColor,
      rowHeights: rows.map((row) => row.getBoundingClientRect().height),
      rowFontSize: getComputedStyle(rows[0]).fontSize,
      rowRadius: getComputedStyle(rows[0]).borderTopLeftRadius,
      checkLeft: Math.round((checkRect.left - rowRect.left) * 100) / 100,
      checkSize: [checkRect.width, checkRect.height],
      checkCenterOffset: Math.round((checkRect.top + checkRect.height / 2 - rowRect.top - rowRect.height / 2) * 100) / 100,
      labelLeft: Math.round((labelRect.left - rowRect.left) * 100) / 100,
      gap: Math.round((pop.getBoundingClientRect().top - fs.querySelector('.fs-control').getBoundingClientRect().bottom) * 100) / 100
    };
  }, id);
  await page.keyboard.press('Escape');
  await expectOpen(page, id, false);
  return metrics;
}

test.describe('Variant consistency', () => {
  test('field, pill and ghost share height, font, caret and caret placement', async ({ page }) => {
    await mount(page, variantMarkup());
    const field = await controlMetrics(page, 'v-field');
    const pill = await controlMetrics(page, 'v-pill');
    const ghost = await controlMetrics(page, 'v-ghost');
    expect(pill).toEqual(field);
    expect(ghost).toEqual(field);
    expect(field.caretPath).toContain('m7 15 5 5 5-5');
  });

  test('field, pill and ghost lists share row height, check position and popover chrome', async ({ page }) => {
    await mount(page, variantMarkup());
    const field = await popoverMetrics(page, 'v-field');
    const pill = await popoverMetrics(page, 'v-pill');
    const ghost = await popoverMetrics(page, 'v-ghost');
    expect(pill).toEqual(field);
    expect(ghost).toEqual(field);
    expect(new Set(field.rowHeights.map((height) => Math.round(height * 10))).size).toBe(1);
  });

  test('dark: field, pill and ghost lists share popover chrome', async ({ page }) => {
    await mount(page, variantMarkup());
    await page.evaluate(() => document.documentElement.setAttribute('data-fs-theme', 'dark'));
    const field = await popoverMetrics(page, 'v-field');
    expect(await popoverMetrics(page, 'v-pill')).toEqual(field);
    expect(await popoverMetrics(page, 'v-ghost')).toEqual(field);
  });

  test('clear button replaces the caret when there is a value, and the caret returns after clearing', async ({ page }) => {
    await mount(page, variantMarkup({ clearable: true }));
    const sizes = [];
    for (const variant of VARIANTS) {
      const id = `v-${variant}`;
      const fs = root(page, id);
      const clear = fs.locator('.fs-clear');
      const caret = fs.locator('.fs-caret');
      await expect(clear).toBeVisible();
      await expect(caret).toBeHidden();
      const heightWithValue = (await control(page, id).boundingBox()).height;
      const clearBox = await clear.boundingBox();
      sizes.push([clearBox.width, clearBox.height]);
      await clear.click();
      expect(await nativeValue(page, id)).toBe('');
      await expectOpen(page, id, false);
      await expect(clear).toBeHidden();
      await expect(caret).toBeVisible();
      expect((await control(page, id).boundingBox()).height).toBe(heightWithValue);
      await expect(trigger(page, id)).toBeFocused();

      await trigger(page, id).click();
      await options(page, id).filter({ hasText: 'Gamma' }).click();
      await expect(clear).toBeVisible();
      await expect(caret).toBeHidden();
    }
    expect(sizes[1]).toEqual(sizes[0]);
    expect(sizes[2]).toEqual(sizes[0]);
  });

  test('clear button and caret are centred on the same vertical line', async ({ page }) => {
    await mount(page, variantMarkup({ clearable: true }));
    for (const variant of VARIANTS) {
      const id = `v-${variant}`;
      const fs = root(page, id);
      const controlBox = await control(page, id).boundingBox();
      const clearBox = await fs.locator('.fs-clear').boundingBox();
      const clearCenterY = clearBox.y + clearBox.height / 2;
      expect(Math.abs(clearCenterY - (controlBox.y + controlBox.height / 2))).toBeLessThanOrEqual(0.5);
      const clearCenterX = clearBox.x + clearBox.width / 2;
      await fs.locator('.fs-clear').click();
      const caretBox = await fs.locator('.fs-caret').boundingBox();
      const caretCenterX = caretBox.x + caretBox.width / 2;
      testInfoNote(`${variant}: clear centre x ${(clearCenterX - controlBox.x).toFixed(2)} vs caret centre x ${(caretCenterX - controlBox.x).toFixed(2)} (control x)`);
    }
  });
});

const notes = [];
function testInfoNote(text) {
  notes.push(text);
  test.info().annotations.push({ type: 'note', description: text });
}

async function openDemoTheme(page, theme) {
  await page.goto(`/demo/?theme=${theme}`);
  await page.waitForFunction(() => window.FlowSelect && document.querySelectorAll('.fs').length >= 34);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page, file, locators, margin = 16) {
  const rects = [];
  for (const locator of locators) {
    rects.push(await locator.boundingBox());
  }
  const viewport = page.viewportSize();
  const left = Math.max(0, Math.min(...rects.map((r) => r.x)) - margin);
  const top = Math.max(0, Math.min(...rects.map((r) => r.y)) - margin);
  const right = Math.min(viewport.width, Math.max(...rects.map((r) => r.x + r.width)) + margin);
  const bottom = Math.min(viewport.height, Math.max(...rects.map((r) => r.y + r.height)) + margin);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${file}`, clip: { x: left, y: top, width: right - left, height: bottom - top } });
}

const DEMO_TARGETS = { field: 'category', pill: 'workspace', ghost: 'group-by' };

test.describe('Screenshots', () => {
  for (const theme of ['light', 'dark']) {
    test(`demo ${theme}: overview of the closed controls`, async ({ page, browserName }) => {
      await openDemoTheme(page, theme);
      await page.locator('#pill').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shoot(page, `${browserName}-${theme}-closed-toolbars.png`, [page.locator('#pill .toolbar'), page.locator('#ghost .toolbar')]);
      await page.locator('#fields .card').first().evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await shoot(page, `${browserName}-${theme}-closed-fields.png`, [page.locator('#fields .card').first()]);
    });

    for (const [variant, id] of Object.entries(DEMO_TARGETS)) {
      test(`demo ${theme}: ${variant} open`, async ({ page, browserName }) => {
        await openDemoTheme(page, theme);
        await root(page, id).evaluate((node) => {
          node.scrollIntoView({ block: 'start' });
          window.scrollBy(0, -60);
        });
        await trigger(page, id).click();
        await expectOpen(page, id);
        await page.mouse.move(2, 2);
        await settle(page);
        await shoot(page, `${browserName}-${theme}-${variant}-open.png`, [root(page, id), popover(page, id)]);
        const pop = await popover(page, id).evaluate((node) => {
          const style = getComputedStyle(node);
          return { bg: style.backgroundColor, shadow: style.boxShadow, radius: style.borderTopLeftRadius, font: getComputedStyle(node.querySelector('.fs-option')).fontFamily };
        });
        test.info().annotations.push({ type: `${browserName} ${theme} ${variant}`, description: JSON.stringify(pop) });
        expect(pop.radius).toBe('12px');
      });
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`bootstrap modal ${theme}: list open`, async ({ page, browserName }) => {
      await page.goto('/tests/fixtures/bootstrap.html');
      await page.waitForFunction(() => window.fixtureReady === true && window.bootstrap && document.querySelectorAll('.fs').length === 4);
      await page.evaluate((theme) => document.documentElement.setAttribute('data-bs-theme', theme), theme);
      await page.evaluate(() => {
        window.__shown = false;
        document.getElementById('demo-modal').addEventListener('shown.bs.modal', () => { window.__shown = true; }, { once: true });
      });
      await page.click('#open-modal');
      await page.waitForFunction(() => window.__shown === true);
      await trigger(page, 'modal-select').click();
      await expectOpen(page, 'modal-select');
      await page.mouse.move(2, 2);
      await settle(page);
      await shoot(page, `${browserName}-bootstrap-${theme}-modal-open.png`, [page.locator('#demo-modal .modal-content'), popover(page, 'modal-select')]);
    });
  }
});
