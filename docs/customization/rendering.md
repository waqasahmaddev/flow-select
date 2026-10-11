# Custom rendering

For most needs, [rich options](/features/rich-options) (descriptions, avatars, meta text, badges) are enough. When you need full control, pass render functions.

<Demo setup="customRender">
  <div class="field">
    <label for="cu-colour">Colour</label>
    <select id="cu-colour" name="colour" data-flow-select="manual">
      <option value="red" data-color="#ef4444">Red</option>
      <option value="green" data-color="#22c55e" selected>Green</option>
      <option value="blue" data-color="#3b82f6">Blue</option>
      <option value="amber" data-color="#f59e0b">Amber</option>
    </select>
  </div>
</Demo>

```js
const escape = (text) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

new FlowSelect('#colour', {
  renderOption: (item, { selected }) =>
    `<span class="swatch" style="background:${escape(item.data.color)}"></span>
     <span class="fs-label">${escape(item.label)}</span>`,
  renderValue: (item) =>
    `<span class="swatch" style="background:${escape(item.data.color)}"></span>
     <span class="fs-value-text">${escape(item.label)}</span>`
});
```

## The functions

| Option | Called with | Replaces |
|---|---|---|
| `renderOption(item, { selected })` | Each row | Everything in the row after the check mark |
| `renderValue(item)` | The chosen item | The content of the closed control (single selects) |

Return a DOM `Node` or an HTML string. Return `null` or `undefined` to use the default rendering for that item.

## The item

| Property | Value |
|---|---|
| `value`, `label` | Strings |
| `description`, `meta`, `badge`, `avatar`, `keywords`, `group` | Strings, empty when not set |
| `disabled` | Boolean |
| `data` | For native options, the option's `dataset` (so `data-color` is `item.data.color`). For remote items, the original server object |

::: danger Escape your data
HTML strings you return are inserted as they are. Escape every value that comes from users or a server, as in the example above, or build DOM nodes with `textContent`. The default rendering always uses `textContent`.
:::
