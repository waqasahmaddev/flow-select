# flow-select

A fast, keyboard-first select for plain HTML forms. No dependencies, no framework.

It enhances a normal `<select>`, so the browser still posts the form: ASP.NET Core, PHP, Django, Rails, Laravel and plain HTML forms keep working unchanged.

> **Status:** early release (0.x). The API may still change before 1.0.

## Features

- **Modes:** single, multiple with chips, search inside the field or inside the list, option groups, descriptions, avatars, meta text and badges, create new options, item limits, clear button.
- **Variants:** `field` (default), `pill` for filter bars, `ghost` for toolbar menus.
- **Remote data:** load from a URL or your own `load()` function, with debounce, request cancelling, caching and paging.
- **Keyboard first:** follows the WAI-ARIA combobox pattern, with typeahead, Home/End/PageUp/PageDown and chip navigation. Tab always moves on.
- **No layout shift:** the stylesheet gives the plain `<select>` the same box as the finished control, and the script enhances selects while the page is parsed.
- **htmx friendly:** the native `change` event fires, swapped-in selects start automatically, and `data-fs-refresh-on` reloads on server events.
- **Light and dark:** neutral grey theme that follows the page's `color-scheme`, Bootstrap's `data-bs-theme`, or a `.dark` root class.
- **Small:** about 11 KB gzipped JavaScript and 3 KB CSS.

**Documentation and live demos: https://waqasahmaddev.github.io/flow-select/**

## Install

From a CDN:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flow-select@0.1.1/dist/flow-select.min.css">
<script src="https://cdn.jsdelivr.net/npm/flow-select@0.1.1/dist/flow-select.min.js"></script>
```

From npm:

```bash
npm install flow-select
```

Or download `flow-select.min.js` and `flow-select.min.css` from the [releases](https://github.com/waqasahmaddev/flow-select/releases) and host them yourself. Load both in `<head>`.

Loading the script in `<head>` without `defer` lets it enhance each select as soon as the browser reads it, before the first paint. With `defer` it still works; the stylesheet keeps the layout stable.

Every `select[data-flow-select]` is enhanced automatically:

```html
<label for="category">Category</label>
<select id="category" name="category" data-flow-select>
  <option value="">Choose a category</option>
  <option value="tech">Tech</option>
  <option value="design">Design</option>
</select>
```

### As a module

```js
import { FlowSelect, autoInit } from './flow-select.esm.js';

autoInit();
const select = new FlowSelect('#people', { url: '/api/people' });
```

## Options

Set options with `data-fs-*` attributes, a JSON object in `data-flow-select`, or the JavaScript options object.

| Attribute | Option | Default | Description |
|---|---|---|---|
| `data-fs-variant` | `variant` | `field` | `field`, `pill` or `ghost` |
| `data-fs-size` | `size` | | `sm` or `lg`. Default is medium |
| `data-fs-search` | `search` | auto | `true`, `false`, `inline` (in the field) or `dropdown` (in the list). Auto turns search on for more than 8 options, multiple, remote and create |
| `data-fs-placeholder` | `placeholder` | | Text when nothing is selected. Defaults to the label of an `<option value="">` |
| `data-fs-search-placeholder` | `searchPlaceholder` | `Search...` | Placeholder of the search box in dropdown mode |
| `data-fs-clearable` | `clearable` | `false` | Shows a clear button when a value is selected |
| `data-fs-hide-selected` | `hideSelected` | `false` | Multiple only: hides chosen options from the list |
| `data-fs-hide-placeholder-option` | `hidePlaceholderOption` | `false` | Does not list the `<option value="">` row |
| `data-fs-check-position` | `checkPosition` | `start` | `start`, `end` or `none` |
| `data-fs-max-items` | `maxItems` | `0` | Multiple only: limit, 0 means no limit |
| `data-fs-create` | `create` | `false` | Lets users add the text they typed. In JavaScript it can be an async function returning an item |
| `data-fs-close-on-select` | `closeOnSelect` | auto | Single closes, multiple stays open |
| `data-fs-url` | `url` | | Remote endpoint. Use `{query}` and `{page}` placeholders or let it add `?q=` and `&page=` |
| | `load` | | `async (query, { page, signal }) => items` |
| `data-fs-query-param` | `queryParam` | `q` | Query parameter name |
| `data-fs-min-query-length` | `minQueryLength` | `0` | Characters required before a remote search |
| `data-fs-debounce` | `debounce` | `250` | Milliseconds to wait after typing |
| `data-fs-cache` | `cache` | `true` | Remembers remote results per query |
| | `fetchOptions` | | Extra `fetch` options, for example headers |
| | `mapItem` | | Maps a server item to `{ value, label, ... }` |
| | `renderOption` | | `(item, { selected }) => Node or HTML string` (trusted) |
| | `renderValue` | | `(item) => Node or HTML string` (trusted) |
| `data-fs-page-size` | `pageSize` | `100` | Rows rendered at a time in long lists |
| `data-fs-max-height` | `maxHeight` | | CSS length for the list |
| `data-fs-refresh-on` | `refreshOn` | | Space separated document events that reload the data |
| `data-fs-class-name` | `className` | | Extra class on the wrapper |

Option attributes: `data-description`, `data-meta`, `data-badge`, `data-avatar` (an image URL or initials), `data-keywords` (extra search words). `<optgroup>` becomes a group header.

Remote items may use `value` or `id`, `label`, `text`, `name` or `title`, plus `description`, `meta`, `badge`, `avatar`, `group` and `disabled`. Return an array, or `{ items, hasMore }` for paging.

`data-flow-select="manual"` keeps the pre-style but skips auto start, for selects you configure in JavaScript.

## API

```js
const select = FlowSelect.get('#tags');

select.value;                 // 'tech' or ['css', 'html'] for multiple
select.value = 'design';
select.setValue(['css'], { silent: true });
select.clear();
select.open();
select.close();
select.toggle();
select.focus();
select.addOption({ value: 'go', label: 'Go' }, { selected: true });
select.removeOption('go');
select.setOptions([{ value: 'a', label: 'A' }]);
select.refresh();             // re-read the native <select>
select.reload();              // clear the remote cache and reload
select.enable();
select.disable();
select.destroy();             // restores the original <select>

FlowSelect.init(container);   // enhance every select[data-flow-select] inside
FlowSelect.destroy(container);
FlowSelect.observe(document.body); // optional: enhance selects added later by any script
FlowSelect.defaults.debounce = 300;
```

## Events

The native `input` and `change` events fire on the `<select>` for every user change. flow-select also dispatches these bubbling events on the `<select>`, with `event.detail.instance` and `event.detail.value`:

`flowselect:init`, `flowselect:open`, `flowselect:close`, `flowselect:change`, `flowselect:search`, `flowselect:load`, `flowselect:error`, `flowselect:create`, `flowselect:destroy`.

## htmx

```html
<form hx-post="/filter" hx-trigger="change" hx-target="#results">
  <select name="status" data-flow-select>...</select>
</form>

<select name="person" data-flow-select data-fs-url="/api/people"
        hx-get="/preview" hx-trigger="flowselect:change" hx-target="#preview"></select>

<select name="people" data-flow-select data-fs-url="/api/people"
        data-fs-refresh-on="people-changed"></select>
```

Selects inside swapped content start automatically and are cleaned up when swapped out. A response header `HX-Trigger: people-changed` reloads the last select above.

## Keyboard

| Key | Closed | Open |
|---|---|---|
| Down, Up | Opens | Moves the highlight |
| Enter, Space | Opens | Selects (Space types while searching) |
| Home, End | Opens on the first or last option | First or last option |
| Page Up, Page Down | | Moves ten options |
| Alt + Up | | Selects and closes |
| Letters | Selects the next match, or starts a search | Filters, or jumps to the match |
| Escape | Nothing, so a dialog can close | Closes without changes |
| Tab | Next field | Closes and moves to the next field |
| Backspace, Delete | Clears when clearable, removes the last chip | Removes the last chip |
| Left, Right | Multiple: walks the chips | Same |

## Theming

The theme is neutral grey. Light and dark follow the element's `color-scheme`, so these all work:

- Bootstrap 5.3: `data-bs-theme="dark"`
- A `.dark` class on `<html>`, or `data-theme="dark"`
- `data-fs-theme="dark"`, `"light"` or `"auto"` (follows the operating system)
- `color-scheme: dark` in your own CSS

Override any custom property, globally or on one select:

```css
.fs, .fs-popover {
  --fs-accent: #0d6efd;
  --fs-radius: 6px;
  --fs-height: 2.375rem;
  --fs-chip-bg: #e7f1ff;
}
```

## Browser support

Chrome and Edge 123+, Firefox 125+, Safari 17.5+.

## Development

```bash
npm install
npm run build
npm run serve
npm test
```

`npm run serve` starts the demo at http://localhost:5180/demo/ with mock endpoints for remote data and htmx.

## License

MIT

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
