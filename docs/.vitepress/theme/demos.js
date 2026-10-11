const FIRST = ['Maya', 'Leo', 'Jonas', 'Ava', 'Noah', 'Iris', 'Elias', 'Nora', 'Theo', 'Lena', 'Omar', 'Sofia', 'Hugo', 'Clara', 'Felix', 'Zoe'];
const LAST = ['Patel', 'Martin', 'Berg', 'Novak', 'Silva', 'Dubois', 'Kim', 'Rossi', 'Larsen', 'Moreau'];
const ROLES = ['Admin', 'Editor', 'Author', 'Viewer'];

export const people = [];
for (let index = 0; index < FIRST.length * LAST.length; index += 1) {
  const first = FIRST[index % FIRST.length];
  const last = LAST[Math.floor(index / FIRST.length) % LAST.length];
  people.push({
    value: `p${index + 1}`,
    label: `${first} ${last}`,
    meta: `${first}.${last}@example.com`.toLowerCase(),
    badge: ROLES[index % ROLES.length],
    avatar: `${first[0]}${last[0]}`
  });
}

export const tags = ['JavaScript', 'TypeScript', 'CSS', 'HTML', 'Accessibility', 'Performance', 'Design', 'Testing', 'Security', 'DevOps', 'Databases', 'Mobile', 'Web Components', 'WebAssembly', 'Rust', 'Go', 'Python', 'Java', 'Jamstack', 'Cloud']
  .map((label) => ({ value: label.toLowerCase().replace(/\s+/g, '-'), label }));

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function mockLoad(list, { delay = 350, pageSize = 20, fail = false } = {}) {
  return async (query, { page, signal }) => {
    await wait(delay, signal);
    if (fail) {
      throw new Error('The server is not available.');
    }
    const needle = query.trim().toLowerCase();
    const found = list.filter((item) => `${item.label} ${item.meta ?? ''}`.toLowerCase().includes(needle));
    return { items: found.slice((page - 1) * pageSize, page * pageSize), hasMore: page * pageSize < found.length };
  };
}

function fillTimezones(select) {
  const regions = {
    Europe: ['Amsterdam', 'Berlin', 'Lisbon', 'London', 'Madrid', 'Paris', 'Rome', 'Stockholm', 'Vienna', 'Warsaw'],
    America: ['Bogota', 'Chicago', 'Denver', 'Los Angeles', 'Mexico City', 'New York', 'Sao Paulo', 'Toronto'],
    Asia: ['Dubai', 'Jakarta', 'Karachi', 'Seoul', 'Singapore', 'Tokyo'],
    Africa: ['Cairo', 'Lagos', 'Nairobi']
  };
  for (const [region, cities] of Object.entries(regions)) {
    const group = document.createElement('optgroup');
    group.label = region;
    for (const city of cities) {
      group.append(new Option(city, `${region}/${city.replace(/ /g, '_')}`, false, city === 'Berlin'));
    }
    select.append(group);
  }
}

export const setups = {
  timezones(host) {
    fillTimezones(host.querySelector('select'));
  },
  huge(host) {
    const select = host.querySelector('select');
    const fragment = document.createDocumentFragment();
    for (let index = 1; index <= 10000; index += 1) {
      fragment.append(new Option(`Item ${index}`, String(index)));
    }
    select.append(fragment);
  },
  remotePeople(host, FlowSelect) {
    new FlowSelect(host.querySelector('select'), { load: mockLoad(people) });
  },
  remoteReviewers(host, FlowSelect) {
    new FlowSelect(host.querySelector('select'), { load: mockLoad(people) });
  },
  remoteMinimum(host, FlowSelect) {
    new FlowSelect(host.querySelector('select'), { load: mockLoad(people), minQueryLength: 2 });
  },
  remoteSlow(host, FlowSelect) {
    new FlowSelect(host.querySelector('select'), { load: mockLoad(people, { delay: 1500 }) });
  },
  remoteError(host, FlowSelect) {
    new FlowSelect(host.querySelector('select'), { load: mockLoad(people, { fail: true }) });
  },
  remoteTagsCreate(host, FlowSelect) {
    new FlowSelect(host.querySelector('select'), {
      load: mockLoad(tags, { delay: 200 }),
      create: async (label) => ({ value: label.toLowerCase().replace(/\s+/g, '-'), label })
    });
  },
  customRender(host, FlowSelect) {
    const escape = (text) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
    new FlowSelect(host.querySelector('select'), {
      renderOption: (item) => `<span class="swatch" style="background:${escape(item.data.color ?? '#999')}"></span><span class="fs-label">${escape(item.label)}</span>`,
      renderValue: (item) => `<span class="swatch" style="background:${escape(item.data.color ?? '#999')}"></span><span class="fs-value-text">${escape(item.label)}</span>`
    });
  },
  messages(host, FlowSelect) {
    new FlowSelect(host.querySelector('select'), {
      searchPlaceholder: 'Suchen...',
      messages: {
        noResultsFor: 'Keine Treffer für „{query}“',
        create: '„{query}“ anlegen'
      },
      create: true
    });
  }
};
