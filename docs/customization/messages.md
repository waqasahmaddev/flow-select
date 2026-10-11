# Messages and translation

All visible and screen reader texts are in the `messages` option. `{query}`, `{count}` and `{label}` are replaced.

<Demo setup="messages">
  <div class="field">
    <label for="msg-de">Stadt</label>
    <select id="msg-de" name="city" data-flow-select="manual" data-fs-search="dropdown">
      <option>Berlin</option>
      <option>Hamburg</option>
      <option>München</option>
    </select>
  </div>
</Demo>

```js
new FlowSelect('#city', {
  searchPlaceholder: 'Suchen...',
  messages: {
    noResultsFor: 'Keine Treffer für „{query}“',
    create: '„{query}“ anlegen'
  }
});
```

Only the messages you pass are replaced; the others keep their defaults.

## All messages

| Key | Default |
|---|---|
| `noResults` | `No results` |
| `noResultsFor` | `No results for “{query}”` |
| `loading` | `Loading...` |
| `searching` | `Searching...` |
| `error` | `Could not load results.` |
| `retry` | `Try again` |
| `create` | `Create “{query}”` |
| `typeMore` | `Type at least {count} characters` |
| `maxItems` | `You can choose up to {count}` |
| `results` | `{count} results` (announced to screen readers) |
| `oneResult` | `1 result` (announced to screen readers) |
| `clear` | `Clear selection` (label of the clear button) |
| `remove` | `Remove {label}` (label of a chip's remove button) |

The search box placeholder is the separate `searchPlaceholder` option, and the empty-control text is `placeholder` or your `<option value="">`.

## Translate every select at once

```js
FlowSelect.defaults.searchPlaceholder = 'Rechercher...';
FlowSelect.defaults.messages = {
  ...FlowSelect.defaults.messages,
  noResults: 'Aucun résultat',
  noResultsFor: 'Aucun résultat pour « {query} »',
  create: 'Créer « {query} »'
};
```

Set defaults before the selects start: put this script right after the flow-select script tag, with `data-manual` on the flow-select tag and `FlowSelect.autoInit()` after your defaults.

## Right to left

Inside `dir="rtl"`, the control and the list mirror automatically and the list aligns to the control's right edge.
