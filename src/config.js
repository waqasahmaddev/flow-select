export const defaults = {
  variant: 'field',
  size: '',
  search: null,
  searchThreshold: 8,
  placeholder: '',
  searchPlaceholder: 'Search...',
  clearable: false,
  hideSelected: false,
  hidePlaceholderOption: false,
  checkPosition: 'start',
  closeOnSelect: null,
  maxItems: 0,
  create: false,
  url: '',
  load: null,
  queryParam: 'q',
  minQueryLength: 0,
  debounce: 250,
  cache: true,
  fetchOptions: null,
  mapItem: null,
  renderOption: null,
  renderValue: null,
  pageSize: 100,
  maxHeight: '',
  refreshOn: '',
  className: '',
  messages: {
    noResults: 'No results',
    noResultsFor: 'No results for “{query}”',
    loading: 'Loading...',
    searching: 'Searching...',
    error: 'Could not load results.',
    retry: 'Try again',
    create: 'Create “{query}”',
    typeMore: 'Type at least {count} characters',
    maxItems: 'You can choose up to {count}',
    results: '{count} results',
    oneResult: '1 result',
    clear: 'Clear selection',
    remove: 'Remove {label}'
  }
};

function parseValue(raw, fallback) {
  if (typeof fallback === 'number') {
    const number = Number(raw);
    return raw.trim() === '' || Number.isNaN(number) ? fallback : number;
  }
  if (typeof fallback === 'string') {
    return raw;
  }
  if (raw === '' || raw === 'true') {
    return true;
  }
  return raw === 'false' ? false : raw;
}

export function readDataset(element) {
  const result = {};
  const data = element.dataset;
  for (const key in data) {
    if (key.length < 3 || !key.startsWith('fs')) {
      continue;
    }
    const name = key[2].toLowerCase() + key.slice(3);
    if (name in defaults && name !== 'messages') {
      result[name] = parseValue(data[key], defaults[name]);
    }
  }
  const json = data.flowSelect;
  if (json && json.trim().startsWith('{')) {
    try {
      Object.assign(result, JSON.parse(json));
    } catch (error) {
      console.warn('FlowSelect: data-flow-select is not valid JSON.', error);
    }
  }
  return result;
}

export function mergeOptions(...sources) {
  const result = {};
  const messages = {};
  for (const source of sources) {
    if (source) {
      Object.assign(result, source);
      Object.assign(messages, source.messages);
    }
  }
  result.messages = messages;
  return result;
}

export function format(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}
