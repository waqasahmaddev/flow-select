import { FlowSelect, autoInit } from './index.js';

window.FlowSelect = FlowSelect;

if (window.flowSelectDefaults && typeof window.flowSelectDefaults === 'object') {
  Object.assign(FlowSelect.defaults, window.flowSelectDefaults);
}

if (!document.currentScript?.hasAttribute('data-manual')) {
  autoInit();
}
