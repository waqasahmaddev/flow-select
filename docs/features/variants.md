# Variants and sizes

## Variants

Pick a look with `data-fs-variant`. All variants share the same list, keyboard behaviour and options.

### Field (default)

Full width, the same height as a text input. Use it in forms.

<Demo>
  <div class="field">
    <label for="v-category">Category</label>
    <select id="v-category" name="category" data-flow-select>
      <option value="">Choose a category</option>
      <option>Tech</option>
      <option>Science</option>
      <option>Design</option>
    </select>
  </div>
</Demo>

```html
<select name="category" data-flow-select>...</select>
```

### Pill

Rounded and as wide as its content. Use it in filter bars above lists and tables.

<Demo inline>
  <select aria-label="Source" data-flow-select data-fs-variant="pill">
    <option value="">All sources</option>
    <option>Website</option>
    <option>Mobile app</option>
    <option>Public API</option>
  </select>
  <select aria-label="Workspace" data-flow-select data-fs-variant="pill" data-fs-clearable>
    <option value="">All workspaces</option>
    <option selected>Main workspace</option>
    <option>Side projects</option>
  </select>
  <select aria-label="Range" data-flow-select data-fs-variant="pill" data-fs-check-position="end">
    <option>Week to date</option>
    <option>Month to date</option>
    <option selected>Last 7 days</option>
    <option>Last 30 days</option>
  </select>
</Demo>

```html
<select name="source" aria-label="Source" data-flow-select data-fs-variant="pill">
  <option value="">All sources</option>
  <option>Website</option>
</select>
```

### Ghost

No border and a soft background. Use it for toolbar menus such as "Group by" or "Sort by".

<Demo inline>
  <select aria-label="Group by" data-flow-select data-fs-variant="ghost">
    <option value="">Group by</option>
    <option>Source</option>
    <option>Project</option>
    <option>User</option>
  </select>
  <select aria-label="Sort by" data-flow-select data-fs-variant="ghost" data-fs-check-position="end">
    <option>Newest first</option>
    <option>Oldest first</option>
    <option>Name A to Z</option>
  </select>
</Demo>

```html
<select name="groupBy" aria-label="Group by" data-flow-select data-fs-variant="ghost">
  <option value="">Group by</option>
  <option>Source</option>
</select>
```

::: tip Pill and ghost without a visible label
Filter controls often have no visible label. Give them an `aria-label` so screen readers can name them.
:::

## Sizes

Add `data-fs-size="sm"` or `data-fs-size="lg"`. Text, height, chips, icons and list rows scale together. Sizes work with every variant.

<Demo>
  <div class="field">
    <label for="s-sm">Small</label>
    <select id="s-sm" data-flow-select data-fs-size="sm"><option>Draft</option><option>Published</option></select>
  </div>
  <div class="field">
    <label for="s-md">Default</label>
    <select id="s-md" data-flow-select><option>Draft</option><option>Published</option></select>
  </div>
  <div class="field">
    <label for="s-lg">Large</label>
    <select id="s-lg" data-flow-select data-fs-size="lg"><option>Draft</option><option>Published</option></select>
  </div>
</Demo>

<Demo inline>
  <select aria-label="Small" data-flow-select data-fs-variant="pill" data-fs-size="sm"><option>Small</option><option>Other</option></select>
  <select aria-label="Default" data-flow-select data-fs-variant="pill"><option>Default</option><option>Other</option></select>
  <select aria-label="Large" data-flow-select data-fs-variant="pill" data-fs-size="lg"><option>Large</option><option>Other</option></select>
</Demo>

```html
<select data-flow-select data-fs-size="sm">...</select>
<select data-flow-select data-fs-size="lg">...</select>
```

For any other size, set `--fs-height` and `font-size` yourself. See [Theming](/customization/theming).

## Check mark position

The selected row shows a check mark at the start. Move it to the end with `data-fs-check-position="end"`, or hide it with `"none"`.

<Demo>
  <div class="field">
    <label for="c-end">Check at the end</label>
    <select id="c-end" data-flow-select data-fs-check-position="end"><option>Week to date</option><option selected>Last 7 days</option><option>Last 30 days</option></select>
  </div>
  <div class="field">
    <label for="c-none">No check mark</label>
    <select id="c-none" data-flow-select data-fs-check-position="none"><option>Week to date</option><option selected>Last 7 days</option><option>Last 30 days</option></select>
  </div>
</Demo>
