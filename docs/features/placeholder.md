# Placeholder and clearing

## Placeholder

An `<option value="">` is the placeholder. Its label shows when nothing is chosen, and the form posts an empty value, just like a native select.

<Demo>
  <div class="field">
    <label for="p-cat">Category</label>
    <select id="p-cat" name="category" data-flow-select>
      <option value="">Choose a category</option>
      <option>Tech</option>
      <option>Science</option>
    </select>
  </div>
</Demo>

```html
<select name="category" data-flow-select>
  <option value="">Choose a category</option>
  <option>Tech</option>
</select>
```

The placeholder row is listed too, with a check mark while nothing is chosen, so users can go back to "nothing". That suits filters such as "All sources". To leave it out of the list, add `data-fs-hide-placeholder-option`. A placeholder option that is `disabled` or `hidden` is never listed:

```html
<option value="" disabled hidden>Choose a category</option>
```

You can also set the text without an option: `data-fs-placeholder="Choose..."`. For multiple selects this is the text in the empty input.

## Clear button

`data-fs-clearable` shows a clear button once a value is chosen. It replaces the chevron, so the control does not grow.

<Demo inline>
  <select aria-label="Workspace" data-flow-select data-fs-variant="pill" data-fs-clearable>
    <option value="">All workspaces</option>
    <option selected>Main workspace</option>
    <option>Side projects</option>
  </select>
  <div class="field" style="flex: 1 1 260px">
    <select aria-label="Category" data-flow-select data-fs-clearable>
      <option value="">Choose a category</option>
      <option selected>Tech</option>
      <option>Science</option>
    </select>
  </div>
</Demo>

```html
<select data-flow-select data-fs-clearable>...</select>
```

Keyboard users press <kbd>Backspace</kbd> or <kbd>Delete</kbd> on the closed control to clear it. The button itself is skipped by <kbd>Tab</kbd>, so a form keeps one tab stop per field.

Clearing selects the placeholder option when there is one, otherwise nothing.

## From code

```js
FlowSelect.get('#category').clear();
FlowSelect.get('#category').clear({ silent: true }); // no change event
```
