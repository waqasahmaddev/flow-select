# Theming

The default theme is neutral grey with no brand colour, so it fits most designs. Every colour and size is a CSS custom property.

## Light and dark

flow-select uses the CSS `light-dark()` function, so the mode follows the element's `color-scheme`. The page decides, in any of these ways:

| On the page | Result |
|---|---|
| Nothing | Light, even when the operating system is dark |
| `color-scheme: dark` in your CSS | Dark |
| `data-bs-theme="dark"` (Bootstrap 5.3) | Dark |
| `class="dark"` on `<html>` (Tailwind and others) | Dark |
| `data-theme="dark"` | Dark |
| `data-fs-theme="dark"` or `"light"` | Forced |
| `data-fs-theme="auto"` | Follows the operating system |

The attributes work on `<html>` or on any container, so one panel can be dark inside a light page. Toggle the theme of these docs (top right) to see the demos switch.

<Demo inline>
  <select aria-label="Status" data-flow-select data-fs-variant="pill">
    <option value="">All statuses</option>
    <option>Draft</option>
    <option>Published</option>
  </select>
  <select aria-label="Group by" data-flow-select data-fs-variant="ghost">
    <option value="">Group by</option>
    <option>Author</option>
    <option>Month</option>
  </select>
</Demo>

## Custom properties

Set them on `.fs, .fs-popover, select[data-flow-select]` for every select, or on a container or a single wrapper for some. Include `select[data-flow-select]` so the plain select drawn before the script runs matches.

```css
.fs, .fs-popover, select[data-flow-select] {
  --fs-accent: #2563eb;
  --fs-radius: 6px;
}
```

Use `light-dark()` to give different values per mode:

```css
.fs, .fs-popover, select[data-flow-select] {
  --fs-chip-bg: light-dark(#dbeafe, #1e3a8a);
  --fs-chip-text: light-dark(#1e3a8a, #dbeafe);
}
```

### Colours

| Property | Used for |
|---|---|
| `--fs-text` | Text |
| `--fs-muted` | Icons, meta text, group headers |
| `--fs-placeholder` | Placeholder text |
| `--fs-bg` | Control background |
| `--fs-border` | Control border |
| `--fs-border-hover` | Control border on hover |
| `--fs-accent` | Border when focused or open, highlighted chip outline |
| `--fs-ring` | Focus ring (a `box-shadow` value) |
| `--fs-ghost-bg` | Ghost variant background |
| `--fs-ghost-hover` | Ghost variant background on hover and while open |
| `--fs-pop-bg` | List background |
| `--fs-pop-border` | List border |
| `--fs-pop-shadow` | List shadow (a `box-shadow` value) |
| `--fs-active-bg` | Highlighted row |
| `--fs-chip-bg` | Chip background |
| `--fs-chip-text` | Chip text |
| `--fs-badge-bg` | Badge background |
| `--fs-avatar-bg` | Letter avatar background |
| `--fs-avatar-text` | Letter avatar text |
| `--fs-description` | Description text |
| `--fs-invalid` | Border when invalid |

### Sizes and motion

| Property | Default | Used for |
|---|---|---|
| `--fs-height` | `2.5em` | Control height |
| `--fs-pad-x` | `.875em` | Horizontal padding |
| `--fs-radius` | `.5rem` | Control corners |
| `--fs-radius-pop` | `.75rem` | List corners |
| `--fs-radius-item` | `.4375rem` | Row corners |
| `--fs-pop-max-height` | `20rem` | Maximum list height |
| `--fs-pop-min-width` | `12rem` | Minimum list width |
| `--fs-duration` | `90ms` | Open fade and colour transitions. `0s` turns them off |

Text size and font are inherited from the page, like a native input, so the list matches your site. Sizes are in `em`, so changing `font-size` on a select (or on a container) scales everything. Users who prefer reduced motion get no animation.

## Classes

Add your own class to the wrapper with `data-fs-class-name="my-select"`. The wrapper also carries state classes you can style:

| Class | When |
|---|---|
| `fs--field`, `fs--pill`, `fs--ghost` | Variant |
| `fs--sm`, `fs--lg` | Size |
| `fs--multiple` | Multiple select |
| `is-open` | The list is open |
| `has-value` | A value is chosen |
| `has-query` | Text is typed in inline search |
| `is-disabled` | Disabled |
| `is-invalid` | Failed validation |

## Example: brand colour

```css
.brand .fs, .brand .fs-popover, .brand select[data-flow-select] {
  --fs-accent: #673de6;
  --fs-ring: 0 0 0 3px rgb(103 61 230 / .2);
  --fs-chip-bg: light-dark(#ede9fe, #3b2f63);
  --fs-chip-text: light-dark(#4c1d95, #ddd6fe);
}
```
