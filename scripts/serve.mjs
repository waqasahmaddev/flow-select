import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT) || 5180;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

const FIRST = ['Maya', 'Leo', 'Jonas', 'Ava', 'Noah', 'Iris', 'Elias', 'Nora', 'Theo', 'Lena', 'Omar', 'Sofia', 'Hugo', 'Clara', 'Felix', 'Zoe', 'Ivan', 'Mila', 'Ruben', 'Elena'];
const LAST = ['Patel', 'Martin', 'Berg', 'Novak', 'Silva', 'Dubois', 'Kim', 'Rossi', 'Larsen', 'Moreau', 'Weber', 'Costa', 'Fischer'];
const ROLES = ['Admin', 'Editor', 'Author', 'Viewer'];
const PEOPLE = [];
for (let index = 0; index < FIRST.length * LAST.length; index += 1) {
  const first = FIRST[index % FIRST.length];
  const last = LAST[Math.floor(index / FIRST.length) % LAST.length];
  PEOPLE.push({
    value: `p${index + 1}`,
    label: `${first} ${last}`,
    meta: `${first}.${last}@example.com`.toLowerCase(),
    badge: ROLES[index % ROLES.length],
    avatar: `${first[0]}${last[0]}`
  });
}
const TAGS = ['JavaScript', 'TypeScript', 'CSS', 'HTML', 'Accessibility', 'Performance', 'Design', 'Testing', 'Security', 'DevOps', 'Databases', 'Mobile', 'Web Components', 'WebAssembly', 'Rust', 'Go', 'Python', 'Java', 'Jamstack', 'Cloud'];
const PAGE_SIZE = 20;
const flakyCounts = new Map();

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function matches(text, query) {
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function html(res, body, headers = {}) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function people(url) {
  const query = url.searchParams.get('q') ?? '';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const found = PEOPLE.filter((person) => matches(`${person.label} ${person.meta}`, query));
  const items = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { items, hasMore: page * PAGE_SIZE < found.length, total: found.length };
}

const routes = {
  'GET /api/people': async (req, res, url) => {
    await sleep(Number(url.searchParams.get('delay') ?? 250));
    json(res, 200, people(url));
  },
  'GET /api/slow': async (req, res, url) => {
    await sleep(Number(url.searchParams.get('delay') ?? 1500));
    json(res, 200, people(url));
  },
  'GET /api/fail': async (req, res) => {
    await sleep(300);
    json(res, 500, { error: 'Server error' });
  },
  'GET /api/flaky': async (req, res, url) => {
    const key = url.searchParams.get('q') ?? '';
    const count = (flakyCounts.get(key) ?? 0) + 1;
    flakyCounts.set(key, count);
    await sleep(300);
    if (count % 2 === 1) {
      json(res, 503, { error: 'Try again' });
    } else {
      json(res, 200, people(url));
    }
  },
  'GET /api/tags': async (req, res, url) => {
    await sleep(Number(url.searchParams.get('delay') ?? 150));
    const query = url.searchParams.get('q') ?? '';
    json(res, 200, TAGS.filter((tag) => matches(tag, query)).map((tag) => ({ value: tag.toLowerCase().replace(/\s+/g, '-'), label: tag })));
  },
  'POST /api/echo': async (req, res) => {
    const form = new URLSearchParams(await readBody(req));
    const rows = [];
    for (const key of new Set(form.keys())) {
      rows.push(`<li><strong>${escapeHtml(key)}</strong>: ${form.getAll(key).map(escapeHtml).join(', ') || '<em>(empty)</em>'}</li>`);
    }
    html(res, `<ul class="echo" data-testid="echo">${rows.join('') || '<li><em>No fields</em></li>'}</ul>`);
  },
  'GET /api/echo': async (req, res, url) => {
    const rows = [];
    for (const key of new Set(url.searchParams.keys())) {
      rows.push(`<li><strong>${escapeHtml(key)}</strong>: ${url.searchParams.getAll(key).map(escapeHtml).join(', ')}</li>`);
    }
    html(res, `<ul class="echo" data-testid="echo">${rows.join('') || '<li><em>No fields</em></li>'}</ul>`);
  },
  'GET /api/fragment': async (req, res) => {
    const id = `swapped-${Date.now()}`;
    html(res, `
      <label for="${id}" class="field-label">Swapped in by htmx</label>
      <select id="${id}" name="swapped" data-flow-select data-fs-search="true">
        <option value="">Pick a fruit</option>
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
        <option value="cherry">Cherry</option>
        <option value="mango">Mango</option>
      </select>`);
  },
  'GET /api/options': async (req, res) => {
    const stamp = new Date().toLocaleTimeString();
    html(res, `
      <option value="">Choose a plan</option>
      <option value="free">Free (${stamp})</option>
      <option value="team">Team (${stamp})</option>
      <option value="business">Business (${stamp})</option>`);
  },
  'POST /api/notify': async (req, res) => {
    html(res, '<span>Server sent the <code>people-changed</code> event.</span>', { 'HX-Trigger': 'people-changed' });
  }
};

async function resolveFile(urlPath) {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  if (!path.startsWith(root)) {
    return null;
  }
  const info = await stat(path).catch(() => null);
  if (info?.isDirectory()) {
    return join(path, 'index.html');
  }
  return info ? path : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) {
    try {
      await route(req, res, url);
    } catch (error) {
      json(res, 500, { error: String(error) });
    }
    return;
  }
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/demo/' });
    res.end();
    return;
  }
  const file = await resolveFile(url.pathname);
  const body = file ? await readFile(file).catch(() => null) : null;
  if (!body) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}).listen(port, () => {
  console.log(`flow-select demo: http://localhost:${port}/demo/`);
});
