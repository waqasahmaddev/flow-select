# Multiple selection

Add the native `multiple` attribute. Chosen options become chips, and you type in the control to filter.

<Demo log>
  <div class="field">
    <label for="m-tags">Tags</label>
    <select id="m-tags" name="tags" multiple data-flow-select data-fs-placeholder="Add tags...">
      <option value="design" selected>Design</option>
      <option value="javascript" selected>JavaScript</option>
      <option value="java">Java</option>
      <option value="css">CSS</option>
      <option value="html">HTML</option>
      <option value="a11y">Accessibility</option>
    </select>
  </div>
</Demo>

```html
<select name="tags" multiple data-flow-select data-fs-placeholder="Add tags...">
  <option value="design" selected>Design</option>
  <option value="css">CSS</option>
</select>
```

## Behaviour

- Choosing an option keeps the list open, so you can pick several.
- Choosing a chosen option again removes it (the row shows a check mark).
- Your typed text is cleared after each pick.
- Each chip has a remove button.

To close after every pick, set `data-fs-close-on-select="true"`.

## Keyboard

| Key | Action |
|---|---|
| Type | Filters the list |
| <kbd>Enter</kbd> | Adds or removes the highlighted option |
| <kbd>Backspace</kbd> in an empty input | Removes the last chip |
| <kbd>←</kbd> in an empty input | Highlights the last chip; <kbd>←</kbd> <kbd>→</kbd> move between chips |
| <kbd>Backspace</kbd> or <kbd>Delete</kbd> on a highlighted chip | Removes it |

## Limit the number of choices

<Demo>
  <div class="field">
    <label for="m-limit">Pick up to 3</label>
    <select id="m-limit" multiple data-flow-select data-fs-max-items="3" data-fs-placeholder="Pick up to 3">
      <option>Red</option><option>Green</option><option>Blue</option><option>Yellow</option><option>Purple</option>
    </select>
  </div>
</Demo>

```html
<select multiple data-flow-select data-fs-max-items="3">...</select>
```

When the limit is reached, further picks are refused and screen readers hear "You can choose up to 3".

## Hide chosen options

By default chosen options stay in the list with a check mark, so they can be removed from there too. To hide them instead, add `data-fs-hide-selected`. Removing a chip puts the option back.

<Demo>
  <div class="field">
    <label for="m-hide">Skills</label>
    <select id="m-hide" multiple data-flow-select data-fs-hide-selected data-fs-placeholder="Add skills...">
      <option selected>CSS</option><option>HTML</option><option>JavaScript</option><option>Testing</option>
    </select>
  </div>
</Demo>

```html
<select multiple data-flow-select data-fs-hide-selected>...</select>
```

## Without typing

With `data-fs-search="false"` the input is read only: no on-screen keyboard on phones, and letters jump to matches instead of filtering.

## What the form sends

Exactly what a native multiple select sends: one field per chosen option, in the order they were chosen. Nothing is sent when nothing is chosen. For PHP, name the select `tags[]`. See [Forms and servers](/integrations/forms).
