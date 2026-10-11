import { defaults, readDataset, mergeOptions, format } from './config.js';
import { el, icon, avatar, appendContent, copyLayout, nextId } from './dom.js';
import { OptionStore, createItem, itemFromOption, normalizeText } from './option-store.js';
import { RemoteSource } from './remote-source.js';
import { ListboxView } from './listbox-view.js';
import { positionPopover } from './position.js';

const SELECTOR = 'select[data-flow-select]:not([data-flow-select="manual"])';
const TYPEAHEAD_RESET_MS = 600;
const ANNOUNCE_DELAY_MS = 400;
const PAGE_STEP = 10;

const instances = new WeakMap();
const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

let openInstance = null;

function toSelect(target) {
  return typeof target === 'string' ? document.querySelector(target) : target;
}

function sameValues(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const weakActions = {
  refresh: (instance) => instance?.refresh(),
  reload: (instance) => instance?.reload(),
  reset: (instance) => {
    if (instance) {
      setTimeout(() => instance.refresh({ reset: true }), 0);
    }
  }
};

function listenWeak(target, name, instance, signal, action) {
  const ref = new WeakRef(instance);
  target.addEventListener(name, () => weakActions[action](ref.deref()), { signal });
}

function isPrintable(event) {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export class FlowSelect {
  static defaults = defaults;
  static selector = SELECTOR;
  static version = '0.1.0';

  static #plugins = new Set();

  static use(plugin, options) {
    if (typeof plugin !== 'function') {
      throw new TypeError('FlowSelect.use expects a function.');
    }
    if (!FlowSelect.#plugins.has(plugin)) {
      FlowSelect.#plugins.add(plugin);
      plugin(FlowSelect, options);
    }
    return FlowSelect;
  }

  static #unwrapStale(select) {
    const parent = select.parentElement;
    if (parent?.classList.contains('fs') && parent.firstElementChild === select) {
      parent.replaceWith(select);
    }
    if (select.classList.contains('fs-native')) {
      select.classList.remove('fs-native');
      select.removeAttribute('tabindex');
      select.removeAttribute('aria-hidden');
    }
  }

  static get(target) {
    const select = toSelect(target);
    return select ? instances.get(select) ?? null : null;
  }

  static init(root = document, options) {
    const selects = [];
    if (root instanceof HTMLSelectElement) {
      selects.push(root);
    } else if (root && typeof root.querySelectorAll === 'function') {
      if (root instanceof Element && root.matches(SELECTOR)) {
        selects.push(root);
      }
      selects.push(...root.querySelectorAll(SELECTOR));
    }
    return selects.map((select) => instances.get(select) ?? new FlowSelect(select, options));
  }

  static destroy(root = document) {
    const selects = root instanceof HTMLSelectElement ? [root] : root.querySelectorAll?.('select') ?? [];
    for (const select of selects) {
      instances.get(select)?.destroy();
    }
  }

  static observe(root = document.body) {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1 && (node.matches(SELECTOR) || node.firstElementChild)) {
            FlowSelect.init(node);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  #id;
  #store = new OptionStore();
  #values = [];
  #set = new Set();
  #query = '';
  #isOpen = false;
  #disabled = false;
  #destroyed = false;
  #searchMode = 'none';
  #variant = 'field';
  #creating = false;
  #remote = null;
  #placeholder = null;

  #root;
  #control;
  #focus;
  #trigger = null;
  #input = null;
  #valueEl = null;
  #chips = null;
  #inputItem = null;
  #clear = null;
  #live;
  #popover = null;
  #search = null;
  #list = null;
  #status = null;
  #view = null;

  #listboxId;
  #valueId;
  #labelIds = '';
  #saved;
  #rtl = false;
  #active = -1;
  #chip = -1;
  #pointer = 'mouse';
  #pointerHandled = false;
  #pointerX = -1;
  #pointerY = -1;
  #typed = '';
  #typedAt = 0;
  #frame = 0;
  #refreshQueued = false;
  #announceTimer = 0;
  #listeners = new AbortController();
  #openListeners = null;
  #observer;

  constructor(target, options = {}) {
    const select = toSelect(target);
    if (!(select instanceof HTMLSelectElement)) {
      throw new TypeError('FlowSelect expects a <select> element or a selector that matches one.');
    }
    const existing = instances.get(select);
    if (existing) {
      return existing;
    }
    instances.set(select, this);
    FlowSelect.#unwrapStale(select);

    this.element = select;
    this.options = mergeOptions(FlowSelect.defaults, readDataset(select), options);
    this.multiple = select.multiple;
    this.#id = nextId('fs');
    if (this.options.url || typeof this.options.load === 'function') {
      this.#remote = new RemoteSource(this.options, {
        onLoading: (query, page) => this.#onRemoteLoading(query, page),
        onResult: (result, query, page) => this.#onRemoteResult(result, query, page),
        onError: (error, query, page) => this.#onRemoteError(error, query, page)
      });
    }

    this.#variant = ['pill', 'ghost'].includes(this.options.variant) ? this.options.variant : 'field';
    this.#readNative();
    this.#searchMode = this.#resolveSearch();
    this.#build();
    this.#renderValue();
    this.#syncState();
    this.#bind();
    if (document.activeElement === select) {
      this.focus();
    }
    this.#emit('init');
  }

  get value() {
    return this.multiple ? this.#values.slice() : this.#values[0] ?? '';
  }

  set value(value) {
    this.setValue(value);
  }

  get selectedItems() {
    return this.#values.map((value) => this.#store.get(value) ?? createItem(value));
  }

  get isOpen() {
    return this.#isOpen;
  }

  get disabled() {
    return this.#disabled;
  }

  // ---------- Public API ----------

  open({ focusSearch = true } = {}) {
    if (this.#isOpen || this.#disabled || this.#destroyed) {
      return;
    }
    if (openInstance && openInstance !== this) {
      openInstance.close({ restoreFocus: false });
    }
    this.#ensurePopover();
    this.#isOpen = true;
    openInstance = this;
    this.#rtl = getComputedStyle(this.#control).direction === 'rtl';
    this.#root.classList.add('is-open');
    this.#focus.setAttribute('aria-expanded', 'true');
    this.#query = this.#input ? this.#input.value : '';
    if (this.#search) {
      this.#search.value = '';
    }
    this.#showPopover();
    this.#listenWhileOpen();
    this.#refreshRows();
    this.#position();
    if (this.#search && focusSearch) {
      this.#search.focus({ preventScroll: true });
    }
    this.#emit('open');
  }

  close({ restoreFocus = true } = {}) {
    if (!this.#isOpen) {
      return;
    }
    const focusInside = this.#popover.contains(document.activeElement);
    this.#isOpen = false;
    if (openInstance === this) {
      openInstance = null;
    }
    this.#remote?.cancel();
    this.#openListeners?.abort();
    this.#openListeners = null;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#hidePopover();
    this.#root.classList.remove('is-open', 'has-query');
    this.#focus.setAttribute('aria-expanded', 'false');
    this.#setActive(-1);
    this.#query = '';
    if (this.#input) {
      this.#input.value = '';
    }
    this.#setChip(-1);
    if (restoreFocus && (focusInside || this.#root.contains(document.activeElement))) {
      this.#focus.focus({ preventScroll: true });
    }
    this.#emit('close');
  }

  toggle() {
    if (this.#isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  focus() {
    this.#focus.focus({ preventScroll: true });
  }

  clear({ silent = false } = {}) {
    this.#commit([], { silent });
  }

  setValue(value, { silent = false } = {}) {
    const list = value === null || value === undefined ? [] : Array.isArray(value) ? value : [value];
    const values = [];
    for (const entry of list) {
      if (entry !== null && typeof entry === 'object') {
        const item = createItem(entry);
        if (item) {
          this.#store.remember(item);
          values.push(item.value);
        }
      } else if (entry !== '' && entry !== null && entry !== undefined) {
        const key = String(entry);
        if (this.#store.get(key) || this.#remote) {
          values.push(key);
        }
      }
    }
    const unique = Array.from(new Set(values));
    this.#commit(this.multiple ? this.#limit(unique) : unique.slice(0, 1), { silent });
  }

  addOption(source, { selected = false } = {}) {
    const item = createItem(source);
    if (!item) {
      return null;
    }
    this.#mutate(() => this.element.add(this.#nativeOption(item, false, false)));
    this.#readNative();
    if (selected) {
      this.setValue(this.multiple ? [...this.#values, item.value] : item.value);
    } else if (this.#isOpen) {
      this.#refreshRows();
    }
    return item;
  }

  removeOption(value) {
    const key = String(value);
    this.#mutate(() => {
      for (const option of Array.from(this.element.options)) {
        if (option.value === key) {
          option.remove();
        }
      }
    });
    this.refresh();
  }

  setOptions(sources, { keepSelection = true } = {}) {
    const items = sources.map(createItem).filter(Boolean);
    const keep = keepSelection ? this.#set : new Set();
    this.#mutate(() => {
      for (const option of Array.from(this.element.options)) {
        if (option.value !== '') {
          option.remove();
        }
      }
      for (const item of items) {
        this.element.add(this.#nativeOption(item, keep.has(item.value), false));
      }
    });
    if (this.refresh()) {
      this.#dispatchChange();
    }
  }

  refresh({ reset = false } = {}) {
    if (this.#destroyed) {
      return false;
    }
    if (reset) {
      this.#mutate(() => {
        for (const option of this.element.querySelectorAll('option[data-fs-dynamic]')) {
          option.remove();
        }
      });
    }
    const previous = this.#values;
    this.#readNative();
    this.#renderValue();
    this.#syncState();
    if (this.#isOpen) {
      this.#refreshRows();
    }
    return !sameValues(previous, this.#values);
  }

  reload() {
    if (!this.#remote) {
      this.refresh();
      return;
    }
    this.#remote.clearCache();
    if (this.#isOpen) {
      this.#refreshRows();
    }
  }

  enable() {
    this.element.disabled = false;
    this.#syncState();
  }

  disable() {
    this.element.disabled = true;
    this.#syncState();
  }

  destroy({ restore = true } = {}) {
    if (this.#destroyed) {
      return;
    }
    this.close({ restoreFocus: false });
    this.#destroyed = true;
    this.#listeners.abort();
    this.#observer.disconnect();
    this.#remote?.cancel();
    clearTimeout(this.#announceTimer);
    const select = this.element;
    if (restore) {
      if (this.#root.isConnected) {
        this.#root.replaceWith(select);
      }
      select.classList.remove('fs-native');
      if (!select.getAttribute('class')) {
        select.removeAttribute('class');
      }
      for (const [name, value] of Object.entries(this.#saved)) {
        if (value === null) {
          select.removeAttribute(name);
        } else {
          select.setAttribute(name, value);
        }
      }
    }
    instances.delete(select);
    this.#emit('destroy');
  }

  // ---------- Native <select> ----------

  #readNative() {
    const select = this.element;
    const items = [];
    this.#placeholder = null;
    for (const option of select.options) {
      const item = itemFromOption(option);
      if (item.value === '') {
        item.placeholder = true;
        this.#placeholder ??= item;
        if (this.multiple || option.hidden || option.disabled || this.options.hidePlaceholderOption) {
          continue;
        }
      } else if (option.hidden) {
        continue;
      }
      items.push(item);
    }
    const values = [];
    for (const option of select.selectedOptions) {
      if (option.value !== '') {
        values.push(option.value);
      }
    }
    this.#store.replace(items, values);
    for (const option of select.selectedOptions) {
      if (option.value !== '' && !this.#store.get(option.value)) {
        this.#store.remember(itemFromOption(option));
      }
    }
    this.#setValues(this.multiple ? values : values.slice(0, 1));
  }

  #syncNative() {
    const select = this.element;
    this.#mutate(() => {
      const present = new Set(Array.from(select.options, (option) => option.value));
      for (const value of this.#values) {
        if (!present.has(value)) {
          select.add(this.#nativeOption(this.#store.get(value) ?? createItem(value), true, true));
        }
      }
      for (const option of Array.from(select.options)) {
        const keep = this.#set.has(option.value);
        option.selected = keep;
        if (!keep && option.hasAttribute('data-fs-dynamic')) {
          option.remove();
        }
      }
      if (!this.multiple && this.#values.length === 0) {
        const placeholder = Array.from(select.options).find((option) => option.value === '');
        if (placeholder) {
          placeholder.selected = true;
        } else {
          select.selectedIndex = -1;
        }
      }
    });
  }

  #nativeOption(item, selected, dynamic) {
    const option = new Option(item.label, item.value, false, selected);
    if (dynamic) {
      option.setAttribute('data-fs-dynamic', '');
    }
    for (const key of ['description', 'meta', 'badge', 'avatar', 'keywords']) {
      if (item[key]) {
        option.dataset[key] = item[key];
      }
    }
    option.disabled = item.disabled;
    return option;
  }

  #mutate(change) {
    change();
    this.#observer?.takeRecords();
  }

  // ---------- Build ----------

  #resolveSearch() {
    const { search, searchThreshold, create } = this.options;
    let enabled = search;
    if ((this.#remote || create) && !enabled) {
      enabled = true;
    }
    if (enabled === null || enabled === undefined) {
      enabled = this.multiple || this.#store.items.length > searchThreshold;
    }
    if (!enabled) {
      return 'none';
    }
    if (this.multiple) {
      return 'inline';
    }
    if (enabled === 'inline' || enabled === 'dropdown') {
      return enabled;
    }
    return this.#variant === 'field' ? 'inline' : 'dropdown';
  }

  #build() {
    const options = this.options;
    const select = this.element;
    const variant = this.#variant;
    const size = options.size === 'sm' || options.size === 'lg' ? ` fs--${options.size}` : '';
    const root = el('div', `fs fs--${variant}${size}${this.multiple ? ' fs--multiple' : ''}${options.className ? ` ${options.className}` : ''}`);
    copyLayout(select, root);
    const control = el('div', 'fs-control');
    this.#listboxId = `${this.#id}-listbox`;
    this.#valueId = `${this.#id}-value`;
    this.#labelIds = this.#readLabelIds();

    if (this.multiple || this.#searchMode === 'inline') {
      const input = el('input', 'fs-input', {
        type: 'text',
        role: 'combobox',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-controls': this.#listboxId,
        'aria-autocomplete': this.#searchMode === 'none' ? 'none' : 'list',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        enterkeyhint: 'done'
      });
      if (this.#searchMode === 'none') {
        input.readOnly = true;
        input.setAttribute('inputmode', 'none');
      }
      this.#input = input;
      if (this.multiple) {
        this.#chips = el('ul', 'fs-chips');
        this.#inputItem = el('li', 'fs-chip-input');
        this.#inputItem.append(input);
        this.#chips.append(this.#inputItem);
        control.append(this.#chips);
      } else {
        const field = el('div', 'fs-field');
        this.#valueEl = el('span', 'fs-value', { id: this.#valueId });
        field.append(this.#valueEl, input);
        control.append(field);
      }
    } else {
      this.#trigger = el('button', 'fs-trigger', {
        type: 'button',
        role: this.#searchMode === 'none' ? 'combobox' : null,
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-controls': this.#listboxId
      });
      this.#valueEl = el('span', 'fs-value', { id: this.#valueId });
      this.#trigger.append(this.#valueEl);
      control.append(this.#trigger);
    }
    this.#focus = this.#input ?? this.#trigger;

    if (options.clearable && !this.multiple) {
      this.#clear = el('button', 'fs-clear', { type: 'button', tabindex: '-1', 'aria-label': options.messages.clear });
      this.#clear.append(icon('close'));
      control.append(this.#clear);
    }
    control.append(icon('chevrons', 'fs-caret'));

    const target = this.#focus;
    const nameIncludesValue = !this.multiple && this.#searchMode !== 'none';
    if (this.#labelIds) {
      target.setAttribute('aria-labelledby', nameIncludesValue ? `${this.#labelIds} ${this.#valueId}` : this.#labelIds);
    } else if (select.hasAttribute('aria-label')) {
      target.setAttribute('aria-label', select.getAttribute('aria-label'));
    }
    if (select.hasAttribute('aria-describedby')) {
      target.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    }

    this.#live = el('div', 'fs-sr', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    this.#saved = { tabindex: select.getAttribute('tabindex'), 'aria-hidden': select.getAttribute('aria-hidden') };
    select.parentNode.insertBefore(root, select);
    root.append(select, control, this.#live);
    select.classList.add('fs-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    this.#root = root;
    this.#control = control;
    this.#observer = new MutationObserver(() => this.#queueRefresh());
    this.#observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'label', 'hidden', 'selected'] });
    for (let node = root.parentElement; node; node = node.parentElement) {
      if (node.tagName === 'FIELDSET') {
        this.#observer.observe(node, { attributes: true, attributeFilter: ['disabled'] });
      }
    }
  }

  #ensurePopover() {
    if (this.#popover || this.#destroyed) {
      return;
    }
    const options = this.options;
    const popover = el('div', 'fs-popover', { id: `${this.#id}-popover` });
    if (supportsPopover) {
      popover.setAttribute('popover', 'manual');
    } else {
      popover.hidden = true;
    }
    if (options.maxHeight) {
      popover.style.setProperty('--fs-pop-max-height', options.maxHeight);
    }
    if (this.#searchMode === 'dropdown') {
      const box = el('div', 'fs-search');
      this.#search = el('input', 'fs-input', {
        type: 'text',
        role: 'combobox',
        'aria-expanded': 'true',
        'aria-controls': this.#listboxId,
        'aria-autocomplete': 'list',
        'aria-label': options.searchPlaceholder || 'Search',
        placeholder: options.searchPlaceholder,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        enterkeyhint: 'search'
      });
      box.append(icon('search'), this.#search);
      popover.append(box);
    }
    const check = options.checkPosition === 'end' ? ' fs-list--check-end' : options.checkPosition === 'none' ? ' fs-list--plain' : '';
    this.#list = el('ul', `fs-list${check}`, {
      id: this.#listboxId,
      role: 'listbox',
      tabindex: '-1',
      'aria-multiselectable': this.multiple ? 'true' : null,
      'aria-labelledby': this.#labelIds || null,
      'aria-label': this.#labelIds ? null : this.element.getAttribute('aria-label')
    });
    this.#status = el('div', 'fs-status');
    this.#status.hidden = true;
    popover.append(this.#list, this.#status);
    this.#root.append(popover);
    this.#popover = popover;
    this.#view = new ListboxView(this.#list, {
      idPrefix: `${this.#id}-option`,
      pageSize: options.pageSize,
      renderOption: options.renderOption,
      isSelected: (item) => this.#isSelected(item),
      onNearEnd: () => this.#remote?.loadMore()
    });
    this.#bindPopover();
  }

  #readLabelIds() {
    const ids = [];
    for (const label of this.element.labels ?? []) {
      label.id ||= nextId('fs-label');
      ids.push(label.id);
    }
    const extra = this.element.getAttribute('aria-labelledby');
    if (extra) {
      ids.push(extra);
    }
    return ids.join(' ');
  }

  // ---------- Events ----------

  #bind() {
    const signal = this.#listeners.signal;
    const select = this.element;
    const warm = () => this.#ensurePopover();
    this.#root.addEventListener('pointerenter', warm, { signal });
    this.#root.addEventListener('focusin', warm, { signal });
    this.#root.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (this.#isOpen && next && !this.#root.contains(next)) {
        this.close({ restoreFocus: false });
      }
    }, { signal });
    this.#control.addEventListener('pointerdown', (event) => this.#onPointerDown(event), { signal });
    this.#control.addEventListener('click', (event) => this.#onClick(event), { signal });
    this.#focus.addEventListener('keydown', (event) => this.#onKeyDown(event), { signal });
    if (this.#input) {
      this.#input.addEventListener('input', () => this.#onType(this.#input.value), { signal });
    } else {
      this.#trigger.addEventListener('keyup', (event) => {
        if (event.key === ' ') {
          event.preventDefault();
        }
      }, { signal });
    }
    select.addEventListener('focus', () => this.focus(), { signal });
    select.addEventListener('invalid', () => this.#setInvalid(true), { signal });
    if (select.form) {
      listenWeak(select.form, 'reset', this, signal, 'reset');
    }
    listenWeak(window, 'pageshow', this, signal, 'refresh');
    for (const name of String(this.options.refreshOn || '').split(/\s+/).filter(Boolean)) {
      listenWeak(document, name, this, signal, 'reload');
    }
  }

  #bindPopover() {
    const signal = this.#listeners.signal;
    this.#popover.addEventListener('mousedown', (event) => {
      if (event.target !== this.#search) {
        event.preventDefault();
      }
    }, { signal });
    this.#list.addEventListener('click', (event) => {
      const row = event.target.closest('.fs-option');
      if (row) {
        this.#choose(this.#view.rows[Number(row.dataset.index)]);
      }
    }, { signal });
    this.#list.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || (event.clientX === this.#pointerX && event.clientY === this.#pointerY)) {
        return;
      }
      this.#pointerX = event.clientX;
      this.#pointerY = event.clientY;
      const row = event.target.closest('.fs-option');
      if (row && row.getAttribute('aria-disabled') !== 'true') {
        this.#setActive(Number(row.dataset.index), false);
      }
    }, { signal });
    this.#status.addEventListener('click', (event) => {
      if (event.target.closest('.fs-retry')) {
        this.#refreshRows();
      }
    }, { signal });
    if (this.#search) {
      this.#search.addEventListener('input', () => this.#onType(this.#search.value), { signal });
      this.#search.addEventListener('keydown', (event) => this.#onKeyDown(event), { signal });
    }
  }

  #listenWhileOpen() {
    this.#openListeners = new AbortController();
    const signal = this.#openListeners.signal;
    const reposition = (event) => {
      const inside = event.type === 'scroll' && event.target instanceof Node && this.#popover.contains(event.target);
      if (!inside) {
        this.#schedulePosition();
      }
    };
    const watcher = new MutationObserver(() => {
      if (!this.#root.isConnected) {
        this.close({ restoreFocus: false });
      }
    });
    watcher.observe(document, { childList: true, subtree: true });
    signal.addEventListener('abort', () => watcher.disconnect());
    document.addEventListener('pointerdown', (event) => {
      if (!this.#root.contains(event.target)) {
        this.close({ restoreFocus: false });
      }
    }, { signal, capture: true });
    window.addEventListener('scroll', reposition, { signal, capture: true, passive: true });
    window.addEventListener('resize', reposition, { signal });
    window.visualViewport?.addEventListener('resize', reposition, { signal });
    window.visualViewport?.addEventListener('scroll', reposition, { signal });
  }

  #onPointerDown(event) {
    this.#pointer = event.pointerType || 'mouse';
    this.#pointerHandled = false;
    if (event.button !== 0 || this.#disabled) {
      return;
    }
    const target = event.target;
    if (target.closest('.fs-clear, .fs-chip-remove')) {
      event.preventDefault();
      return;
    }
    if (this.#pointer === 'touch') {
      return;
    }
    this.#pointerHandled = true;
    if (target !== this.#input) {
      event.preventDefault();
    }
    if (document.activeElement !== this.#focus) {
      this.#focus.focus({ preventScroll: true });
    }
    if (!this.#isOpen) {
      this.open();
    } else if (target !== this.#input) {
      this.close();
    }
  }

  #onClick(event) {
    const target = event.target;
    const remove = target.closest('.fs-chip-remove');
    if (remove) {
      this.#removeValue(remove.closest('.fs-chip').dataset.value);
      this.focus();
      return;
    }
    if (target.closest('.fs-clear')) {
      this.close({ restoreFocus: false });
      this.clear();
      this.focus();
      return;
    }
    if (this.#pointerHandled) {
      this.#pointerHandled = false;
      return;
    }
    if (this.#disabled || (target === this.#input && this.#isOpen)) {
      return;
    }
    this.focus();
    if (this.#isOpen) {
      this.close();
    } else {
      this.open({ focusSearch: this.#pointer !== 'touch' });
    }
  }

  #onType(value) {
    this.#setChip(-1);
    this.#query = value;
    this.#root.classList.toggle('has-query', value !== '' && !this.multiple);
    if (!this.#isOpen) {
      this.open({ focusSearch: false });
      return;
    }
    this.#refreshRows();
    this.#emit('search', { query: value });
  }

  #onKeyDown(event) {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    this.#pointer = 'keyboard';
    const key = event.key;
    const target = event.target;
    const typing = target === this.#search || (target === this.#input && !this.#input.readOnly);
    const empty = !typing || target.value === '';

    if (this.multiple && this.#onChipKey(event, empty)) {
      return;
    }
    if (!this.#isOpen) {
      this.#onClosedKey(event, empty);
      return;
    }
    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        this.#move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (event.altKey) {
          this.#chooseActive();
          this.close();
        } else {
          this.#move(-1);
        }
        break;
      case 'PageDown':
      case 'PageUp':
        event.preventDefault();
        this.#move(key === 'PageDown' ? PAGE_STEP : -PAGE_STEP);
        break;
      case 'Home':
      case 'End':
        if (empty) {
          event.preventDefault();
          this.#moveToEdge(key === 'Home');
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (this.#active >= 0) {
          this.#chooseActive();
        } else if (this.#status.querySelector('.fs-retry')) {
          this.#refreshRows();
        }
        break;
      case ' ':
        if (!typing) {
          event.preventDefault();
          this.#chooseActive();
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close();
        break;
      case 'Tab':
        this.close();
        break;
      case 'Backspace':
      case 'Delete':
        if (empty && this.#values.length) {
          if (this.multiple && key === 'Backspace') {
            event.preventDefault();
            this.#removeValue(this.#values[this.#values.length - 1]);
          } else if (!this.multiple && this.options.clearable) {
            event.preventDefault();
            this.clear();
          }
        }
        break;
      default:
        if (!typing && isPrintable(event)) {
          event.preventDefault();
          this.#typeaheadMove(key);
        }
    }
  }

  #onClosedKey(event, empty) {
    const key = event.key;
    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
        event.preventDefault();
        this.open();
        return;
      case 'Home':
      case 'End':
        if (empty) {
          event.preventDefault();
          this.open();
          this.#moveToEdge(key === 'Home');
        }
        return;
      case ' ':
        if (this.#trigger || this.#input.readOnly || this.#input.value === '') {
          event.preventDefault();
          this.open();
        }
        return;
      case 'Backspace':
      case 'Delete':
        if (!empty || !this.#values.length) {
          return;
        }
        if (this.multiple && key === 'Backspace') {
          event.preventDefault();
          this.#removeValue(this.#values[this.#values.length - 1]);
        } else if (!this.multiple && this.options.clearable) {
          event.preventDefault();
          this.clear();
        }
        return;
      default:
        if (!this.#trigger || !isPrintable(event)) {
          return;
        }
        event.preventDefault();
        if (this.#searchMode === 'dropdown') {
          this.open();
          this.#search.value = key;
          this.#onType(key);
        } else {
          this.#typeaheadSelect(key);
        }
    }
  }

  #onChipKey(event, empty) {
    const key = event.key;
    const count = this.#values.length;
    const rtl = getComputedStyle(this.#control).direction === 'rtl';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    if (this.#chip < 0) {
      if (key === back && count && empty) {
        event.preventDefault();
        this.#setChip(count - 1);
        return true;
      }
      return false;
    }
    switch (key) {
      case back:
        event.preventDefault();
        this.#setChip(Math.max(0, this.#chip - 1));
        return true;
      case forward:
        event.preventDefault();
        this.#setChip(this.#chip + 1 < count ? this.#chip + 1 : -1);
        return true;
      case 'Backspace':
      case 'Delete': {
        event.preventDefault();
        const index = this.#chip;
        this.#removeValue(this.#values[index]);
        const remaining = this.#values.length;
        this.#setChip(remaining === 0 ? -1 : key === 'Backspace' ? Math.max(0, index - 1) : Math.min(index, remaining - 1));
        return true;
      }
      default:
        this.#setChip(-1);
        return false;
    }
  }

  #setChip(index) {
    if (!this.#chips) {
      return;
    }
    const chips = this.#chips.querySelectorAll('.fs-chip');
    chips[this.#chip]?.classList.remove('is-active');
    this.#chip = chips[index] ? index : -1;
    if (this.#chip >= 0) {
      chips[index].classList.add('is-active');
      this.#announce(chips[index].dataset.label);
    }
  }

  // ---------- Rows and navigation ----------

  #refreshRows() {
    if (!this.#view) {
      return;
    }
    if (this.#remote) {
      this.#refreshRemote();
      return;
    }
    this.#showRows(this.#withCreateRow(this.#visible(this.#store.filter(this.#query))));
  }

  #refreshRemote() {
    const query = this.#query.trim();
    const minimum = this.options.minQueryLength;
    if (query.length < minimum) {
      this.#remote.cancel();
      this.#setLoading(false);
      this.#view.setRows([]);
      this.#setActive(-1);
      this.#setStatus('info', format(this.options.messages.typeMore, { count: minimum }));
      this.#schedulePosition();
      return;
    }
    this.#remote.search(query, { immediate: query === '' });
  }

  #showRows(rows) {
    const messages = this.options.messages;
    const query = this.#query.trim();
    this.#view.setRows(rows);
    if (rows.length) {
      this.#setStatus(null);
    } else {
      this.#setStatus('info', query ? format(messages.noResultsFor, { query }) : messages.noResults);
    }
    this.#setActive(this.#initialActive(rows), true);
    if (query) {
      this.#announceCount(rows.filter((row) => !row.create).length);
    }
    this.#schedulePosition();
  }

  #withCreateRow(rows) {
    const label = this.#query.trim();
    if (!this.options.create || !label || this.#store.findByLabel(label)) {
      return rows;
    }
    const needle = normalizeText(label);
    if (rows.some((row) => normalizeText(row.label).trim() === needle)) {
      return rows;
    }
    rows.push({ create: true, value: label, label: format(this.options.messages.create, { query: label }), group: '' });
    return rows;
  }

  #visible(rows) {
    return this.multiple && this.options.hideSelected ? rows.filter((row) => !this.#set.has(row.value)) : rows.slice();
  }

  #initialActive(rows) {
    if (!this.#query.trim()) {
      const selected = rows.findIndex((row) => !row.disabled && !row.create && this.#isSelected(row));
      if (selected >= 0) {
        return selected;
      }
    }
    return rows.findIndex((row) => !row.disabled);
  }

  #isSelected(item) {
    return item.placeholder ? this.#values.length === 0 : this.#set.has(item.value);
  }

  #setActive(index, scroll = true) {
    this.#active = index;
    const owner = this.#input ?? this.#search ?? this.#trigger;
    const node = this.#view ? this.#view.setActive(index, scroll) : null;
    if (node) {
      owner.setAttribute('aria-activedescendant', node.id);
    } else {
      owner.removeAttribute('aria-activedescendant');
    }
  }

  #move(delta) {
    const rows = this.#view.rows;
    if (!rows.length) {
      return;
    }
    const direction = delta > 0 ? 1 : -1;
    const start = this.#active < 0 ? (direction > 0 ? -1 : rows.length) : this.#active;
    let index = Math.max(0, Math.min(rows.length - 1, start + delta));
    while (index >= 0 && index < rows.length && rows[index].disabled) {
      index += direction;
    }
    if (index < 0 || index >= rows.length) {
      index = Math.max(0, Math.min(rows.length - 1, index));
      while (index >= 0 && index < rows.length && rows[index].disabled) {
        index -= direction;
      }
      if (index < 0 || index >= rows.length) {
        index = this.#active;
      }
    }
    if (index >= 0) {
      this.#setActive(index);
    }
    if (direction > 0 && index >= rows.length - 1) {
      this.#remote?.loadMore();
    }
  }

  #moveToEdge(first) {
    const rows = this.#view?.rows ?? [];
    const count = rows.length;
    for (let step = 0; step < count; step += 1) {
      const index = first ? step : count - 1 - step;
      if (!rows[index].disabled) {
        this.#setActive(index);
        return;
      }
    }
  }

  #typeaheadText(key) {
    const now = Date.now();
    if (now - this.#typedAt > TYPEAHEAD_RESET_MS) {
      this.#typed = '';
    }
    this.#typedAt = now;
    this.#typed += normalizeText(key);
    return this.#typed;
  }

  #findTypeahead(rows, text, current) {
    const repeated = text.length > 1 && Array.from(text).every((char) => char === text[0]);
    const prefix = repeated ? text[0] : text;
    const begin = current < 0 ? 0 : current + (repeated || text.length === 1 ? 1 : 0);
    for (let step = 0; step < rows.length; step += 1) {
      const row = rows[(begin + step) % rows.length];
      if (!row.disabled && !row.create && normalizeText(row.label).startsWith(prefix)) {
        return (begin + step) % rows.length;
      }
    }
    return -1;
  }

  #typeaheadMove(key) {
    const index = this.#findTypeahead(this.#view.rows, this.#typeaheadText(key), this.#active);
    if (index >= 0) {
      this.#setActive(index);
    }
  }

  #typeaheadSelect(key) {
    const rows = this.#store.filter('');
    const current = rows.findIndex((row) => this.#isSelected(row));
    const index = this.#findTypeahead(rows, this.#typeaheadText(key), current);
    if (index >= 0 && index !== current) {
      this.#choose(rows[index], false);
    }
  }

  #chooseActive() {
    if (this.#active >= 0) {
      this.#choose(this.#view.rows[this.#active]);
    }
  }

  #choose(item, close = true) {
    if (!item || item.disabled) {
      return;
    }
    if (item.create) {
      this.#create();
      return;
    }
    if (!this.multiple) {
      if (item.placeholder) {
        this.#commit([]);
      } else {
        this.#store.remember(item);
        this.#commit([item.value]);
      }
      if (close && this.options.closeOnSelect !== false) {
        this.close();
      }
      return;
    }
    if (this.#set.has(item.value)) {
      this.#commit(this.#values.filter((value) => value !== item.value));
    } else {
      const max = this.options.maxItems;
      if (max > 0 && this.#values.length >= max) {
        this.#announce(format(this.options.messages.maxItems, { count: max }));
        return;
      }
      this.#store.remember(item);
      this.#commit([...this.#values, item.value]);
    }
    if (this.options.closeOnSelect === true) {
      this.close();
    } else if (this.#query || this.options.hideSelected) {
      this.#input.value = '';
      this.#query = '';
      this.#refreshRows();
    }
  }

  async #create() {
    const label = this.#query.trim();
    if (!label || this.#creating) {
      return;
    }
    this.#creating = true;
    try {
      await this.#createItem(label);
    } finally {
      this.#creating = false;
    }
  }

  async #createItem(label) {
    const create = this.options.create;
    let item;
    if (typeof create === 'function') {
      try {
        item = createItem(await create(label, this));
      } catch (error) {
        this.#emit('error', { error });
        return;
      }
      if (!item || this.#destroyed) {
        return;
      }
    } else {
      item = createItem({ value: label, label });
    }
    const existing = this.#store.get(item.value);
    if (existing) {
      item = existing;
    } else if (!this.#remote) {
      this.#store.add(item);
    }
    if (this.multiple && this.#set.has(item.value)) {
      this.#input.value = '';
      this.#query = '';
      this.#refreshRows();
      return;
    }
    this.#emit('create', { item });
    this.#choose(item);
  }

  #removeValue(value) {
    if (this.#set.has(value)) {
      this.#commit(this.#values.filter((entry) => entry !== value));
      if (this.#isOpen && this.options.hideSelected) {
        this.#refreshRows();
      }
    }
  }

  #limit(values) {
    const max = this.options.maxItems;
    return max > 0 ? values.slice(0, max) : values;
  }

  // ---------- Value ----------

  #setValues(values) {
    this.#values = values;
    this.#set = new Set(values);
  }

  #commit(values, { silent = false } = {}) {
    const changed = !sameValues(values, this.#values);
    this.#setValues(values);
    this.#syncNative();
    this.#renderValue();
    this.#view?.refreshSelection();
    this.#schedulePosition();
    if (this.#root.classList.contains('is-invalid') && this.element.checkValidity()) {
      this.#setInvalid(false);
    }
    if (changed && !silent) {
      this.#dispatchChange();
    }
    return changed;
  }

  #dispatchChange() {
    this.element.dispatchEvent(new Event('input', { bubbles: true }));
    this.element.dispatchEvent(new Event('change', { bubbles: true }));
    this.#emit('change', { items: this.selectedItems });
  }

  #placeholderText() {
    return this.options.placeholder || this.#placeholder?.label || '';
  }

  #renderValue() {
    if (this.multiple) {
      this.#renderChips();
      return;
    }
    const item = this.#values.length ? this.#store.get(this.#values[0]) ?? createItem(this.#values[0]) : null;
    const valueEl = this.#valueEl;
    valueEl.textContent = '';
    valueEl.classList.toggle('is-placeholder', !item);
    if (!item) {
      valueEl.textContent = this.#placeholderText() || ' ';
    } else {
      const custom = this.options.renderValue?.(item);
      if (custom !== null && custom !== undefined) {
        appendContent(valueEl, custom);
      } else {
        if (item.avatar) {
          valueEl.append(avatar(item));
        }
        const text = el('span', 'fs-value-text');
        text.textContent = item.label;
        valueEl.append(text);
      }
    }
    this.#root.classList.toggle('has-value', Boolean(item));
    if (this.#clear) {
      this.#clear.hidden = !item;
    }
  }

  #renderChips() {
    for (const chip of this.#chips.querySelectorAll('.fs-chip')) {
      chip.remove();
    }
    const fragment = document.createDocumentFragment();
    for (const value of this.#values) {
      const item = this.#store.get(value) ?? createItem(value);
      const chip = el('li', 'fs-chip');
      chip.dataset.value = item.value;
      chip.dataset.label = item.label;
      const label = el('span', 'fs-chip-label');
      label.textContent = item.label;
      chip.append(label);
      if (!this.#disabled) {
        const remove = el('button', 'fs-chip-remove', {
          type: 'button',
          tabindex: '-1',
          'aria-label': format(this.options.messages.remove, { label: item.label })
        });
        remove.append(icon('close'));
        chip.append(remove);
      }
      fragment.append(chip);
    }
    this.#chips.insertBefore(fragment, this.#inputItem);
    this.#input.placeholder = this.#values.length ? '' : this.#placeholderText();
    this.#chip = -1;
    this.#root.classList.toggle('has-value', this.#values.length > 0);
  }

  #syncState() {
    const select = this.element;
    const disabled = select.disabled || select.matches(':disabled');
    const changed = disabled !== this.#disabled;
    this.#disabled = disabled;
    this.#root.classList.toggle('is-disabled', disabled);
    this.#focus.disabled = disabled;
    if (select.required) {
      this.#focus.setAttribute('aria-required', 'true');
    } else {
      this.#focus.removeAttribute('aria-required');
    }
    if (select.classList.contains('is-invalid')) {
      this.#setInvalid(true);
    }
    if (disabled && this.#isOpen) {
      this.close({ restoreFocus: false });
    }
    if (changed && this.multiple) {
      this.#renderChips();
    }
  }

  #setInvalid(invalid) {
    this.#root.classList.toggle('is-invalid', invalid);
    if (invalid) {
      this.#focus.setAttribute('aria-invalid', 'true');
    } else {
      this.#focus.removeAttribute('aria-invalid');
    }
  }

  #queueRefresh() {
    if (this.#refreshQueued) {
      return;
    }
    this.#refreshQueued = true;
    queueMicrotask(() => {
      this.#refreshQueued = false;
      this.refresh();
    });
  }

  // ---------- Remote ----------

  #onRemoteLoading(query, page) {
    this.#list.setAttribute('aria-busy', 'true');
    if (page > 1) {
      this.#view.setTailLoading(true);
      return;
    }
    if (this.#view.rows.length) {
      this.#setLoading(true);
    } else {
      this.#setStatus('loading', query ? this.options.messages.searching : this.options.messages.loading);
    }
    this.#schedulePosition();
  }

  #onRemoteResult(result, query, page) {
    if (!this.#isOpen || query !== this.#query.trim()) {
      return;
    }
    this.#setLoading(false);
    for (const item of result.items) {
      this.#store.remember(item);
    }
    if (page > 1) {
      this.#view.appendRows(this.#visible(result.items));
      this.#view.refreshSelection();
    } else {
      this.#showRows(this.#withCreateRow(this.#visible(result.items)));
    }
    this.#emit('load', { query, page, items: result.items });
    this.#view.checkEnd();
  }

  #onRemoteError(error, query, page) {
    if (!this.#isOpen) {
      return;
    }
    this.#setLoading(false);
    this.#view.setTailLoading(false);
    if (page === 1) {
      this.#view.setRows([]);
      this.#setActive(-1);
      this.#setStatus('error', this.options.messages.error);
    }
    this.#schedulePosition();
    this.#emit('error', { error, query, page });
  }

  #setLoading(loading) {
    this.#popover?.classList.toggle('is-loading', loading);
    this.#list?.setAttribute('aria-busy', String(loading));
  }

  #setStatus(kind, message) {
    const status = this.#status;
    status.textContent = '';
    status.hidden = !kind;
    if (!kind) {
      return;
    }
    if (kind === 'loading') {
      status.append(el('span', 'fs-spinner', { 'aria-hidden': 'true' }));
    }
    status.append(message);
    if (kind === 'error') {
      const retry = el('button', 'fs-retry', { type: 'button', tabindex: '-1' });
      retry.textContent = this.options.messages.retry;
      status.append(retry);
    }
    if (kind !== 'loading') {
      this.#announce(message);
    }
  }

  // ---------- Popover ----------

  #showPopover() {
    try {
      this.#popover.showPopover();
    } catch {
      this.#popover.hidden = false;
    }
  }

  #hidePopover() {
    if (supportsPopover && this.#popover.matches(':popover-open')) {
      this.#popover.hidePopover();
    }
    if (!supportsPopover) {
      this.#popover.hidden = true;
    }
  }

  #schedulePosition() {
    if (!this.#isOpen || this.#frame) {
      return;
    }
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      if (!this.#root.isConnected) {
        this.close({ restoreFocus: false });
      } else {
        this.#position();
      }
    });
  }

  #position() {
    if (this.#isOpen) {
      positionPopover(this.#popover, this.#control, { matchWidth: this.#variant === 'field', rtl: this.#rtl });
    }
  }

  // ---------- Helpers ----------

  #announce(message) {
    this.#live.textContent = '';
    if (message) {
      setTimeout(() => {
        this.#live.textContent = message;
      }, 30);
    }
  }

  #announceCount(count) {
    const messages = this.options.messages;
    clearTimeout(this.#announceTimer);
    this.#announceTimer = setTimeout(() => {
      this.#announce(count === 0 ? messages.noResults : count === 1 ? messages.oneResult : format(messages.results, { count }));
    }, ANNOUNCE_DELAY_MS);
  }

  #emit(name, detail = {}) {
    return this.element.dispatchEvent(new CustomEvent(`flowselect:${name}`, {
      bubbles: true,
      detail: { instance: this, value: this.value, ...detail }
    }));
  }
}
