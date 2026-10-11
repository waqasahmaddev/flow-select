import { createItem } from './option-store.js';

const CACHE_LIMIT = 50;

function buildUrl(template, query, page, queryParam) {
  const hasPage = template.includes('{page}');
  if (template.includes('{query}') || hasPage) {
    const filled = template.replaceAll('{query}', encodeURIComponent(query)).replaceAll('{page}', String(page));
    if (hasPage || page < 2) {
      return filled;
    }
    const next = new URL(filled, document.baseURI);
    next.searchParams.set('page', String(page));
    return next.href;
  }
  const url = new URL(template, document.baseURI);
  url.searchParams.set(queryParam, query);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  }
  return url.href;
}

function normalizeResult(result, mapItem) {
  const list = Array.isArray(result)
    ? result
    : result?.items ?? result?.results ?? result?.data ?? [];
  const hasMore = Array.isArray(result)
    ? false
    : Boolean(result?.hasMore ?? result?.more ?? result?.pagination?.more);
  const items = [];
  for (const raw of list) {
    const item = createItem(mapItem ? mapItem(raw) : raw);
    if (item) {
      items.push(item);
    }
  }
  return { items, hasMore };
}

export class RemoteSource {
  constructor(options, handlers) {
    this.options = options;
    this.handlers = handlers;
    this.cache = new Map();
    this.timer = 0;
    this.token = 0;
    this.controller = null;
    this.state = { query: '', page: 0, hasMore: false, loading: false };
  }

  get loading() {
    return this.state.loading;
  }

  get hasMore() {
    return this.state.hasMore;
  }

  search(query, { page = 1, immediate = false } = {}) {
    this.cancel();
    const token = ++this.token;
    const key = `${page}\u0000${query}`;
    const cached = this.options.cache ? this.cache.get(key) : undefined;
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      this.finish(cached, query, page);
      return;
    }
    this.state = { query, page, hasMore: this.state.hasMore, loading: true };
    this.handlers.onLoading(query, page);
    const run = () => {
      this.timer = 0;
      this.request(token, key, query, page);
    };
    const delay = immediate || page > 1 ? 0 : this.options.debounce;
    if (delay > 0) {
      this.timer = setTimeout(run, delay);
    } else {
      run();
    }
  }

  loadMore() {
    if (this.state.hasMore && !this.state.loading) {
      this.search(this.state.query, { page: this.state.page + 1 });
    }
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = 0;
    this.token += 1;
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    this.state.loading = false;
  }

  clearCache() {
    this.cache.clear();
  }

  async request(token, key, query, page) {
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = normalizeResult(await this.fetch(query, page, controller.signal), this.options.mapItem);
      if (token !== this.token) {
        return;
      }
      if (this.options.cache) {
        this.remember(key, result);
      }
      this.finish(result, query, page);
    } catch (error) {
      if (token !== this.token || error?.name === 'AbortError') {
        return;
      }
      this.controller = null;
      this.state.loading = false;
      if (page > 1) {
        this.state.page = page - 1;
      } else {
        this.state.hasMore = false;
      }
      this.handlers.onError(error, query, page);
    }
  }

  async fetch(query, page, signal) {
    const { load, url, queryParam, fetchOptions } = this.options;
    if (typeof load === 'function') {
      return load(query, { page, signal });
    }
    const init = fetchOptions || {};
    const headers = new Headers({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' });
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    const response = await fetch(buildUrl(url, query, page, queryParam), { credentials: 'same-origin', ...init, headers, signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return response.json();
  }

  remember(key, result) {
    this.cache.delete(key);
    this.cache.set(key, result);
    if (this.cache.size > CACHE_LIMIT) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }

  finish(result, query, page) {
    this.controller = null;
    this.state = { query, page, hasMore: result.hasMore, loading: false };
    this.handlers.onResult(result, query, page);
  }
}
