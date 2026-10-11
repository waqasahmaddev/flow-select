# Bootstrap 5

flow-select works inside Bootstrap pages without extra setup.

## Modals and offcanvas

The list opens in the browser's top layer, above the modal and its backdrop, and is never cut off by a scrolling `.modal-body`. Focus stays inside the modal, so Bootstrap's focus trap is not disturbed.

<kbd>Esc</kbd> first closes the list only. A second <kbd>Esc</kbd> closes the modal, as users expect.

```html
<div class="modal fade" id="edit" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-body">
        <label class="form-label" for="priority">Priority</label>
        <select id="priority" name="priority" data-flow-select>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </div>
    </div>
  </div>
</div>
```

## Dark mode

Bootstrap 5.3 sets `color-scheme: dark` for `data-bs-theme="dark"`, and flow-select follows it automatically, on the page or on any container.

```html
<html data-bs-theme="dark">
```

## Matching Bootstrap's look

The default theme is neutral grey. To match Bootstrap's blue focus colour and input sizes:

```css
.fs, .fs-popover, select[data-flow-select] {
  --fs-accent: var(--bs-primary);
  --fs-ring: 0 0 0 .25rem rgba(var(--bs-primary-rgb), .25);
  --fs-radius: var(--bs-border-radius);
  --fs-border: var(--bs-border-color);
  --fs-height: calc(1.5em + .75rem + 2px);
}
```

Use `data-fs-size="sm"` and `data-fs-size="lg"` where you would use `form-select-sm` and `form-select-lg`.

## Classes on the select

Classes such as `form-select` stay on the hidden native select and have no visible effect. Validation classes are read: a select with `is-invalid` shows the invalid border.
