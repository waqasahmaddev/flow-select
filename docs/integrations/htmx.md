# htmx

flow-select needs no htmx extension. It fires the native events htmx listens to, and it starts and stops with swapped content.

## Trigger requests on change

Every user change dispatches the native `input` and `change` events on the `<select>`. So the htmx defaults just work:

```html
<form hx-get="/posts" hx-trigger="change" hx-target="#results">
  <select name="status" data-flow-select data-fs-variant="pill">
    <option value="">All statuses</option>
    <option>Draft</option>
    <option>Published</option>
  </select>
  <select name="tags" multiple data-flow-select data-fs-url="/api/tags"></select>
</form>
```

One request is sent per user change, with all form values. Programmatic changes with `{ silent: true }` send none.

## Use the custom event

If you only want requests from flow-select changes, listen to `flowselect:change`:

```html
<select name="person" data-flow-select data-fs-url="/api/people"
        hx-get="/people/preview" hx-trigger="flowselect:change" hx-target="#preview"></select>
```

## Swapped content starts automatically

Selects inside content that htmx swaps in are enhanced on `htmx:load`. When htmx removes content, the instances inside are destroyed, including an open list.

```html
<button hx-get="/forms/address" hx-target="#address">Add address</button>
<div id="address"></div>
```

```html
<!-- returned by /forms/address -->
<select name="country" data-flow-select data-fs-search="true">...</select>
```

## Replacing the options

Target the select itself to replace its options. flow-select notices the change and refreshes the list and the shown value:

```html
<select id="city" name="city" data-flow-select></select>

<select name="country" data-flow-select
        hx-get="/cities" hx-trigger="change" hx-target="#city" hx-include="this"></select>
```

```html
<!-- returned by /cities?country=de -->
<option value="">Choose a city</option>
<option value="berlin">Berlin</option>
<option value="hamburg">Hamburg</option>
```

## Reload after a server event

With `data-fs-refresh-on`, a select reloads its data when an event reaches the document. Combined with the `HX-Trigger` response header, the server decides when lists are stale:

```html
<select name="person" data-flow-select data-fs-url="/api/people" data-fs-refresh-on="people-changed"></select>
```

```http
HTTP/1.1 200 OK
HX-Trigger: people-changed
```

Remote selects clear their cache and reload if open; local selects re-read their options.

## Boosted pages

`hx-boost` swaps the body, which fires `htmx:load` for the new content, so selects start again.

## Loading order

Load flow-select in `<head>`. The order relative to htmx does not matter.

```html
<link rel="stylesheet" href="/lib/flow-select.min.css">
<script src="/lib/flow-select.min.js"></script>
<script src="/lib/htmx.min.js" defer></script>
```
