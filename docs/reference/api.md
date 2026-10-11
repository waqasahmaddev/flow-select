# Methods and properties

## Getting an instance

```js
const select = FlowSelect.get('#tags');        // or pass the <select> element
const created = new FlowSelect('#tags', options);
```

`FlowSelect.get` returns `null` when the select has no instance. `new FlowSelect` on a select that already has one returns the existing instance.

## Properties

| Property | Type | Description |
|---|---|---|
| `value` | `string` or `string[]` | The chosen value. Multiple selects return an array. Assigning calls `setValue` |
| `selectedItems` | `object[]` | The chosen items with label, meta and the other fields |
| `isOpen` | `boolean` | Whether the list is open |
| `disabled` | `boolean` | Whether the control is disabled |
| `multiple` | `boolean` | Whether the select is `multiple` |
| `element` | `HTMLSelectElement` | The native select |
| `options` | `object` | The resolved options |

## Methods

### setValue(value, { silent })

Chooses a value. Accepts a string, an array of strings, or item objects. Values that are not in the list are ignored, except for remote selects or item objects, which are added. Fires `input`, `change` and `flowselect:change` unless `silent` is `true` or nothing changed.

```js
select.setValue('design');
select.setValue(['css', 'html']);
select.setValue({ value: 'p9', label: 'Ava Novak' });
select.setValue('draft', { silent: true });
```

### clear({ silent })

Removes the choice. Single selects go back to the placeholder option when there is one.

### open({ focusSearch }), close({ restoreFocus }), toggle()

Open or close the list. `open({ focusSearch: false })` keeps focus where it is. `close({ restoreFocus: false })` does not move focus back to the control.

### focus()

Moves keyboard focus to the control.

### addOption(item, { selected })

Adds an `<option>` to the native select and the list. Returns the item.

```js
select.addOption({ value: 'go', label: 'Go', description: 'A language from Google' }, { selected: true });
```

### removeOption(value)

Removes every `<option>` with that value. If it was chosen, the choice is removed too.

### setOptions(items, { keepSelection })

Replaces all options except the placeholder. Keeps the current choice when it is still present (`keepSelection` is `true` by default). Fires `change` only if the choice actually changed.

### refresh()

Reads the native select again. Call it after changing the select directly, for example `select.element.value = 'x'`. Changes to the options themselves are picked up automatically. Returns `true` if the value changed.

### reload()

Remote selects clear their cache and reload when open. Local selects call `refresh()`.

### enable(), disable()

Set the native `disabled` attribute and update the control. Changing the attribute or a surrounding `<fieldset disabled>` works too.

### destroy()

Removes the control and puts the original `<select>` back exactly where and how it was. Safe to call twice.

## Static members

| Member | Description |
|---|---|
| `FlowSelect.get(target)` | The instance of a select, or `null` |
| `FlowSelect.init(root, options)` | Enhances every matching select inside `root` (or `root` itself if it is a select). Returns the instances |
| `FlowSelect.destroy(root)` | Destroys every instance inside `root` |
| `FlowSelect.observe(root)` | Watches `root` and enhances selects added later. Returns a function that stops watching |
| `FlowSelect.autoInit(options)` | Starts automatic enhancement. See [JavaScript and modules](/integrations/javascript) |
| `FlowSelect.use(plugin, options)` | Runs a plugin once. See [Extending](/customization/extending) |
| `FlowSelect.defaults` | Default options for new instances |
| `FlowSelect.selector` | The CSS selector used to find selects |
| `FlowSelect.version` | The library version |
