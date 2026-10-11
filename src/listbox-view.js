import { el, icon, avatar, appendContent } from './dom.js';

const NEAR_END_PX = 160;
const SCROLL_PADDING_PX = 4;

export class ListboxView {
  constructor(list, { idPrefix, pageSize, renderOption, isSelected, onNearEnd }) {
    this.list = list;
    this.idPrefix = idPrefix;
    this.pageSize = Math.max(20, Number(pageSize) || 100);
    this.renderOption = renderOption;
    this.isSelected = isSelected;
    this.onNearEnd = onNearEnd;
    this.rows = [];
    this.nodes = [];
    this.rendered = 0;
    this.lastGroup = '';
    this.activeIndex = -1;
    this.tail = null;
    list.addEventListener('scroll', () => this.checkEnd(), { passive: true });
    list.addEventListener('mouseover', (event) => this.titleWhenClipped(event.target));
  }

  setRows(rows) {
    this.rows = rows;
    this.nodes = new Array(rows.length);
    this.rendered = 0;
    this.lastGroup = '';
    this.activeIndex = -1;
    this.tail = null;
    this.list.textContent = '';
    this.list.scrollTop = 0;
    this.list.classList.toggle('is-large', rows.length > 500);
    this.renderUntil(Math.min(rows.length, this.pageSize));
  }

  appendRows(rows) {
    this.setTailLoading(false);
    if (!rows.length) {
      return;
    }
    const wasComplete = this.rendered === this.rows.length;
    this.rows = this.rows.concat(rows);
    this.nodes.length = this.rows.length;
    if (wasComplete) {
      this.renderUntil(Math.min(this.rows.length, this.rendered + this.pageSize));
    }
  }

  ensureRendered(index) {
    if (index >= this.rendered) {
      this.renderUntil(Math.min(this.rows.length, Math.max(index + 1, this.rendered + this.pageSize)));
    }
  }

  checkEnd() {
    const list = this.list;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - NEAR_END_PX) {
      return;
    }
    if (this.rendered < this.rows.length) {
      this.renderUntil(Math.min(this.rows.length, this.rendered + this.pageSize));
    } else if (this.onNearEnd) {
      this.onNearEnd();
    }
  }

  setActive(index, scroll) {
    const previous = this.nodes[this.activeIndex];
    if (previous) {
      previous.classList.remove('is-active');
    }
    this.activeIndex = index;
    if (index < 0 || index >= this.rows.length) {
      this.activeIndex = -1;
      return null;
    }
    this.ensureRendered(index);
    const node = this.nodes[index];
    node.classList.add('is-active');
    if (scroll) {
      this.reveal(node);
    }
    return node;
  }

  refreshSelection() {
    for (let index = 0; index < this.rendered; index += 1) {
      const item = this.rows[index];
      this.nodes[index].setAttribute('aria-selected', String(!item.create && this.isSelected(item)));
    }
  }

  setTailLoading(loading) {
    if (loading && !this.tail) {
      this.tail = el('li', 'fs-status fs-status--tail', { role: 'presentation' });
      this.tail.append(el('span', 'fs-spinner', { 'aria-hidden': 'true' }));
      this.list.append(this.tail);
    } else if (!loading && this.tail) {
      this.tail.remove();
      this.tail = null;
    }
  }

  renderUntil(end) {
    if (end <= this.rendered) {
      return;
    }
    const fragment = document.createDocumentFragment();
    for (let index = this.rendered; index < end; index += 1) {
      const item = this.rows[index];
      const group = item.group || '';
      if (group !== this.lastGroup) {
        if (group) {
          fragment.append(this.createGroup(group));
        }
        this.lastGroup = group;
      }
      const node = this.createRow(item, index);
      this.nodes[index] = node;
      fragment.append(node);
    }
    if (this.tail) {
      this.list.insertBefore(fragment, this.tail);
    } else {
      this.list.append(fragment);
    }
    this.rendered = end;
  }

  titleWhenClipped(target) {
    const row = target.closest?.('.fs-option');
    if (!row || row.dataset.titled) {
      return;
    }
    row.dataset.titled = '1';
    const parts = [...row.querySelectorAll('.fs-label, .fs-meta-text, .fs-badge')];
    if (parts.some((part) => part.scrollWidth > part.clientWidth)) {
      row.title = parts.map((part) => part.textContent).join(' · ');
    }
  }

  createGroup(label) {
    const node = el('li', 'fs-group', { role: 'presentation' });
    node.textContent = label;
    return node;
  }

  createRow(item, index) {
    const node = document.createElement('li');
    node.className = item.create ? 'fs-option fs-create' : 'fs-option';
    node.id = `${this.idPrefix}-${index}`;
    node.setAttribute('role', 'option');
    node.dataset.index = String(index);
    const selected = !item.create && this.isSelected(item);
    node.setAttribute('aria-selected', String(selected));
    if (item.disabled) {
      node.setAttribute('aria-disabled', 'true');
    }
    node.append(icon(item.create ? 'plus' : 'check', 'fs-check'));
    const custom = this.renderOption && !item.create ? this.renderOption(item, { selected }) : null;
    if (custom !== null && custom !== undefined) {
      appendContent(node, custom);
      return node;
    }
    const label = el('span', 'fs-label');
    label.textContent = item.label;
    if (!item.avatar && !item.meta && !item.badge && !item.description) {
      node.append(label);
      return node;
    }
    if (item.avatar) {
      node.append(avatar(item));
    }
    const body = el('span', 'fs-text');
    body.append(label);
    if (item.meta || item.badge) {
      const meta = el('span', 'fs-meta');
      if (item.meta) {
        const metaText = el('span', 'fs-meta-text');
        metaText.textContent = item.meta;
        meta.append(metaText);
      }
      if (item.badge) {
        const badge = el('span', 'fs-badge');
        badge.textContent = item.badge;
        meta.append(badge);
      }
      body.append(meta);
    }
    if (item.description) {
      const description = el('span', 'fs-description');
      description.textContent = item.description;
      body.append(description);
      node.classList.add('has-description');
    }
    node.append(body);
    return node;
  }

  reveal(node) {
    const list = this.list;
    const previous = node.previousElementSibling;
    const top = previous && previous.classList.contains('fs-group') ? previous.offsetTop : node.offsetTop;
    const bottom = node.offsetTop + node.offsetHeight;
    if (top < list.scrollTop) {
      list.scrollTop = Math.max(0, top - SCROLL_PADDING_PX);
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight + SCROLL_PADDING_PX;
    }
  }
}
