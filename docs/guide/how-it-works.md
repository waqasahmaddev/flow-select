# How it works

## The native select stays

flow-select wraps your `<select>` in a `<div class="fs">` and builds its own control next to it. The original select is kept, visually hidden, inside the wrapper:

```html
<div class="fs fs--field">
  <select class="fs-native" name="status" tabindex="-1" aria-hidden="true">...</select>
  <div class="fs-control">...</div>
  <div class="fs-popover" popover="manual">...</div>
</div>
```

Every choice is written to the real `<option>` elements. That is why:

- form posts contain exactly the fields a native select would send,
- `required` validation, `form.reset()`, the `form` attribute and `disabled` keep working,
- the browser's Back button restores values, and the control follows them,
- `document.querySelector('select').value` always tells the truth.

When you call `destroy()`, the original select is put back exactly as it was.

## The list lives in the top layer

The list uses the browser's [Popover API](https://developer.mozilla.org/docs/Web/API/Popover_API). It opens above everything, including modals and offcanvas panels, and it is never clipped by `overflow: hidden` or a transformed parent. No `z-index` tuning is needed. It is still a child of the wrapper in the DOM, so CSS custom properties and the light or dark theme are inherited.

The list is placed below the control, or above it when there is not enough room, and stays inside the visible area, including when the on-screen keyboard is open on a phone.

## No layout shift

Two things keep the page from jumping:

1. **The stylesheet styles the plain select.** `select[data-flow-select]` gets the same height, border, padding and chevron as the finished control, so the first paint already has the right size.
2. **The script enhances selects while the page is parsed.** Loaded in `<head>`, it watches the document as the browser reads it and enhances each select right after its closing tag, before the first paint.

## Light on the page

- The list is built when the pointer first moves over the control or it gets focus, not for every select on page load.
- Window and document listeners exist only while a list is open.
- Long lists render 100 rows at a time and add more as you scroll.
- Search ignores case and accents, so `cote` finds `Côte d'Ivoire`.

## Automatic start

The script build starts on its own:

- every `select[data-flow-select]` on the page,
- selects inside content swapped in by [htmx](/integrations/htmx), which are also cleaned up when swapped out,
- not selects with `data-flow-select="manual"`, which you create yourself in JavaScript.

For other ways of adding content, see [JavaScript and modules](/integrations/javascript).
