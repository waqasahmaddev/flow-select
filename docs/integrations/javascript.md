# JavaScript and modules

## Script tag

`dist/flow-select.min.js` defines `window.FlowSelect` and starts automatically. To start it yourself instead, add `data-manual` to the script tag:

```html
<script src="/lib/flow-select.min.js" data-manual></script>
<script>
  FlowSelect.autoInit();
</script>
```

## ES module

```js
import { FlowSelect, autoInit } from './lib/flow-select.esm.min.js';
import './lib/flow-select.min.css';

autoInit();
```

The module has no side effects until you call `autoInit()` or create an instance.

## Create an instance

```js
const select = new FlowSelect('#people', {
  url: '/api/people',
  clearable: true
});
```

The first argument is a `<select>` element or a CSS selector. Creating an instance for a select that already has one returns the existing instance.

For selects you create in code, mark them with `data-flow-select="manual"`. They get the same early styling, so the page does not jump, but automatic start skips them:

```html
<select id="people" name="people" data-flow-select="manual"></select>
```

## autoInit

```js
autoInit({
  root: document,   // where to look on start
  htmx: true,       // start on htmx:load, clean up on htmx swaps
  observe: false    // also watch the whole document for selects added by any script
});
```

`observe: true` is useful with libraries that add markup without htmx, such as Turbo or Alpine. It uses one `MutationObserver`.

## Content you add yourself

```js
container.innerHTML = html;
FlowSelect.init(container);       // enhance new selects

FlowSelect.destroy(container);    // before removing content
container.remove();
```

## Global defaults

Change defaults before selects start:

```js
FlowSelect.defaults.debounce = 400;
FlowSelect.defaults.searchThreshold = 12;
FlowSelect.defaults.messages = { ...FlowSelect.defaults.messages, noResults: 'Nothing found' };
```

## Frameworks

flow-select works on real DOM elements. In React, Vue or Svelte, create the instance after the select is mounted and call `destroy()` before it unmounts. Let flow-select own the select's options and value from then on, and listen to the `change` event.
