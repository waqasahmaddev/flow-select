import { test, expect } from '@playwright/test';
import { mount, root, control, trigger, popover, options, nativeValue, expectOpen } from './helpers.js';

const LIGHT = { text: 'rgb(24, 24, 27)', border: 'rgb(212, 212, 216)', popBg: 'rgb(255, 255, 255)', popBorder: 'rgb(228, 228, 231)' };
const DARK = { text: 'rgb(236, 236, 236)', border: 'rgb(69, 69, 69)', popBg: 'rgb(43, 43, 43)', popBorder: 'rgb(58, 58, 58)' };

const SIMPLE = `
  <option value="low">Low</option>
  <option value="medium">Medium</option>
  <option value="high">High</option>`;

async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
}

async function themeColors(page, id) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page);
  const border = await control(page, id).evaluate((node) => getComputedStyle(node).borderTopColor);
  await trigger(page, id).click();
  await expectOpen(page, id);
  await settle(page);
  const colors = await page.evaluate((id) => {
    const fs = document.getElementById(id).closest('.fs');
    const controlStyle = getComputedStyle(fs.querySelector('.fs-control'));
    const popoverStyle = getComputedStyle(fs.querySelector('.fs-popover'));
    return {
      text: controlStyle.color,
      popBg: popoverStyle.backgroundColor,
      popBorder: popoverStyle.borderTopColor
    };
  }, id);
  await page.keyboard.press('Escape');
  await expectOpen(page, id, false);
  return { ...colors, border };
}

function closedBorder(colors) {
  return { text: colors.text, popBg: colors.popBg, popBorder: colors.popBorder };
}

function expectScheme(actual, expected) {
  expect(closedBorder(actual)).toEqual(closedBorder(expected));
}

async function isTopmost(page, locator) {
  const box = await locator.boundingBox();
  return page.evaluate(({ x, y, id }) => {
    const hit = document.elementFromPoint(x, y);
    const target = document.getElementById(id);
    return Boolean(hit && target && (hit === target || target.contains(hit)));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2, id: await locator.getAttribute('id') });
}

async function waitForBootstrap(page, selector, eventName, action) {
  await page.evaluate(({ selector, eventName }) => {
    window.__bsEvent = false;
    document.querySelector(selector).addEventListener(eventName, () => {
      window.__bsEvent = true;
    }, { once: true });
  }, { selector, eventName });
  await action();
  await page.waitForFunction(() => window.__bsEvent === true);
}

async function openBootstrapPage(page) {
  await page.goto('/tests/fixtures/bootstrap.html');
  await page.waitForFunction(() => window.fixtureReady === true && window.bootstrap && document.querySelectorAll('.fs').length === 4);
}

test.describe('Bootstrap 5', () => {
  test('modal: list opens above the modal and is not clipped by the scrolling body', async ({ page }) => {
    await openBootstrapPage(page);
    await waitForBootstrap(page, '#demo-modal', 'shown.bs.modal', () => page.click('#open-modal'));
    await trigger(page, 'modal-select').click();
    await expectOpen(page, 'modal-select');
    await settle(page);

    const geometry = await page.evaluate(() => {
      const pop = document.querySelector('.fs:has(> #modal-select) .fs-popover');
      const body = document.querySelector('#demo-modal .modal-body').getBoundingClientRect();
      const anchor = document.querySelector('.fs:has(> #modal-select) .fs-control').getBoundingClientRect();
      const rect = pop.getBoundingClientRect();
      return { open: pop.matches(':popover-open'), popBottom: rect.bottom, popTop: rect.top, bodyBottom: body.bottom, anchorBottom: anchor.bottom, popLeft: rect.left, anchorLeft: anchor.left };
    });
    expect(geometry.open).toBe(true);
    expect(geometry.popBottom).toBeGreaterThan(geometry.bodyBottom);
    expect(Math.abs(geometry.popTop - geometry.anchorBottom - 6)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.popLeft - geometry.anchorLeft)).toBeLessThanOrEqual(1);

    const last = options(page, 'modal-select').last();
    expect(await isTopmost(page, last)).toBe(true);
    await last.click();
    await expectOpen(page, 'modal-select', false);
    expect(await nativeValue(page, 'modal-select')).toBe('urgent');
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#demo-modal')))).toBe(true);
  });

  test('modal: Escape closes only the list first, then the modal', async ({ page }) => {
    await openBootstrapPage(page);
    await waitForBootstrap(page, '#demo-modal', 'shown.bs.modal', () => page.click('#open-modal'));
    await trigger(page, 'modal-select').click();
    await expectOpen(page, 'modal-select');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'modal-select', false);
    await page.waitForTimeout(400);
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    await expect(trigger(page, 'modal-select')).toBeFocused();
    await waitForBootstrap(page, '#demo-modal', 'hidden.bs.modal', () => page.keyboard.press('Escape'));
    await expect(page.locator('#demo-modal')).toBeHidden();
  });

  test('modal: keyboard selection keeps focus inside the modal', async ({ page }) => {
    await openBootstrapPage(page);
    await waitForBootstrap(page, '#demo-modal', 'shown.bs.modal', () => page.click('#open-modal'));
    await trigger(page, 'modal-select').focus();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'modal-select');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expectOpen(page, 'modal-select', false);
    expect(await nativeValue(page, 'modal-select')).toBe('medium');
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#demo-modal')))).toBe(true);
  });

  test('modal: multiple select below the scroll fold opens next to its control and follows body scroll', async ({ page }) => {
    await openBootstrapPage(page);
    await waitForBootstrap(page, '#demo-modal', 'shown.bs.modal', () => page.click('#open-modal'));
    await trigger(page, 'modal-tags').click();
    await expectOpen(page, 'modal-tags');
    await settle(page);
    const gap = () => page.evaluate(() => {
      const anchor = document.querySelector('.fs:has(> #modal-tags) .fs-control').getBoundingClientRect();
      const pop = document.querySelector('.fs:has(> #modal-tags) .fs-popover').getBoundingClientRect();
      return pop.top >= anchor.bottom ? pop.top - anchor.bottom : anchor.top - pop.bottom;
    });
    expect(Math.abs(await gap() - 6)).toBeLessThanOrEqual(1);
    await options(page, 'modal-tags').filter({ hasText: 'Beta' }).click();
    expect(await nativeValue(page, 'modal-tags')).toEqual(['b']);
    await expectOpen(page, 'modal-tags');
    await page.evaluate(() => {
      document.querySelector('#demo-modal .modal-body').scrollTop -= 20;
    });
    await page.waitForTimeout(100);
    await settle(page);
    expect(Math.abs(await gap() - 6)).toBeLessThanOrEqual(1);
  });

  test('offcanvas: list opens on top, options click, Escape closes the list first', async ({ page }) => {
    await openBootstrapPage(page);
    await waitForBootstrap(page, '#demo-offcanvas', 'shown.bs.offcanvas', () => page.click('#open-offcanvas'));
    await trigger(page, 'offcanvas-select').click();
    await expectOpen(page, 'offcanvas-select');
    await settle(page);
    const geometry = await page.evaluate(() => {
      const pop = document.querySelector('.fs:has(> #offcanvas-select) .fs-popover').getBoundingClientRect();
      return { right: pop.right, viewport: document.documentElement.clientWidth };
    });
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    const last = options(page, 'offcanvas-select').last();
    expect(await isTopmost(page, last)).toBe(true);
    await last.click();
    expect(await nativeValue(page, 'offcanvas-select')).toBe('published');
    await expect(trigger(page, 'offcanvas-select')).toBeFocused();

    await trigger(page, 'offcanvas-select').click();
    await expectOpen(page, 'offcanvas-select');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'offcanvas-select', false);
    await page.waitForTimeout(400);
    await expect(page.locator('#demo-offcanvas')).toHaveClass(/show/);
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#demo-offcanvas')))).toBe(true);
    await waitForBootstrap(page, '#demo-offcanvas', 'hidden.bs.offcanvas', () => page.keyboard.press('Escape'));
    await expect(page.locator('#demo-offcanvas')).toBeHidden();
  });

  test('data-bs-theme="dark" on html switches the control and the list to dark', async ({ page }) => {
    await openBootstrapPage(page);
    const light = await themeColors(page, 'page-select');
    expectScheme(light, LIGHT);
    expect(light.border).toBe(LIGHT.border);
    await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'dark'));
    const dark = await themeColors(page, 'page-select');
    expectScheme(dark, DARK);
    expect(dark.border).toBe(DARK.border);
    expect(dark.text).not.toBe(light.text);
    expect(dark.popBg).not.toBe(light.popBg);
  });

  // BUG: nested data-bs-theme="dark" inside a light page stays light
  test('dark modal: list inside a data-bs-theme="dark" modal is dark', async ({ page }) => {
    await openBootstrapPage(page);
    await page.evaluate(() => document.getElementById('demo-modal').setAttribute('data-bs-theme', 'dark'));
    await waitForBootstrap(page, '#demo-modal', 'shown.bs.modal', () => page.click('#open-modal'));
    expectScheme(await themeColors(page, 'modal-select'), DARK);
  });

  // BUG: nested data-bs-theme="dark" inside a light page stays light
  test('a dark section inside a light Bootstrap page is dark', async ({ page }) => {
    await openBootstrapPage(page);
    await page.evaluate(() => {
      const section = document.createElement('div');
      section.setAttribute('data-bs-theme', 'dark');
      section.className = 'p-3 bg-body';
      section.innerHTML = '<label for="nested-dark">Nested</label><select id="nested-dark" data-flow-select><option>One</option><option>Two</option></select>';
      document.querySelector('.container').append(section);
      window.FlowSelect.init(section);
    });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('nested-dark').parentElement.parentElement).colorScheme)).toBe('dark');
    expectScheme(await themeColors(page, 'nested-dark'), DARK);
  });

  test('a light section inside a dark Bootstrap page is light', async ({ page }) => {
    await openBootstrapPage(page);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      const section = document.createElement('div');
      section.setAttribute('data-bs-theme', 'light');
      section.innerHTML = '<label for="nested-light">Nested</label><select id="nested-light" data-flow-select><option>One</option><option>Two</option></select>';
      document.querySelector('.container').append(section);
      window.FlowSelect.init(section);
    });
    expectScheme(await themeColors(page, 'nested-light'), LIGHT);
  });
});

test.describe('Containers', () => {
  test('inside a modal <dialog>: list is on top, clicks work, Escape closes only the list first', async ({ page }) => {
    await mount(page, `
      <dialog id="dlg" style="width: 320px">
        <label for="dlg-select">Priority</label>
        <select id="dlg-select" name="priority" data-flow-select>${SIMPLE}</select>
      </dialog>`);
    await page.evaluate(() => document.getElementById('dlg').showModal());
    await trigger(page, 'dlg-select').click();
    await expectOpen(page, 'dlg-select');
    await settle(page);
    const last = options(page, 'dlg-select').last();
    expect(await isTopmost(page, last)).toBe(true);
    await last.click();
    expect(await nativeValue(page, 'dlg-select')).toBe('high');
    await expect(trigger(page, 'dlg-select')).toBeFocused();

    await trigger(page, 'dlg-select').click();
    await expectOpen(page, 'dlg-select');
    await page.keyboard.press('Escape');
    await expectOpen(page, 'dlg-select', false);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('dlg').open)).toBe(true);
    await expect(trigger(page, 'dlg-select')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.getElementById('dlg').open)).toBe(false);
  });

  for (const [name, style] of [
    ['overflow:hidden', 'overflow: hidden; height: 64px'],
    ['transform', 'transform: translate(30px, 10px); overflow: hidden; height: 64px'],
    ['contain:paint', 'contain: paint; height: 64px'],
    ['filter + will-change', 'filter: blur(0); will-change: transform; overflow: hidden; height: 64px']
  ]) {
    test(`inside a ${name} container the list escapes and lines up with the control`, async ({ page }) => {
      await mount(page, `
        <div id="box" style="width: 280px; ${style}">
          <select id="boxed" name="boxed" aria-label="Boxed" data-flow-select>${SIMPLE}<option value="extra">Extra</option></select>
        </div>
        <div style="position: relative; z-index: 9999; height: 200px; background: rgb(200 200 200 / .5)" id="cover"></div>`);
      await trigger(page, 'boxed').click();
      await expectOpen(page, 'boxed');
      await settle(page);
      const geometry = await page.evaluate(() => {
        const box = document.getElementById('box').getBoundingClientRect();
        const anchor = document.querySelector('.fs:has(> #boxed) .fs-control').getBoundingClientRect();
        const pop = document.querySelector('.fs:has(> #boxed) .fs-popover').getBoundingClientRect();
        return { boxBottom: box.bottom, popTop: pop.top, popBottom: pop.bottom, popLeft: pop.left, popWidth: pop.width, anchorBottom: anchor.bottom, anchorLeft: anchor.left, anchorWidth: anchor.width };
      });
      expect(geometry.popBottom).toBeGreaterThan(geometry.boxBottom);
      expect(Math.abs(geometry.popTop - geometry.anchorBottom - 6)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.popLeft - geometry.anchorLeft)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.popWidth - geometry.anchorWidth)).toBeLessThanOrEqual(1);
      const last = options(page, 'boxed').last();
      expect(await isTopmost(page, last)).toBe(true);
      await last.click();
      expect(await nativeValue(page, 'boxed')).toBe('extra');
    });
  }
});

test.describe('Theming', () => {
  const html = `<label for="themed">Themed</label><select id="themed" name="themed" data-flow-select>${SIMPLE}</select>`;

  test('a page that sets nothing is light', async ({ page }) => {
    await mount(page, html);
    const colors = await themeColors(page, 'themed');
    expectScheme(colors, LIGHT);
    expect(colors.border).toBe(LIGHT.border);
  });

  test('a page that sets nothing stays light when the OS is dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mount(page, html);
    expectScheme(await themeColors(page, 'themed'), LIGHT);
  });

  for (const [name, apply] of [
    ['data-bs-theme="dark" on html', () => document.documentElement.setAttribute('data-bs-theme', 'dark')],
    ['data-theme="dark" on html', () => document.documentElement.setAttribute('data-theme', 'dark')],
    ['data-fs-theme="dark" on html', () => document.documentElement.setAttribute('data-fs-theme', 'dark')],
    [':root.dark', () => document.documentElement.classList.add('dark')],
    ['color-scheme: dark on body', () => { document.body.style.colorScheme = 'dark'; }],
    ['data-fs-theme="dark" on a wrapper', () => document.getElementById('app').setAttribute('data-fs-theme', 'dark')]
  ]) {
    test(`dark via ${name}`, async ({ page }) => {
      await mount(page, html);
      await page.evaluate(apply);
      const colors = await themeColors(page, 'themed');
      expectScheme(colors, DARK);
      expect(colors.border).toBe(DARK.border);
    });
  }

  for (const [name, apply] of [
    ['data-bs-theme="light" on a wrapper inside a dark html', () => { document.documentElement.setAttribute('data-bs-theme', 'dark'); document.getElementById('app').setAttribute('data-bs-theme', 'light'); }],
    ['data-fs-theme="light" on a wrapper inside a dark html', () => { document.documentElement.setAttribute('data-fs-theme', 'dark'); document.getElementById('app').setAttribute('data-fs-theme', 'light'); }]
  ]) {
    test(`light via ${name}`, async ({ page }) => {
      await mount(page, html);
      await page.evaluate(apply);
      expectScheme(await themeColors(page, 'themed'), LIGHT);
    });
  }

  // BUG: nested dark theme attribute inside a light ancestor is ignored
  test('dark via data-fs-theme="dark" on a wrapper inside a light html', async ({ page }) => {
    await mount(page, html);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-fs-theme', 'light');
      document.getElementById('app').setAttribute('data-fs-theme', 'dark');
    });
    expectScheme(await themeColors(page, 'themed'), DARK);
  });

  // BUG: data-fs-theme on the select itself is lost after enhancement
  test('dark via data-fs-theme="dark" on the select itself', async ({ page }) => {
    await mount(page, `<label for="self-dark">Self</label><select id="self-dark" name="selfDark" data-flow-select data-fs-theme="dark">${SIMPLE}</select>`);
    expectScheme(await themeColors(page, 'self-dark'), DARK);
  });

  test('data-fs-theme="auto" follows the OS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mount(page, html);
    await page.evaluate(() => document.documentElement.setAttribute('data-fs-theme', 'auto'));
    expectScheme(await themeColors(page, 'themed'), DARK);
    await page.emulateMedia({ colorScheme: 'light' });
    expectScheme(await themeColors(page, 'themed'), LIGHT);
  });

  test('--fs-accent set on .fs changes the open and focus border', async ({ page }) => {
    await mount(page, `<style>.accent .fs { --fs-accent: rgb(13, 110, 253); }</style>
      <div class="accent"><label for="accented">Accent</label><select id="accented" name="accented" data-flow-select>${SIMPLE}</select></div>
      <button type="button" id="before">Before</button>`);
    await page.focus('#before');
    await page.keyboard.press('Shift+Tab');
    await expect(trigger(page, 'accented')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expectOpen(page, 'accented');
    await expect(control(page, 'accented')).toHaveCSS('border-top-color', 'rgb(13, 110, 253)');
    await page.keyboard.press('Escape');
    await expect(control(page, 'accented')).toHaveCSS('border-top-color', 'rgb(13, 110, 253)');
  });

  test('default focus border is neutral grey', async ({ page }) => {
    await mount(page, html);
    await trigger(page, 'themed').click();
    await expect(control(page, 'themed')).toHaveCSS('border-top-color', 'rgb(113, 113, 122)');
  });

  // BUG: --fs-* overrides on an ancestor or :root are ignored
  test('--fs-accent set on an ancestor or :root is used', async ({ page }) => {
    await mount(page, `<div style="--fs-accent: rgb(13, 110, 253)"><label for="anc">Ancestor</label><select id="anc" name="anc" data-flow-select>${SIMPLE}</select></div>`);
    await trigger(page, 'anc').click();
    await expectOpen(page, 'anc');
    await expect(control(page, 'anc')).toHaveCSS('border-top-color', 'rgb(13, 110, 253)');
  });

  // BUG: --fs-* overrides on the select itself are ignored after enhancement
  test('--fs-accent set on a single select is used (README: "or on a single select")', async ({ page }) => {
    await mount(page, `<label for="own">Own</label><select id="own" name="own" style="--fs-accent: rgb(13, 110, 253)" data-flow-select>${SIMPLE}</select>`);
    await trigger(page, 'own').click();
    await expectOpen(page, 'own');
    await expect(control(page, 'own')).toHaveCSS('border-top-color', 'rgb(13, 110, 253)');
  });

  for (const scheme of ['light', 'dark']) {
    test(`no brand or saturated colour anywhere by default (${scheme})`, async ({ page }) => {
      test.slow();
      await mount(page, `
        <label for="neutral-field">Field</label>
        <select id="neutral-field" name="nf" data-flow-select data-fs-search="true" data-fs-clearable="true">
          <option value="">Choose</option><option value="a" selected>Alpha</option><option value="b" data-badge="New" data-meta="meta text">Beta</option>
          <optgroup label="Group"><option value="c" data-avatar="CC">Gamma</option><option value="d" disabled>Delta</option></optgroup>
        </select>
        <label for="neutral-multi">Multiple</label>
        <select id="neutral-multi" name="nm" multiple data-flow-select><option value="a" selected>Alpha</option><option value="b">Beta</option></select>
        <select id="neutral-pill" name="np" aria-label="Pill" data-flow-select data-fs-variant="pill" data-fs-search="dropdown"><option>One</option><option>Two</option></select>
        <select id="neutral-ghost" name="ng" aria-label="Ghost" data-flow-select data-fs-variant="ghost"><option>One</option><option>Two</option></select>`);
      if (scheme === 'dark') {
        await page.evaluate(() => document.documentElement.setAttribute('data-fs-theme', 'dark'));
      }
      const offenders = [];
      for (const id of ['neutral-field', 'neutral-multi', 'neutral-pill', 'neutral-ghost']) {
        await trigger(page, id).focus();
        await page.keyboard.press('ArrowDown');
        await expectOpen(page, id);
        await page.keyboard.press('ArrowDown');
        const found = await page.evaluate((id) => {
          const fs = document.getElementById(id).closest('.fs');
          const props = ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'outline-color', 'box-shadow', 'fill', 'stroke', 'caret-color', 'text-decoration-color'];
          const result = [];
          for (const node of [fs, ...fs.querySelectorAll('*')]) {
            if (node.classList.contains('fs-native') || node.closest('.fs-native')) {
              continue;
            }
            const style = getComputedStyle(node);
            for (const prop of props) {
              const value = style.getPropertyValue(prop);
              for (const match of value.matchAll(/rgba?\(([^)]+)\)/g)) {
                const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
                const [r, g, b] = parts;
                const alpha = parts.length > 3 ? parts[3] : 1;
                if (alpha > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 12) {
                  result.push(`${node.className?.baseVal ?? node.className} ${prop}: ${match[0]}`);
                }
              }
            }
          }
          return result;
        }, id);
        offenders.push(...found);
        await page.keyboard.press('Escape');
      }
      expect(offenders).toEqual([]);
    });
  }
});

async function boxes(page, ids) {
  return page.evaluate((ids) => {
    const result = {};
    for (const id of ids) {
      const select = document.getElementById(id);
      const target = select.closest('.fs') ?? select;
      const rect = target.getBoundingClientRect();
      result[id] = { top: rect.top + scrollY, left: rect.left + scrollX, width: rect.width, height: rect.height };
    }
    for (const id of ['after-form', 'toolbar-end', 'inline-end', 'after-all']) {
      const rect = document.getElementById(id).getBoundingClientRect();
      result[id] = { top: rect.top + scrollY, left: rect.left + scrollX, width: rect.width, height: rect.height };
    }
    return result;
  }, ids);
}

const FIELDS = ['f-empty', 'f-value', 'f-search', 'f-multi', 'f-multi-empty'];
const INLINE = ['p-empty', 'p-value', 'p-clear', 'g-empty', 'g-value', 'i-pill', 'i-ghost'];

function close(a, b) {
  return Math.abs(a - b) < 0.05;
}

test.describe('Layout stability', () => {
  test('enhanced controls keep the pre-styled box (script blocked vs head script)', async ({ page, browserName }, testInfo) => {
    await page.route('**/dist/flow-select.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/fixtures/integration-head.html');
    await page.evaluate(() => document.fonts.ready);
    const before = await boxes(page, [...FIELDS, ...INLINE]);
    expect(await page.locator('.fs').count()).toBe(0);
    await page.unrouteAll();

    await page.goto('/tests/fixtures/integration-head.html');
    await page.waitForFunction(() => document.querySelectorAll('.fs').length === 12);
    await page.evaluate(() => document.fonts.ready);
    const after = await boxes(page, [...FIELDS, ...INLINE]);

    const report = [];
    const problems = [];
    for (const id of [...FIELDS, ...INLINE]) {
      const a = before[id];
      const b = after[id];
      if (!close(a.top, b.top) || !close(a.height, b.height)) {
        problems.push(`${id}: top ${a.top} -> ${b.top}, height ${a.height} -> ${b.height}`);
      }
      if (FIELDS.includes(id) && (!close(a.width, b.width) || !close(a.left, b.left))) {
        problems.push(`${id}: left ${a.left} -> ${b.left}, width ${a.width} -> ${b.width}`);
      }
      if (INLINE.includes(id)) {
        report.push(`${id}: width ${a.width.toFixed(2)} -> ${b.width.toFixed(2)} (${(b.width - a.width).toFixed(2)})`);
      }
    }
    for (const id of ['after-form', 'after-all']) {
      if (!close(before[id].top, after[id].top)) {
        problems.push(`${id}: top ${before[id].top} -> ${after[id].top}`);
      }
    }
    report.push(`toolbar-end left ${before['toolbar-end'].left.toFixed(2)} -> ${after['toolbar-end'].left.toFixed(2)}`);
    report.push(`inline-end left ${before['inline-end'].left.toFixed(2)} -> ${after['inline-end'].left.toFixed(2)}`);
    testInfo.annotations.push({ type: `pill/ghost widths (${browserName})`, description: report.join('; ') });
    console.log(`[${browserName}] pill/ghost widths before -> after:\n  ${report.join('\n  ')}`);
    expect(problems).toEqual([]);
  });

  test('data-flow-select="manual" keeps its box when enhanced later', async ({ page, browserName }, testInfo) => {
    await page.goto('/tests/fixtures/integration-head.html');
    await page.waitForFunction(() => document.querySelectorAll('.fs').length === 12);
    const read = () => page.evaluate(() => Object.fromEntries(['m-field', 'm-pill'].map((id) => {
      const select = document.getElementById(id);
      const rect = (select.closest('.fs') ?? select).getBoundingClientRect();
      return [id, { top: rect.top, left: rect.left, width: rect.width, height: rect.height }];
    })));
    const before = await read();
    await page.evaluate(() => {
      new window.FlowSelect('#m-field');
      new window.FlowSelect('#m-pill');
    });
    const after = await read();
    expect(after['m-field']).toEqual(before['m-field']);
    expect(close(after['m-pill'].top, before['m-pill'].top) && close(after['m-pill'].height, before['m-pill'].height)).toBe(true);
    testInfo.annotations.push({ type: `manual pill width (${browserName})`, description: `${before['m-pill'].width} -> ${after['m-pill'].width}` });
  });

  async function measureShift(page, url) {
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__shifts.push({ value: entry.value, sources: entry.sources.map((source) => source.node?.id || source.node?.className || source.node?.nodeName || '?') });
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    return page.evaluate(() => window.__shifts);
  }

  test('CLS: head script page has no layout shift', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium reports layout-shift entries');
    const shifts = await measureShift(page, '/tests/fixtures/integration-head.html');
    expect(shifts, JSON.stringify(shifts, null, 2)).toEqual([]);
  });

  // BUG: clearable pill or ghost with a value grows by .25em when enhanced
  test('CLS: deferred script page has no layout shift', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'Only Chromium reports layout-shift entries');
    await page.route('**/dist/flow-select.js', async (route) => {
      await new Promise((done) => setTimeout(done, 300));
      await route.continue();
    });
    const shifts = await measureShift(page, '/tests/fixtures/integration-defer.html');
    const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
    testInfo.annotations.push({ type: 'deferred CLS', description: `${total} ${JSON.stringify(shifts)}` });
    expect(await page.locator('.fs').count()).toBe(12);
    expect(shifts, JSON.stringify(shifts, null, 2)).toEqual([]);
  });

  // BUG: clearable pill or ghost with a value grows by .25em when enhanced
  test('a clearable pill with a value keeps its pre-styled width', async ({ page }) => {
    await page.route('**/dist/flow-select.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.goto('/tests/fixtures/integration-head.html');
    const before = await boxes(page, ['p-clear']);
    await page.unrouteAll();
    await page.goto('/tests/fixtures/integration-head.html');
    await page.waitForFunction(() => document.querySelectorAll('.fs').length === 12);
    const after = await boxes(page, ['p-clear']);
    expect(after['p-clear'].width).toBeCloseTo(before['p-clear'].width, 1);
    expect(after['toolbar-end'].left).toBeCloseTo(before['toolbar-end'].left, 1);
  });

  test('Bootstrap .form-select keeps its box when enhanced', async ({ page }) => {
    const url = '/tests/fixtures/integration-bootstrap-layout.html';
    const read = () => page.evaluate(() => {
      const select = document.getElementById('bs-plain');
      const rect = (select.closest('.fs') ?? select).getBoundingClientRect();
      return { top: rect.top, height: rect.height, width: rect.width, below: document.getElementById('after-plain').getBoundingClientRect().top };
    });
    await page.route('**/dist/flow-select.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.goto(url);
    const before = await read();
    await page.unrouteAll();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('.fs').length === 3);
    expect(await read()).toEqual(before);
  });

  // BUG: layout utility classes on the select (mb-3, w-50) are dropped after enhancement
  test('Bootstrap margin and width utilities on the select survive enhancement', async ({ page }) => {
    const url = '/tests/fixtures/integration-bootstrap-layout.html';
    const read = () => page.evaluate(() => {
      const box = (id) => {
        const select = document.getElementById(id);
        return (select.closest('.fs') ?? select).getBoundingClientRect();
      };
      return {
        marginBelow: document.getElementById('after-margin').getBoundingClientRect().top,
        widthUtility: box('bs-width').width,
        widthBelow: document.getElementById('after-width').getBoundingClientRect().top
      };
    });
    await page.route('**/dist/flow-select.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.goto(url);
    const before = await read();
    await page.unrouteAll();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('.fs').length === 3);
    expect(await read()).toEqual(before);
  });
});
