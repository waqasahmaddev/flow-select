const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function createItem(source) {
  if (source === null || source === undefined) {
    return null;
  }
  if (typeof source !== 'object') {
    return { value: String(source), label: String(source), description: '', meta: '', badge: '', avatar: '', keywords: '', group: '', disabled: false, data: source };
  }
  const value = source.value ?? source.id ?? source.key;
  if (value === null || value === undefined) {
    return null;
  }
  return {
    value: String(value),
    label: text(source.label ?? source.text ?? source.name ?? source.title ?? value),
    description: text(source.description),
    meta: text(source.meta ?? source.subtitle),
    badge: text(source.badge),
    avatar: text(source.avatar ?? source.image),
    keywords: text(source.keywords),
    group: text(source.group),
    disabled: Boolean(source.disabled),
    data: source
  };
}

export function itemFromOption(option) {
  const data = option.dataset;
  const parent = option.parentElement;
  const inGroup = parent !== null && parent.tagName === 'OPTGROUP';
  return {
    value: option.value,
    label: option.label || option.textContent.trim(),
    description: data.description || '',
    meta: data.meta || '',
    badge: data.badge || '',
    avatar: data.avatar || '',
    keywords: data.keywords || '',
    group: inGroup ? parent.label : '',
    disabled: option.disabled || (inGroup && parent.disabled),
    data
  };
}

function searchTextOf(item) {
  if (item.searchText === undefined) {
    item.searchText = normalizeText(`${item.label} ${item.meta} ${item.keywords} ${item.description}`);
  }
  return item.searchText;
}

function labelTextOf(item) {
  if (item.labelText === undefined) {
    item.labelText = normalizeText(item.label);
  }
  return item.labelText;
}

export class OptionStore {
  constructor() {
    this.items = [];
    this.known = new Map();
    this.hasGroups = false;
  }

  replace(items, keepValues = []) {
    const kept = keepValues.map((value) => this.known.get(value)).filter(Boolean);
    this.items = items;
    this.known = new Map();
    for (const item of kept) {
      this.known.set(item.value, item);
    }
    this.hasGroups = false;
    for (const item of items) {
      this.known.set(item.value, item);
      if (item.group) {
        this.hasGroups = true;
      }
    }
  }

  add(item) {
    this.items.push(item);
    this.known.set(item.value, item);
  }

  remember(item) {
    if (item && !item.create && !item.placeholder) {
      this.known.set(item.value, item);
    }
  }

  get(value) {
    return this.known.get(value);
  }

  findByLabel(label) {
    const needle = normalizeText(label).trim();
    return this.items.find((item) => !item.placeholder && labelTextOf(item) === needle);
  }

  filter(query) {
    const needle = normalizeText(query).trim();
    if (!needle) {
      return this.items;
    }
    const terms = needle.split(/\s+/);
    const startsWith = [];
    const contains = [];
    for (const item of this.items) {
      if (item.placeholder) {
        continue;
      }
      const haystack = searchTextOf(item);
      if (!terms.every((term) => haystack.includes(term))) {
        continue;
      }
      if (!this.hasGroups && labelTextOf(item).startsWith(needle)) {
        startsWith.push(item);
      } else {
        contains.push(item);
      }
    }
    return startsWith.length ? startsWith.concat(contains) : contains;
  }
}
