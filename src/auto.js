import { FlowSelect, autoInit } from './index.js';

window.FlowSelect = FlowSelect;

if (!document.currentScript?.hasAttribute('data-manual')) {
  autoInit();
}
