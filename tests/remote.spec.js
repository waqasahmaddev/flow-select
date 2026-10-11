import { test, expect } from '@playwright/test';
import { mount, root, control, popover, options, nativeValue, expectOpen } from './helpers.js';

const PEOPLE = '/api/people';

let pageErrors = [];
let consoleErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    window.__fetches = [];
    window.__events = [];
    window.__rejections = [];
    window.addEventListener('unhandledrejection', (event) => window.__rejections.push(String(event.reason)));
    const original = window.fetch;
    window.fetch = function (input, init) {
      const entry = { url: String(input instanceof Request ? input.url : input), aborted: false, status: 'pending' };
      window.__fetches.push(entry);
      init?.signal?.addEventListener('abort', () => {
        entry.aborted = true;
      });
      return original.call(this, input, init).then((response) => {
        entry.status = response.status;
        return response;
      }, (error) => {
        entry.status = 'failed';
        throw error;
      });
    };
    for (const name of ['search', 'load', 'error', 'change', 'create']) {
      document.addEventListener(`flowselect:${name}`, (event) => {
        const detail = event.detail;
        window.__events.push({
          name,
          id: event.target.id,
          query: detail.query ?? null,
          page: detail.page ?? null,
          count: detail.items ? detail.items.length : null,
          item: detail.item ? detail.item.value : null,
          value: detail.value
        });
      });
    }
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  expect(pageErrors, 'no uncaught page errors').toEqual([]);
  const rejections = await page.evaluate(() => window.__rejections ?? []).catch(() => []);
  expect(rejections, 'no unhandled promise rejections').toEqual([]);
});

// ---------- helpers ----------

async function blank(page, html, factory, arg) {
  await page.goto('/tests/fixtures/blank.html');
  await page.waitForFunction(() => window.fixtureReady === true);
  await page.evaluate((html) => {
    document.getElementById('app').innerHTML = html;
  }, html);
  await page.evaluate(factory, arg);
}

function input(page, id) {
  return root(page, id).locator('.fs-control .fs-input');
}

function list(page, id) {
  return popover(page, id).locator('.fs-list');
}

function status(page, id) {
  return popover(page, id).locator('div.fs-status');
}

function row(page, id, text) {
  return options(page, id).filter({ hasText: text });
}

async function requests(page, path = PEOPLE) {
  return page.evaluate((path) => window.__fetches
    .map((entry) => {
      const url = new URL(entry.url, location.href);
      return {
        path: url.pathname,
        href: `${url.pathname}${url.search}`,
        q: url.searchParams.get('q'),
        page: url.searchParams.get('page'),
        aborted: entry.aborted,
        status: entry.status
      };
    })
    .filter((entry) => entry.path === path), path);
}

async function queries(page, path = PEOPLE) {
  return (await requests(page, path)).map((entry) => entry.q);
}

async function events(page, name) {
  return page.evaluate((name) => window.__events.filter((event) => event.name === name), name);
}

async function waitForLoad(page, query, pageNumber = 1) {
  await expect.poll(async () => (await events(page, 'load')).some((event) => event.query === query && event.page === pageNumber)).toBe(true);
}

async function nativeOptions(page, id) {
  return page.evaluate((id) => Array.from(document.getElementById(id).options, (option) => ({
    value: option.value,
    text: option.text,
    selected: option.selected,
    dynamic: option.hasAttribute('data-fs-dynamic')
  })), id);
}

async function labels(page, id) {
  return options(page, id).locator('.fs-label').allTextContents();
}

async function scrollToEnd(page, id) {
  await list(page, id).evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
}

async function openAndWait(page, id, count = 20) {
  await control(page, id).click();
  await expectOpen(page, id);
  await waitForLoad(page, '');
  await expect(options(page, id)).toHaveCount(count);
}

function person(id, attributes = '', url = PEOPLE) {
  return `<label for="${id}">Person</label><select id="${id}" name="${id}" data-flow-select data-fs-url="${url}" ${attributes}></select>`;
}

// ---------- loading ----------

test.describe('loading', () => {
  test('opening requests the first page at once, shows a loading status, then rich rows', async ({ page }) => {
    await mount(page, person('person', 'data-fs-debounce="3000"', `${PEOPLE}?delay=700`));
    await control(page, 'person').click();
    await expectOpen(page, 'person');
    await expect(status(page, 'person')).toHaveText('Loading...');
    await expect(status(page, 'person').locator('.fs-spinner')).toBeVisible();
    await expect.poll(() => queries(page)).toEqual(['']);

    await expect(options(page, 'person')).toHaveCount(20);
    await expect(status(page, 'person')).toBeHidden();
    const first = options(page, 'person').first();
    await expect(first.locator('.fs-label')).toHaveText('Maya Patel');
    await expect(first.locator('.fs-meta-text')).toHaveText('maya.patel@example.com');
    await expect(first.locator('.fs-badge')).toHaveText('Admin');
    await expect(first.locator('.fs-avatar')).toHaveText('MP');
    await expect(first).toHaveAttribute('role', 'option');
    const loads = await events(page, 'load');
    expect(loads).toEqual([expect.objectContaining({ query: '', page: 1, count: 20 })]);
  });

  test('typing 5 characters fast sends exactly one request for the final query', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await input(page, 'person').pressSequentially('patel');
    await waitForLoad(page, 'patel');
    await page.waitForTimeout(500);
    expect(await queries(page)).toEqual(['', 'patel']);
    await expect(options(page, 'person')).toHaveCount(20);
    const searches = await events(page, 'search');
    expect(searches.at(-1).query).toBe('patel');
  });

  test('typing into the closed field opens it and sends one debounced request', async ({ page }) => {
    await mount(page, person('person'));
    await input(page, 'person').focus();
    await input(page, 'person').pressSequentially('maya');
    await expectOpen(page, 'person');
    await waitForLoad(page, 'maya');
    await page.waitForTimeout(400);
    expect(await queries(page)).toEqual(['maya']);
    await expect(options(page, 'person')).toHaveCount(13);
  });

  test('a custom debounce delays the request', async ({ page }) => {
    await mount(page, person('person', 'data-fs-debounce="900"'));
    await openAndWait(page, 'person');
    await input(page, 'person').pressSequentially('maya');
    await page.waitForTimeout(450);
    expect(await queries(page)).toEqual(['']);
    await waitForLoad(page, 'maya');
    expect(await queries(page)).toEqual(['', 'maya']);
  });

  test('empty results show the query in the message', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await input(page, 'person').pressSequentially('zzqx');
    await waitForLoad(page, 'zzqx');
    await expect(options(page, 'person')).toHaveCount(0);
    await expect(status(page, 'person')).toHaveText('No results for “zzqx”');
  });

  test('minQueryLength shows a hint and sends nothing until reached', async ({ page }) => {
    await mount(page, person('person', 'data-fs-min-query-length="3"'));
    await control(page, 'person').click();
    await expectOpen(page, 'person');
    await expect(status(page, 'person')).toHaveText('Type at least 3 characters');
    await input(page, 'person').pressSequentially('ma');
    await page.waitForTimeout(400);
    expect(await queries(page)).toEqual([]);
    await expect(status(page, 'person')).toHaveText('Type at least 3 characters');

    await input(page, 'person').press('y');
    await waitForLoad(page, 'may');
    await expect(options(page, 'person')).toHaveCount(13);
    expect(await queries(page)).toEqual(['may']);

    await input(page, 'person').press('Backspace');
    await expect(options(page, 'person')).toHaveCount(0);
    await expect(status(page, 'person')).toHaveText('Type at least 3 characters');
    await page.waitForTimeout(400);
    expect(await queries(page)).toEqual(['may']);
  });
});

// ---------- races and cancellation ----------

test.describe('races', () => {
  test('a superseded in-flight request is aborted and never replaces newer results', async ({ page }) => {
    await page.route('**/api/people?*', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q');
      await new Promise((done) => setTimeout(done, query === 'ma' ? 1500 : 50));
      try {
        await route.continue();
      } catch {
        // request was aborted by the page
      }
    });
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await input(page, 'person').pressSequentially('ma');
    await expect.poll(() => queries(page)).toEqual(['', 'ma']);
    await input(page, 'person').pressSequentially('ya');
    await waitForLoad(page, 'maya');
    await expect(options(page, 'person')).toHaveCount(13);
    const sent = await requests(page);
    expect(sent.find((entry) => entry.q === 'ma').aborted).toBe(true);
    await page.waitForTimeout(1600);
    await expect(options(page, 'person')).toHaveCount(13);
    expect((await events(page, 'load')).map((event) => event.query)).toEqual(['', 'maya']);
  });

  test('an older load() that ignores the abort signal and resolves last is ignored', async ({ page }) => {
    await blank(page, '<label for="person">Person</label><select id="person"></select>', () => {
      window.__calls = [];
      new window.FlowSelect('#person', {
        debounce: 0,
        load: (query, { signal }) => new Promise((resolve) => {
          window.__calls.push({ query, signal, resolve: () => resolve([{ value: `${query}-1`, label: `Result for ${query || 'all'}` }]) });
        })
      });
    });
    await control(page, 'person').click();
    await expect.poll(() => page.evaluate(() => window.__calls.length)).toBe(1);
    await page.evaluate(() => window.__calls[0].resolve());
    await expect(row(page, 'person', 'Result for all')).toHaveCount(1);

    await input(page, 'person').press('a');
    await input(page, 'person').press('b');
    await expect.poll(() => page.evaluate(() => window.__calls.map((call) => call.query))).toEqual(['', 'a', 'ab']);
    expect(await page.evaluate(() => window.__calls[1].signal.aborted)).toBe(true);

    await page.evaluate(() => window.__calls[2].resolve());
    await expect(row(page, 'person', 'Result for ab')).toHaveCount(1);
    await page.evaluate(() => window.__calls[1].resolve());
    await page.waitForTimeout(100);
    await expect(options(page, 'person')).toHaveCount(1);
    await expect(row(page, 'person', 'Result for ab')).toHaveCount(1);
  });

  test('closing while a request is in flight aborts it and a late response does not reopen', async ({ page }) => {
    await mount(page, person('person', '', '/api/slow?delay=900'));
    await control(page, 'person').click();
    await expectOpen(page, 'person');
    await expect.poll(async () => (await requests(page, '/api/slow')).length).toBe(1);
    await page.keyboard.press('Escape');
    await expectOpen(page, 'person', false);
    await expect.poll(async () => (await requests(page, '/api/slow'))[0].aborted).toBe(true);
    await page.waitForTimeout(1200);
    await expectOpen(page, 'person', false);
    expect(await page.evaluate(() => window.FlowSelect.get('#person').isOpen)).toBe(false);
    expect(await events(page, 'load')).toEqual([]);
    await expect(options(page, 'person')).toHaveCount(0);
  });

  test('a late load() result after close changes nothing', async ({ page }) => {
    await blank(page, '<label for="person">Person</label><select id="person" name="person"></select>', () => {
      window.__calls = [];
      new window.FlowSelect('#person', {
        load: (query, { signal }) => new Promise((resolve) => {
          window.__calls.push({ query, signal, resolve: () => resolve([{ value: 'late', label: 'Late result' }]) });
        })
      });
    });
    await control(page, 'person').click();
    await expect.poll(() => page.evaluate(() => window.__calls.length)).toBe(1);
    await page.keyboard.press('Escape');
    await expectOpen(page, 'person', false);
    expect(await page.evaluate(() => window.__calls[0].signal.aborted)).toBe(true);
    await page.evaluate(() => window.__calls[0].resolve());
    await page.waitForTimeout(150);
    await expectOpen(page, 'person', false);
    await expect(options(page, 'person')).toHaveCount(0);
    expect(await events(page, 'load')).toEqual([]);
    expect(await nativeValue(page, 'person')).toBe('');
  });

  test('typing a new query while page 2 loads aborts page 2 and shows only the new results', async ({ page }) => {
    await mount(page, person('person', '', `${PEOPLE}?delay=900`));
    await openAndWait(page, 'person');
    await scrollToEnd(page, 'person');
    await expect.poll(async () => (await requests(page)).some((entry) => entry.page === '2')).toBe(true);
    await input(page, 'person').pressSequentially('maya');
    await waitForLoad(page, 'maya');
    const pageTwo = (await requests(page)).find((entry) => entry.page === '2');
    expect(pageTwo.aborted).toBe(true);
    await expect(options(page, 'person')).toHaveCount(13);
    await expect(list(page, 'person').locator('.fs-status--tail')).toHaveCount(0);
    expect((await events(page, 'load')).some((event) => event.page === 2)).toBe(false);
  });
});

// ---------- cache ----------

test.describe('cache', () => {
  test('reopening and retyping a previous query use the cache', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await page.keyboard.press('Escape');
    await control(page, 'person').click();
    await expect(options(page, 'person')).toHaveCount(20);
    await input(page, 'person').pressSequentially('maya');
    await waitForLoad(page, 'maya');
    await input(page, 'person').fill('');
    await expect(options(page, 'person')).toHaveCount(20);
    await input(page, 'person').pressSequentially('maya');
    await expect(options(page, 'person')).toHaveCount(13);
    await page.waitForTimeout(400);
    expect(await queries(page)).toEqual(['', 'maya']);
  });

  test('data-fs-cache="false" fetches again on every open', async ({ page }) => {
    await mount(page, person('person', 'data-fs-cache="false"'));
    await openAndWait(page, 'person');
    await page.keyboard.press('Escape');
    await control(page, 'person').click();
    await expect.poll(() => queries(page)).toEqual(['', '']);
  });

  test('reload() clears the cache and refetches when open', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await page.evaluate(() => window.FlowSelect.get('#person').reload());
    await expect.poll(() => queries(page)).toEqual(['', '']);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.FlowSelect.get('#person').reload());
    await control(page, 'person').click();
    await expect.poll(() => queries(page)).toEqual(['', '', '']);
    await expect(options(page, 'person')).toHaveCount(20);
  });

  test('data-fs-refresh-on clears the cache when the event fires', async ({ page }) => {
    await mount(page, person('person', 'data-fs-refresh-on="people-changed teams-changed"'));
    await openAndWait(page, 'person');
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.dispatchEvent(new Event('teams-changed')));
    await control(page, 'person').click();
    await expect.poll(() => queries(page)).toEqual(['', '']);
    await page.evaluate(() => document.dispatchEvent(new Event('people-changed')));
    await expect.poll(() => queries(page)).toEqual(['', '', '']);
  });

  // BUG: cache is first-in-first-out, a cache hit does not refresh the entry
  test('the cache keeps recently used queries (LRU)', async ({ page }) => {
    await blank(page, '<label for="tag">Tag</label><select id="tag"></select>', () => {
      window.__counts = {};
      new window.FlowSelect('#tag', {
        debounce: 0,
        minQueryLength: 1,
        load: (query) => {
          window.__counts[query] = (window.__counts[query] ?? 0) + 1;
          return [{ value: query, label: query }];
        }
      });
    });
    await control(page, 'tag').click();
    const count = await page.evaluate(async () => {
      const field = document.querySelector('.fs-control .fs-input');
      const search = async (query) => {
        field.value = query;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((done) => setTimeout(done, 0));
      };
      await search('alpha');
      for (let index = 1; index <= 49; index += 1) {
        await search(`q${index}`);
      }
      await search('alpha');
      await search('q50');
      await search('alpha');
      return window.__counts.alpha;
    });
    expect(count).toBe(1);
  });
});

// ---------- errors ----------

test.describe('errors', () => {
  test('a failed request shows the error and Try again retries by click and by Enter', async ({ page }) => {
    await mount(page, person('person', '', '/api/fail'));
    await control(page, 'person').click();
    await expect(status(page, 'person')).toContainText('Could not load results.');
    const retry = status(page, 'person').getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    expect((await events(page, 'error')).length).toBe(1);

    await retry.click();
    await expect.poll(async () => (await requests(page, '/api/fail')).length).toBe(2);
    await expect(retry).toBeVisible();
    await expectOpen(page, 'person');

    await input(page, 'person').press('Enter');
    await expect.poll(async () => (await requests(page, '/api/fail')).length).toBe(3);
    await expect(status(page, 'person')).toContainText('Could not load results.');
    await expect.poll(async () => (await events(page, 'error')).length).toBe(3);
  });

  test('the flaky endpoint recovers on retry', async ({ page }) => {
    const query = `zz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    await mount(page, person('person', 'data-fs-min-query-length="1"', '/api/flaky'));
    await control(page, 'person').click();
    await input(page, 'person').pressSequentially(query);
    await expect(status(page, 'person')).toContainText('Could not load results.');
    await status(page, 'person').getByRole('button', { name: 'Try again' }).click();
    await expect(status(page, 'person')).toHaveText(`No results for “${query}”`);
    const sent = await requests(page, '/api/flaky');
    expect(sent.map((entry) => entry.status)).toEqual([503, 200]);
  });

  test('a mocked flaky search recovers and shows rows', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/people?*', async (route) => {
      calls += 1;
      if (calls === 1) {
        await route.fulfill({ status: 503, json: { error: 'busy' } });
      } else {
        await route.continue();
      }
    });
    await mount(page, person('person'));
    await control(page, 'person').click();
    await expect(status(page, 'person')).toContainText('Could not load results.');
    await input(page, 'person').press('Enter');
    await expect(options(page, 'person')).toHaveCount(20);
    await expect(status(page, 'person')).toBeHidden();
  });

  test('load() rejecting shows the error and retry calls load() again', async ({ page }) => {
    await blank(page, '<label for="person">Person</label><select id="person"></select>', () => {
      window.__loadCalls = 0;
      new window.FlowSelect('#person', {
        load: async () => {
          window.__loadCalls += 1;
          if (window.__loadCalls === 1) {
            throw new Error('Service unavailable');
          }
          return [{ value: 'a', label: 'Alpha' }];
        }
      });
    });
    await control(page, 'person').click();
    await expect(status(page, 'person')).toContainText('Could not load results.');
    await status(page, 'person').getByRole('button', { name: 'Try again' }).click();
    await expect(row(page, 'person', 'Alpha')).toHaveCount(1);
    expect(await page.evaluate(() => window.__loadCalls)).toBe(2);
  });
});

// ---------- paging ----------

test.describe('paging', () => {
  test('scrolling to the end loads page 2 with a tail spinner and appends it', async ({ page }) => {
    await mount(page, person('person', '', `${PEOPLE}?delay=700`));
    await openAndWait(page, 'person');
    await scrollToEnd(page, 'person');
    await expect(list(page, 'person').locator('.fs-status--tail .fs-spinner')).toBeVisible();
    await expect(options(page, 'person')).toHaveCount(40);
    await expect(list(page, 'person').locator('.fs-status--tail')).toHaveCount(0);
    const names = await labels(page, 'person');
    expect(new Set(names).size).toBe(40);
    expect(names[0]).toBe('Maya Patel');
    expect(names[20]).toBe('Maya Martin');
    expect((await requests(page)).map((entry) => entry.page)).toEqual([null, '2']);
    await expect(list(page, 'person')).toHaveAttribute('aria-busy', 'false');
  });

  test('ArrowDown to the last row loads the next page and keeps moving into it', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    for (let index = 0; index < 19; index += 1) {
      await input(page, 'person').press('ArrowDown');
    }
    await expect.poll(async () => (await requests(page)).map((entry) => entry.page)).toEqual([null, '2']);
    await expect(options(page, 'person')).toHaveCount(40);
    await input(page, 'person').press('ArrowDown');
    const active = await input(page, 'person').getAttribute('aria-activedescendant');
    expect(active).toMatch(/-option-20$/);
    await expect(options(page, 'person').nth(20)).toHaveClass(/is-active/);
  });

  test('End loads the next page', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await input(page, 'person').press('End');
    await expect(options(page, 'person')).toHaveCount(40);
    expect((await requests(page)).map((entry) => entry.page)).toEqual([null, '2']);
  });

  test('paging stops when hasMore is false', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await input(page, 'person').pressSequentially('ia');
    await waitForLoad(page, 'ia');
    await expect(options(page, 'person')).toHaveCount(20);
    await scrollToEnd(page, 'person');
    await expect(options(page, 'person')).toHaveCount(26);
    await scrollToEnd(page, 'person');
    await list(page, 'person').evaluate((node) => {
      node.scrollTop = 0;
    });
    await scrollToEnd(page, 'person');
    for (let index = 0; index < 8; index += 1) {
      await input(page, 'person').press('ArrowDown');
    }
    await input(page, 'person').press('End');
    await page.waitForTimeout(500);
    const sent = (await requests(page)).filter((entry) => entry.q === 'ia');
    expect(sent.map((entry) => entry.page)).toEqual([null, '2']);
    await expect(options(page, 'person')).toHaveCount(26);
  });

  test('refreshing results with rows on screen marks the list busy', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await page.route('**/api/people?*', async (route) => {
      await new Promise((done) => setTimeout(done, 800));
      try {
        await route.continue();
      } catch {
        // aborted
      }
    });
    await input(page, 'person').pressSequentially('maya');
    await expect(list(page, 'person')).toHaveAttribute('aria-busy', 'true');
    await expect(popover(page, 'person')).toHaveClass(/is-loading/);
    await expect(options(page, 'person')).toHaveCount(13);
    await expect(list(page, 'person')).toHaveAttribute('aria-busy', 'false');
    await expect(popover(page, 'person')).not.toHaveClass(/is-loading/);
  });

  // BUG: aria-busy is not set during the first load or while the next page loads
  test('the listbox is aria-busy during the first load and while the next page loads', async ({ page }) => {
    await mount(page, person('person', '', `${PEOPLE}?delay=800`));
    await control(page, 'person').click();
    await expect(status(page, 'person')).toHaveText('Loading...');
    await expect.soft(list(page, 'person')).toHaveAttribute('aria-busy', 'true', { timeout: 300 });
    await expect(options(page, 'person')).toHaveCount(20);
    await scrollToEnd(page, 'person');
    await expect(list(page, 'person').locator('.fs-status--tail')).toBeVisible();
    await expect.soft(list(page, 'person')).toHaveAttribute('aria-busy', 'true', { timeout: 300 });
    await expect(options(page, 'person')).toHaveCount(40);
  });

  // BUG: a failed next-page request advances the page counter, so the next attempt skips that page
  test('after a failed page 2, the next attempt asks for page 2 again', async ({ page }) => {
    let failedOnce = false;
    await page.route('**/api/people?*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('page') === '2' && !failedOnce) {
        failedOnce = true;
        await route.fulfill({ status: 500, json: { error: 'boom' } });
        return;
      }
      await route.continue();
    });
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await scrollToEnd(page, 'person');
    await expect.poll(async () => (await events(page, 'error')).length).toBe(1);
    await expect(list(page, 'person').locator('.fs-status--tail')).toHaveCount(0);
    await expect(options(page, 'person')).toHaveCount(20);

    await list(page, 'person').evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.waitForTimeout(100);
    await scrollToEnd(page, 'person');
    await expect.poll(async () => (await requests(page)).length).toBe(3);
    expect((await requests(page)).map((entry) => entry.page)).toEqual([null, '2', '2']);
    await expect(options(page, 'person')).toHaveCount(40);
    expect((await labels(page, 'person'))[20]).toBe('Maya Martin');
  });

  // BUG: hasMore from the previous query leaks into a new query whose first page failed
  test('a failed first page of a new query never requests its page 2', async ({ page }) => {
    await page.route('**/api/people?*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('q') === 'zz') {
        await route.fulfill({ status: 500, json: { error: 'boom' } });
        return;
      }
      await route.continue();
    });
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await list(page, 'person').evaluate((node) => {
      node.scrollTop = 250;
    });
    await page.waitForTimeout(100);
    await input(page, 'person').pressSequentially('zz');
    await expect(status(page, 'person')).toContainText('Could not load results.');
    await page.waitForTimeout(600);
    const sent = (await requests(page)).filter((entry) => entry.q === 'zz');
    expect(sent.map((entry) => entry.page)).toEqual([null]);
  });
});

// ---------- selection ----------

test.describe('selection', () => {
  test('single pick updates the value, adds a dynamic option and survives new searches', async ({ page }) => {
    await mount(page, person('person'));
    await openAndWait(page, 'person');
    await row(page, 'person', 'Maya Patel').click();
    await expectOpen(page, 'person', false);
    await expect(root(page, 'person').locator('.fs-value .fs-value-text')).toHaveText('Maya Patel');
    await expect(root(page, 'person').locator('.fs-value .fs-avatar')).toHaveText('MP');
    expect(await nativeValue(page, 'person')).toBe('p1');
    expect(await nativeOptions(page, 'person')).toEqual([{ value: 'p1', text: 'Maya Patel', selected: true, dynamic: true }]);
    const changes = await events(page, 'change');
    expect(changes.at(-1).value).toBe('p1');
    const item = await page.evaluate(() => window.FlowSelect.get('#person').selectedItems[0]);
    expect(item).toMatchObject({ value: 'p1', label: 'Maya Patel', meta: 'maya.patel@example.com', badge: 'Admin' });

    await control(page, 'person').click();
    await expect(row(page, 'person', 'Maya Patel')).toHaveAttribute('aria-selected', 'true');
    await input(page, 'person').pressSequentially('zzqx');
    await waitForLoad(page, 'zzqx');
    await page.keyboard.press('Escape');
    expect(await nativeValue(page, 'person')).toBe('p1');
    await expect(root(page, 'person').locator('.fs-value-text')).toHaveText('Maya Patel');

    await control(page, 'person').click();
    await input(page, 'person').pressSequentially('leo pat');
    await waitForLoad(page, 'leo pat');
    await input(page, 'person').press('Enter');
    expect(await nativeValue(page, 'person')).toBe('p2');
    expect(await nativeOptions(page, 'person')).toEqual([{ value: 'p2', text: 'Leo Patel', selected: true, dynamic: true }]);
    await expect(root(page, 'person').locator('.fs-value-text')).toHaveText('Leo Patel');
  });

  test('multiple picks add chips and dynamic options that survive new searches', async ({ page }) => {
    await mount(page, `<label for="team">Team</label><select id="team" name="team[]" multiple data-flow-select data-fs-url="${PEOPLE}"></select>`);
    await openAndWait(page, 'team');
    await row(page, 'team', 'Maya Patel').click();
    await expectOpen(page, 'team');
    await input(page, 'team').pressSequentially('leo pat');
    await waitForLoad(page, 'leo pat');
    await expect(options(page, 'team')).toHaveCount(1);
    await row(page, 'team', 'Leo Patel').click();
    await expect(input(page, 'team')).toHaveValue('');
    await expect(options(page, 'team')).toHaveCount(20);
    await expect(root(page, 'team').locator('.fs-chip-label')).toHaveText(['Maya Patel', 'Leo Patel']);
    expect(await nativeValue(page, 'team')).toEqual(['p1', 'p2']);
    expect((await nativeOptions(page, 'team')).every((option) => option.dynamic && option.selected)).toBe(true);

    await input(page, 'team').pressSequentially('zzqx');
    await waitForLoad(page, 'zzqx');
    expect(await nativeValue(page, 'team')).toEqual(['p1', 'p2']);
    await page.keyboard.press('Escape');

    await root(page, 'team').locator('.fs-chip[data-value="p1"] .fs-chip-remove').click();
    await expect(root(page, 'team').locator('.fs-chip-label')).toHaveText(['Leo Patel']);
    expect(await nativeOptions(page, 'team')).toEqual([{ value: 'p2', text: 'Leo Patel', selected: true, dynamic: true }]);
  });

  test('a preselected server-rendered option shows and is kept', async ({ page }) => {
    await mount(page, `
      <label for="team">Team</label>
      <select id="team" name="team[]" multiple data-flow-select data-fs-url="${PEOPLE}">
        <option value="p5" selected>Noah Patel</option>
      </select>
      <label for="owner">Owner</label>
      <select id="owner" name="owner" data-flow-select data-fs-url="${PEOPLE}">
        <option value="p3" selected data-avatar="JP">Jonas Patel</option>
      </select>`);
    await expect(root(page, 'team').locator('.fs-chip-label')).toHaveText(['Noah Patel']);
    await expect(root(page, 'owner').locator('.fs-value-text')).toHaveText('Jonas Patel');

    await openAndWait(page, 'team');
    await expect(row(page, 'team', 'Noah Patel')).toHaveAttribute('aria-selected', 'true');
    await row(page, 'team', 'Maya Patel').click();
    expect(await nativeValue(page, 'team')).toEqual(['p5', 'p1']);
    const teamOptions = await nativeOptions(page, 'team');
    expect(teamOptions.find((option) => option.value === 'p5')).toEqual({ value: 'p5', text: 'Noah Patel', selected: true, dynamic: false });
    await page.keyboard.press('Escape');

    await openAndWait(page, 'owner');
    await expect(row(page, 'owner', 'Jonas Patel')).toHaveAttribute('aria-selected', 'true');
    await expect(row(page, 'owner', 'Jonas Patel')).toHaveClass(/is-active/);
    await row(page, 'owner', 'Leo Patel').click();
    expect(await nativeValue(page, 'owner')).toBe('p2');
    const ownerOptions = await nativeOptions(page, 'owner');
    expect(ownerOptions).toEqual([
      { value: 'p3', text: 'Jonas Patel', selected: false, dynamic: false },
      { value: 'p2', text: 'Leo Patel', selected: true, dynamic: true }
    ]);
  });

  test('hideSelected hides picked rows and shows them again when removed', async ({ page }) => {
    await mount(page, `<label for="team">Team</label><select id="team" name="team[]" multiple data-flow-select data-fs-url="${PEOPLE}" data-fs-hide-selected></select>`);
    await openAndWait(page, 'team');
    await row(page, 'team', 'Maya Patel').click();
    await expect(row(page, 'team', 'Maya Patel')).toHaveCount(0);
    await expect(options(page, 'team')).toHaveCount(19);
    await row(page, 'team', 'Leo Patel').click();
    await expect(options(page, 'team')).toHaveCount(18);
    await scrollToEnd(page, 'team');
    await expect(options(page, 'team')).toHaveCount(38);
    await root(page, 'team').locator('.fs-chip[data-value="p1"] .fs-chip-remove').click();
    await expect(row(page, 'team', 'Maya Patel')).toHaveCount(1);
    expect(await nativeValue(page, 'team')).toEqual(['p2']);
  });

  test('a real form POST and FormData carry the remote picks', async ({ page }) => {
    await page.goto('/tests/fixtures/remote-form.html');
    await page.waitForFunction(() => window.fixtureReady === true && document.querySelectorAll('.fs').length === 3);

    const before = await page.evaluate(() => {
      const data = new FormData(document.getElementById('remote-form'));
      return { person: data.getAll('person'), team: data.getAll('team[]'), owner: data.getAll('owner') };
    });
    expect(before).toEqual({ person: [], team: ['p5'], owner: ['p3'] });

    await control(page, 'person').click();
    await row(page, 'person', 'Leo Patel').click();
    await control(page, 'team').click();
    await expect(options(page, 'team')).toHaveCount(20);
    await row(page, 'team', 'Maya Patel').click();
    await input(page, 'team').pressSequentially('ava');
    await waitForLoad(page, 'ava');
    await row(page, 'team', 'Ava Patel').click();
    await page.keyboard.press('Escape');

    const data = await page.evaluate(() => {
      const form = new FormData(document.getElementById('remote-form'));
      return { person: form.getAll('person'), team: form.getAll('team[]'), owner: form.getAll('owner') };
    });
    expect(data).toEqual({ person: ['p2'], team: ['p5', 'p1', 'p4'], owner: ['p3'] });

    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/echo') && request.method() === 'POST');
    await page.click('#submit');
    const body = new URLSearchParams((await requestPromise).postData() ?? '');
    expect(body.get('person')).toBe('p2');
    expect(body.getAll('team[]')).toEqual(['p5', 'p1', 'p4']);
    expect(body.get('owner')).toBe('p3');
  });
});

// ---------- load() and options ----------

test.describe('load() and request options', () => {
  test('load() returning an array accepts every item field alias and does not page', async ({ page }) => {
    await blank(page, '<label for="thing">Thing</label><select id="thing" name="thing"></select>', () => {
      window.__calls = [];
      new window.FlowSelect('#thing', {
        load: (query, { page, signal }) => {
          window.__calls.push({ query, page, hasSignal: signal instanceof AbortSignal });
          return [
            { value: 'v1', label: 'Value label', description: 'A description', meta: 'Meta text', badge: 'New', avatar: 'VL' },
            { id: 7, text: 'Id and text' },
            { key: 'k1', name: 'Key and name', subtitle: 'Subtitle text', image: '/img/sample.png' },
            { value: 't1', title: 'Title only' },
            { value: 'off', label: 'Disabled item', disabled: true },
            { value: 'g1', label: 'Grouped item', group: 'Group A' },
            { label: 'No value is skipped' },
            null
          ];
        }
      });
    });
    await control(page, 'thing').click();
    await expect(options(page, 'thing')).toHaveCount(6);
    expect(await labels(page, 'thing')).toEqual(['Value label', 'Id and text', 'Key and name', 'Title only', 'Disabled item', 'Grouped item']);
    await expect(options(page, 'thing').nth(0).locator('.fs-description')).toHaveText('A description');
    await expect(options(page, 'thing').nth(0).locator('.fs-badge')).toHaveText('New');
    await expect(options(page, 'thing').nth(2).locator('.fs-meta-text')).toHaveText('Subtitle text');
    await expect(options(page, 'thing').nth(2).locator('.fs-avatar img')).toHaveAttribute('src', '/img/sample.png');
    await expect(options(page, 'thing').nth(4)).toHaveAttribute('aria-disabled', 'true');
    await expect(list(page, 'thing').locator('.fs-group')).toHaveText(['Group A']);
    await row(page, 'thing', 'Id and text').click();
    expect(await nativeValue(page, 'thing')).toBe('7');

    await control(page, 'thing').click();
    await scrollToEnd(page, 'thing');
    await input(page, 'thing').press('End');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__calls)).toEqual([{ query: '', page: 1, hasSignal: true }]);
  });

  test('load() returning { items, hasMore } pages with { page }', async ({ page }) => {
    await blank(page, '<label for="thing">Thing</label><select id="thing"></select>', () => {
      window.__calls = [];
      new window.FlowSelect('#thing', {
        load: async (query, { page }) => {
          window.__calls.push(page);
          const items = Array.from({ length: 20 }, (unused, index) => ({ value: `${page}-${index}`, label: `Item ${page}.${index}` }));
          return { items, hasMore: page < 2 };
        }
      });
    });
    await control(page, 'thing').click();
    await expect(options(page, 'thing')).toHaveCount(20);
    await scrollToEnd(page, 'thing');
    await expect(options(page, 'thing')).toHaveCount(40);
    await scrollToEnd(page, 'thing');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__calls)).toEqual([1, 2]);
  });

  test('mapItem converts raw server rows', async ({ page }) => {
    await blank(page, '<label for="person">Person</label><select id="person" name="person"></select>', (url) => {
      new window.FlowSelect('#person', {
        url,
        mapItem: (raw) => ({ value: raw.value, label: raw.label.toUpperCase(), meta: raw.badge })
      });
    }, PEOPLE);
    await control(page, 'person').click();
    await expect(options(page, 'person')).toHaveCount(20);
    await expect(options(page, 'person').first().locator('.fs-label')).toHaveText('MAYA PATEL');
    await expect(options(page, 'person').first().locator('.fs-meta-text')).toHaveText('Admin');
    await options(page, 'person').first().click();
    expect(await nativeOptions(page, 'person')).toEqual([{ value: 'p1', text: 'MAYA PATEL', selected: true, dynamic: true }]);
  });

  test('fetchOptions.headers are sent along with the default headers', async ({ page }) => {
    const seen = [];
    await page.route('**/api/people?*', async (route) => {
      seen.push(await route.request().allHeaders());
      await route.continue();
    });
    await blank(page, '<label for="person">Person</label><select id="person"></select>', (url) => {
      new window.FlowSelect('#person', { url, fetchOptions: { headers: { 'X-Api-Version': '2' } } });
    }, PEOPLE);
    await control(page, 'person').click();
    await expect(options(page, 'person')).toHaveCount(20);
    expect(seen[0]['accept']).toBe('application/json');
    expect(seen[0]['x-requested-with']).toBe('XMLHttpRequest');
    expect(seen[0]['x-api-version']).toBe('2');
  });

  // BUG: fetchOptions.headers given as a Headers instance (or [name, value] pairs) are dropped
  test('fetchOptions.headers as a Headers instance are sent', async ({ page }) => {
    const seen = [];
    await page.route('**/api/people?*', async (route) => {
      seen.push(await route.request().allHeaders());
      await route.continue();
    });
    await blank(page, '<label for="person">Person</label><select id="person"></select>', (url) => {
      new window.FlowSelect('#person', { url, fetchOptions: { headers: new Headers({ 'X-Api-Version': '2' }) } });
    }, PEOPLE);
    await control(page, 'person').click();
    await expect(options(page, 'person')).toHaveCount(20);
    expect(seen[0]['x-api-version']).toBe('2');
  });

  test('the {query} placeholder is filled and encoded', async ({ page }) => {
    await mount(page, person('person', '', `${PEOPLE}?q={query}&delay=0`));
    await openAndWait(page, 'person');
    await input(page, 'person').pressSequentially('maya p');
    await waitForLoad(page, 'maya p');
    await expect(options(page, 'person')).toHaveCount(1);
    expect((await requests(page)).map((entry) => entry.href)).toEqual([`${PEOPLE}?q=&delay=0`, `${PEOPLE}?q=maya%20p&delay=0`]);
  });

  test('the {page} placeholder is filled on every page', async ({ page }) => {
    await mount(page, person('person', '', `${PEOPLE}?q={query}&page={page}`));
    await openAndWait(page, 'person');
    await scrollToEnd(page, 'person');
    await expect(options(page, 'person')).toHaveCount(40);
    expect((await requests(page)).map((entry) => entry.page)).toEqual(['1', '2']);
    expect(new Set(await labels(page, 'person')).size).toBe(40);
  });

  // BUG: a url with {query} but no {page} drops the page number, so "next page" repeats page 1
  test('a {query} url without {page} still asks for page 2', async ({ page }) => {
    await mount(page, person('person', '', `${PEOPLE}?q={query}`));
    await openAndWait(page, 'person');
    await scrollToEnd(page, 'person');
    await waitForLoad(page, '', 2);
    expect.soft((await requests(page)).map((entry) => entry.page)).toEqual([null, '2']);
    expect(new Set(await labels(page, 'person')).size).toBe(await options(page, 'person').count());
  });

  test('a custom query param replaces q', async ({ page }) => {
    const urls = [];
    await page.route('**/api/search*', async (route) => {
      urls.push(new URL(route.request().url()));
      await route.fulfill({ json: { items: [{ value: 'x1', label: 'Exact match' }], hasMore: false } });
    });
    await mount(page, person('person', 'data-fs-query-param="term"', '/api/search?scope=all'));
    await openAndWait(page, 'person', 1);
    await input(page, 'person').pressSequentially('maya');
    await waitForLoad(page, 'maya');
    expect(urls.map((url) => url.searchParams.get('term'))).toEqual(['', 'maya']);
    expect(urls.every((url) => !url.searchParams.has('q') && url.searchParams.get('scope') === 'all')).toBe(true);
  });
});

// ---------- create ----------

test.describe('create', () => {
  test('create: true offers a create row and selects the new value', async ({ page }) => {
    await mount(page, `<label for="tags">Tags</label><select id="tags" name="tags[]" multiple data-flow-select data-fs-url="/api/tags" data-fs-create></select>`);
    await control(page, 'tags').click();
    await expect(options(page, 'tags')).toHaveCount(20);
    await input(page, 'tags').pressSequentially('CSS');
    await waitForLoad(page, 'CSS');
    await expect(root(page, 'tags').locator('.fs-create')).toHaveCount(0);

    await input(page, 'tags').fill('Svelte');
    await waitForLoad(page, 'Svelte');
    const create = root(page, 'tags').locator('.fs-create');
    await expect(create).toHaveText('Create “Svelte”');
    await create.click();
    await expect(root(page, 'tags').locator('.fs-chip-label')).toHaveText(['Svelte']);
    expect(await nativeOptions(page, 'tags')).toEqual([{ value: 'Svelte', text: 'Svelte', selected: true, dynamic: true }]);
    const created = await events(page, 'create');
    expect(created.map((event) => event.item)).toEqual(['Svelte']);
  });

  test('single remote select creates with Enter', async ({ page }) => {
    await mount(page, `<label for="tag">Tag</label><select id="tag" name="tag" data-flow-select data-fs-url="/api/tags" data-fs-create></select>`);
    await control(page, 'tag').click();
    await input(page, 'tag').pressSequentially('Svelte');
    await waitForLoad(page, 'Svelte');
    await input(page, 'tag').press('Enter');
    await expectOpen(page, 'tag', false);
    await expect(root(page, 'tag').locator('.fs-value-text')).toHaveText('Svelte');
    expect(await nativeValue(page, 'tag')).toBe('Svelte');
  });

  test('an async create function supplies the new item', async ({ page }) => {
    await blank(page, '<label for="tags">Tags</label><select id="tags" name="tags[]" multiple></select>', () => {
      window.__created = [];
      new window.FlowSelect('#tags', {
        url: '/api/tags',
        create: async (label) => {
          window.__created.push(label);
          await new Promise((done) => setTimeout(done, 150));
          return { value: `new-${label.toLowerCase()}`, label };
        }
      });
    });
    await control(page, 'tags').click();
    await input(page, 'tags').pressSequentially('Svelte');
    await waitForLoad(page, 'Svelte');
    await root(page, 'tags').locator('.fs-create').click();
    await expect(root(page, 'tags').locator('.fs-chip-label')).toHaveText(['Svelte']);
    expect(await nativeValue(page, 'tags')).toEqual(['new-svelte']);
    expect(await page.evaluate(() => window.__created)).toEqual(['Svelte']);
  });

  test('a rejecting create function emits an error and selects nothing', async ({ page }) => {
    await blank(page, '<label for="tags">Tags</label><select id="tags" name="tags[]" multiple></select>', () => {
      new window.FlowSelect('#tags', {
        url: '/api/tags',
        create: async () => {
          throw new Error('Not allowed');
        }
      });
    });
    await control(page, 'tags').click();
    await input(page, 'tags').pressSequentially('Svelte');
    await waitForLoad(page, 'Svelte');
    await root(page, 'tags').locator('.fs-create').click();
    await expect.poll(async () => (await events(page, 'error')).length).toBe(1);
    expect(await nativeValue(page, 'tags')).toEqual([]);
  });

  // BUG: in remote mode a created value is not remembered, so "Create" is offered again and choosing it deselects the value
  test('creating the same value again keeps it selected', async ({ page }) => {
    await mount(page, `<label for="tags">Tags</label><select id="tags" name="tags[]" multiple data-flow-select data-fs-url="/api/tags" data-fs-create></select>`);
    await control(page, 'tags').click();
    await input(page, 'tags').pressSequentially('Svelte');
    await waitForLoad(page, 'Svelte');
    await input(page, 'tags').press('Enter');
    await expect(root(page, 'tags').locator('.fs-chip-label')).toHaveText(['Svelte']);

    await input(page, 'tags').pressSequentially('Svelte');
    await expect.poll(async () => (await events(page, 'load')).filter((event) => event.query === 'Svelte').length).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    await input(page, 'tags').press('Enter');
    await page.waitForTimeout(200);
    expect(await nativeValue(page, 'tags')).toEqual(['Svelte']);
  });

  // BUG: an async create can run twice for one item (double Enter or double click), creating it twice and then deselecting it
  test('pressing Enter twice on the create row creates once', async ({ page }) => {
    await blank(page, '<label for="tags">Tags</label><select id="tags" name="tags[]" multiple></select>', () => {
      window.__created = [];
      new window.FlowSelect('#tags', {
        url: '/api/tags',
        create: async (label) => {
          window.__created.push(label);
          await new Promise((done) => setTimeout(done, 300));
          return { value: `new-${label.toLowerCase()}`, label };
        }
      });
    });
    await control(page, 'tags').click();
    await input(page, 'tags').pressSequentially('Svelte');
    await waitForLoad(page, 'Svelte');
    await input(page, 'tags').press('Enter');
    await input(page, 'tags').press('Enter');
    await page.waitForTimeout(700);
    expect.soft(await page.evaluate(() => window.__created)).toEqual(['Svelte']);
    expect(await nativeValue(page, 'tags')).toEqual(['new-svelte']);
  });
});

// ---------- search modes ----------

test.describe('search modes', () => {
  test('field variant searches inline in the control', async ({ page }) => {
    await mount(page, person('person'));
    await expect(root(page, 'person').locator('.fs-trigger')).toHaveCount(0);
    await openAndWait(page, 'person');
    await expect(input(page, 'person')).toBeFocused();
    await expect(popover(page, 'person').locator('.fs-search')).toHaveCount(0);
    await input(page, 'person').pressSequentially('maya');
    await waitForLoad(page, 'maya');
    await expect(options(page, 'person')).toHaveCount(13);
    await input(page, 'person').press('ArrowDown');
    await input(page, 'person').press('Enter');
    await expectOpen(page, 'person', false);
    await expect(input(page, 'person')).toHaveValue('');
    await expect(root(page, 'person').locator('.fs-value-text')).toHaveText('Maya Martin');
    expect(await nativeValue(page, 'person')).toBe('p21');
  });

  test('pill variant searches in a dropdown search box', async ({ page }) => {
    await mount(page, person('person', 'data-fs-variant="pill"', `${PEOPLE}?delay=50`));
    const triggerButton = root(page, 'person').locator('.fs-trigger');
    await expect(triggerButton).toHaveCount(1);
    await openAndWait(page, 'person');
    const search = popover(page, 'person').locator('.fs-search input');
    await expect(search).toBeFocused();
    await search.pressSequentially('maya');
    await waitForLoad(page, 'maya');
    await expect(options(page, 'person')).toHaveCount(13);
    await search.press('Enter');
    await expectOpen(page, 'person', false);
    await expect(triggerButton).toBeFocused();
    await expect(triggerButton.locator('.fs-value-text')).toHaveText('Maya Patel');
    expect(await nativeValue(page, 'person')).toBe('p1');

    await triggerButton.press('l');
    await expectOpen(page, 'person');
    await expect(search).toHaveValue('l');
    await expect(search).toBeFocused();
    await page.keyboard.type('eo pat');
    await waitForLoad(page, 'leo pat');
    await expect(options(page, 'person')).toHaveCount(1);
    await expect(options(page, 'person').first().locator('.fs-label')).toHaveText('Leo Patel');
  });
});

// ---------- robustness ----------

test('rapid open, close and typing produce no errors', async ({ page }) => {
  test.setTimeout(90000);
  await mount(page, `${person('person', '', `${PEOPLE}?delay=120`)}${person('other', 'data-fs-variant="pill"', `${PEOPLE}?delay=60`)}`);
  for (let round = 0; round < 5; round += 1) {
    await control(page, 'person').click();
    await page.keyboard.type('ma', { delay: 10 });
    await page.keyboard.press('Escape');
    await control(page, 'other').click();
    await page.keyboard.type('le');
    await control(page, 'person').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => {
    const instance = window.FlowSelect.get('#person');
    for (let round = 0; round < 25; round += 1) {
      instance.open();
      instance.reload();
      instance.close();
    }
    instance.open();
  });
  await input(page, 'person').pressSequentially('lena');
  await page.evaluate(() => window.FlowSelect.get('#person').close());
  await page.waitForTimeout(800);
  await expectOpen(page, 'person', false);
  await expectOpen(page, 'other', false);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__rejections)).toEqual([]);
});
