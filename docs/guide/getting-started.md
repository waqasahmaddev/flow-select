# Getting started

## 1. Add the files

### From a CDN

```html
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flow-select@0.1.1/dist/flow-select.min.css">
  <script src="https://cdn.jsdelivr.net/npm/flow-select@0.1.1/dist/flow-select.min.js"></script>
</head>
```

The same files are on unpkg: `https://unpkg.com/flow-select@0.1.1/dist/flow-select.min.js`. Pin the version number so an update never changes your site unexpectedly.

### From npm

```bash
npm install flow-select
```

```js
import { FlowSelect, autoInit } from 'flow-select';
import 'flow-select/css';

autoInit();
```

### Self-hosted

Download `flow-select.min.js` and `flow-select.min.css` from the `dist/` folder of the [GitHub releases](https://github.com/waqasahmaddev/flow-select/releases), put them in your project, and load both in `<head>`:

```html
<head>
  <link rel="stylesheet" href="/lib/flow-select/flow-select.min.css">
  <script src="/lib/flow-select/flow-select.min.js"></script>
</head>
```

::: tip Load the script in the head, without defer
The script is small and does no work until it sees a select. Loaded in `<head>`, it enhances each select as soon as the browser has read it, before the first paint. With `defer` or at the end of `<body>` it still works, and the stylesheet keeps the layout stable.
:::

## 2. Mark your selects

Add `data-flow-select` to any `<select>`:

```html
<label for="status">Status</label>
<select id="status" name="status" data-flow-select>
  <option value="draft">Draft</option>
  <option value="review">In review</option>
  <option value="published" selected>Published</option>
</select>
```

<Demo>
  <div class="field">
    <label for="gs-status">Status</label>
    <select id="gs-status" name="status" data-flow-select>
      <option value="draft">Draft</option>
      <option value="review">In review</option>
      <option value="published" selected>Published</option>
    </select>
  </div>
</Demo>

That is all. Keep your `<label>`, `name`, `required` and `disabled` attributes; flow-select reads them.

## 3. Configure with attributes

Every option has a `data-fs-*` attribute. For example a searchable, clearable select:

```html
<select name="fruit" data-flow-select data-fs-search="true" data-fs-clearable>
  <option value="">Choose a fruit</option>
  <option value="apple">Apple</option>
  <option value="banana">Banana</option>
</select>
```

You can also pass a JSON object, or create the instance in JavaScript:

```html
<select name="fruit" data-flow-select='{"search": true, "clearable": true}'>...</select>
```

```js
const select = new FlowSelect('#fruit', { search: true, clearable: true });
```

See all [options](/reference/options).

## 4. Read and change the value

The native select always holds the value, so reading it works as usual:

```js
document.querySelector('#status').value;           // 'published'
```

To change it from code, use the instance so the control updates too:

```js
FlowSelect.get('#status').setValue('draft');
```

Listen to the normal `change` event:

```js
document.querySelector('#status').addEventListener('change', (event) => {
  console.log(event.target.value);
});
```

## Next steps

- [How it works](/guide/how-it-works)
- [Search modes](/features/search)
- [Forms and servers](/integrations/forms)
- [htmx](/integrations/htmx)
