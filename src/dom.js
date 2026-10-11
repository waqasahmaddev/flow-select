const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevrons: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4-4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>'
};

const iconTemplates = new Map();
const IMAGE_SOURCE = /^(https?:|data:|blob:|\/|\.\/|\.\.\/)/i;

let sequence = 0;

export function nextId(prefix = 'fs') {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function el(tag, className, attributes) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (attributes) {
    for (const name in attributes) {
      const value = attributes[name];
      if (value === false || value === null || value === undefined) {
        continue;
      }
      node.setAttribute(name, value === true ? '' : String(value));
    }
  }
  return node;
}

export function icon(name, className = '') {
  let template = iconTemplates.get(name);
  if (!template) {
    template = document.createElementNS(SVG_NS, 'svg');
    template.setAttribute('viewBox', '0 0 24 24');
    template.setAttribute('aria-hidden', 'true');
    template.setAttribute('focusable', 'false');
    template.innerHTML = ICON_PATHS[name];
    iconTemplates.set(name, template);
  }
  const node = template.cloneNode(true);
  node.setAttribute('class', className ? `fs-icon ${className}` : 'fs-icon');
  return node;
}

export function avatar(item) {
  const node = el('span', 'fs-avatar', { 'aria-hidden': 'true' });
  const source = String(item.avatar);
  if (IMAGE_SOURCE.test(source)) {
    node.append(el('img', '', { src: source, alt: '', loading: 'lazy', decoding: 'async' }));
  } else {
    node.textContent = Array.from(source).slice(0, 2).join('');
  }
  return node;
}

const LAYOUT_CLASS = /^(?:[\w-]+:)*-?(?:w|min-w|max-w|m[trblxyse]?|col|flex|grow|shrink|basis|order|self|d)(?:-|$)/;
const LAYOUT_STYLES = ['width', 'min-width', 'max-width', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block'];

export function copyLayout(select, root) {
  for (const name of select.classList) {
    if (LAYOUT_CLASS.test(name)) {
      root.classList.add(name);
    }
  }
  for (const property of LAYOUT_STYLES) {
    const value = select.style.getPropertyValue(property);
    if (value) {
      root.style.setProperty(property, value);
    }
  }
  for (const property of select.style) {
    if (property.startsWith('--fs-')) {
      root.style.setProperty(property, select.style.getPropertyValue(property));
    }
  }
  if (select.dataset.fsTheme) {
    root.dataset.fsTheme = select.dataset.fsTheme;
  }
}

export function appendContent(target, content) {
  if (content instanceof Node) {
    target.append(content);
  } else if (content !== null && content !== undefined && content !== false) {
    target.insertAdjacentHTML('beforeend', String(content));
  }
}
