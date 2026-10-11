# Extending flow-select

flow-select is built to be extended without forking. Use the smallest tool that does the job.

| You want to | Use |
|---|---|
| Change how rows or the value look | [`renderOption` and `renderValue`](/customization/rendering) |
| Change colours, sizes, spacing | [CSS custom properties](/customization/theming) |
| Change text and translations | [`messages`](/customization/messages) |
| Adapt a server response | `mapItem` or `load` |
| React to what the user does | [Events](/reference/events) |
| Add behaviour to every select | A plugin with `FlowSelect.use` |
| Add your own methods | A subclass |

## Plugins

A plugin is a function that receives the `FlowSelect` class. It runs once, however many times you call `use`. Add static helpers, change defaults, and attach behaviour with the `flowselect:init` event, which fires for every instance, including ones that start later.

```js
function autoSubmit(FlowSelect, options = {}) {
  document.addEventListener('flowselect:change', (event) => {
    const { instance } = event.detail;
    if (instance.element.hasAttribute('data-auto-submit')) {
      instance.element.form?.requestSubmit();
    }
  });

  FlowSelect.defaults.clearable = options.clearable ?? false;
}

FlowSelect.use(autoSubmit, { clearable: true });
```

```html
<form method="get">
  <select name="status" data-flow-select data-auto-submit>...</select>
</form>
```

Register plugins before selects start. With the script build, put the script with `data-manual`, call `FlowSelect.use(...)`, then `FlowSelect.autoInit()`. See [JavaScript and modules](/integrations/javascript).

### Per-instance behaviour

```js
FlowSelect.use((FlowSelect) => {
  document.addEventListener('flowselect:init', (event) => {
    const { instance } = event.detail;
    if (instance.multiple) {
      instance.element.closest('.field')?.classList.add('has-chips');
    }
  });
});
```

Use `instance.element` for the native select. Everything else about an instance goes through its [public methods](/reference/api); internal state is private and may change between versions.

## Subclassing

The class can be extended to add methods. Create instances of your class yourself and mark the selects `data-flow-select="manual"` so automatic start skips them:

```js
class TagSelect extends FlowSelect {
  addMany(labels) {
    labels.forEach((label) => this.addOption({ value: label.toLowerCase(), label }, { selected: true }));
  }
}

const tags = new TagSelect('#tags', { create: true });
tags.addMany(['Design', 'CSS']);
```

Only the public API is available in a subclass. Overriding public methods works when you call `super`, but flow-select does not call its own public methods internally, so overriding `open()` will not change how a click opens the list. For that, listen to events instead.

## Stable and not stable

- **Stable:** options, data attributes, public methods and properties, events, CSS custom properties, `FlowSelect.use`.
- **Not stable:** class names other than those listed in [Theming](/customization/theming), DOM structure inside the control, anything not documented.

If you need a hook that does not exist, open an issue describing the use case.
