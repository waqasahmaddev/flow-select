const FlowSelect = window.FlowSelect;

const root = document.documentElement;
const toggle = document.getElementById('themeToggle');

function renderThemeLabel() {
  toggle.textContent = root.getAttribute('data-fs-theme') === 'dark' ? 'Light mode' : 'Dark mode';
}

toggle.addEventListener('click', () => {
  const next = root.getAttribute('data-fs-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-fs-theme', next);
  try {
    localStorage.setItem('fs-demo-theme', next);
  } catch (e) {
  }
  renderThemeLabel();
});
renderThemeLabel();

function fillTimezones() {
  const select = document.getElementById('timezone');
  const regions = { Europe: ['Amsterdam', 'Berlin', 'Lisbon', 'London', 'Madrid', 'Paris', 'Rome', 'Stockholm', 'Vienna', 'Warsaw'], America: ['Bogota', 'Chicago', 'Denver', 'Los Angeles', 'Mexico City', 'New York', 'Sao Paulo', 'Toronto'], Asia: ['Dubai', 'Jakarta', 'Karachi', 'Seoul', 'Singapore', 'Tokyo'], Africa: ['Cairo', 'Lagos', 'Nairobi'] };
  for (const [region, cities] of Object.entries(regions)) {
    const group = document.createElement('optgroup');
    group.label = region;
    for (const city of cities) {
      group.append(new Option(city, `${region}/${city.replace(/ /g, '_')}`, false, city === 'Berlin'));
    }
    select.append(group);
  }
}

function fillCountries() {
  const select = document.getElementById('country');
  const names = ['Argentina', 'Australia', 'Austria', 'Belgium', 'Brazil', 'Canada', 'Chile', 'Côte d’Ivoire', 'Denmark', 'Egypt', 'Finland', 'France', 'Germany', 'Greece', 'Iceland', 'India', 'Ireland', 'Italy', 'Japan', 'Kenya', 'México', 'Netherlands', 'New Zealand', 'Norway', 'Peru', 'Poland', 'Portugal', 'South Africa', 'Spain', 'Sweden', 'Switzerland', 'Türkiye', 'United Kingdom', 'United States'];
  for (const name of names) {
    select.append(new Option(name, name.toLowerCase().replace(/[^a-z]+/g, '-')));
  }
}

function fillHuge() {
  const select = document.getElementById('huge');
  const fragment = document.createDocumentFragment();
  for (let index = 1; index <= 10000; index += 1) {
    fragment.append(new Option(`Item ${index}`, String(index)));
  }
  select.append(fragment);
}

fillTimezones();
fillCountries();
fillHuge();

new FlowSelect('#custom-load', {
  load: async (query, { signal }) => {
    const response = await fetch(`/api/tags?q=${encodeURIComponent(query)}`, { signal });
    return response.json();
  },
  create: true
});

document.getElementById('open-dialog').addEventListener('click', () => {
  document.getElementById('demo-dialog').showModal();
});

document.getElementById('plain-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const output = [];
  for (const key of new Set(data.keys())) {
    output.push(`${key}: ${data.getAll(key).join(', ')}`);
  }
  document.getElementById('form-output').textContent = output.join(' | ');
});

const log = document.getElementById('event-log');
const EVENTS = ['init', 'open', 'close', 'change', 'search', 'load', 'error', 'create', 'destroy'];

function addLog(text) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  log.prepend(item);
  while (log.children.length > 40) {
    log.lastElementChild.remove();
  }
}

for (const name of EVENTS) {
  document.addEventListener(`flowselect:${name}`, (event) => {
    if (name === 'init') {
      return;
    }
    const value = Array.isArray(event.detail.value) ? `[${event.detail.value.join(', ')}]` : `"${event.detail.value}"`;
    addLog(`flowselect:${name}  #${event.target.id}  value=${value}${event.detail.query !== undefined ? `  query="${event.detail.query}"` : ''}`);
  });
}

document.addEventListener('change', (event) => {
  if (event.target instanceof HTMLSelectElement) {
    addLog(`change  #${event.target.id}`);
  }
});
