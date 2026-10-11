import { FlowSelect } from './flow-select.js';

let started = false;

function isParsed(node) {
  for (let current = node; current; current = current.parentNode) {
    if (current.nextSibling) {
      return true;
    }
  }
  return false;
}

function enhanceWhileParsing() {
  const pending = new Set();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) {
          continue;
        }
        if (node.matches(FlowSelect.selector)) {
          pending.add(node);
        } else if (node.firstElementChild) {
          node.querySelectorAll(FlowSelect.selector).forEach((select) => pending.add(select));
        }
      }
    }
    for (const select of pending) {
      if (isParsed(select)) {
        pending.delete(select);
        FlowSelect.init(select);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function autoInit({ root = document, htmx = true, observe = false } = {}) {
  if (started) {
    return;
  }
  started = true;
  if (document.readyState === 'loading') {
    const stop = enhanceWhileParsing();
    document.addEventListener('DOMContentLoaded', () => {
      stop();
      FlowSelect.init(root);
    }, { once: true });
  } else {
    FlowSelect.init(root);
  }
  if (htmx) {
    document.addEventListener('htmx:load', (event) => {
      FlowSelect.init(event.detail?.elt ?? event.target);
    });
    document.addEventListener('htmx:beforeCleanupElement', (event) => {
      const element = event.detail?.elt ?? event.target;
      if (element instanceof HTMLSelectElement) {
        FlowSelect.get(element)?.destroy({ restore: false });
      }
    });
  }
  if (observe) {
    FlowSelect.observe(document.documentElement);
  }
}

FlowSelect.autoInit = autoInit;

export { FlowSelect };
export default FlowSelect;
