# Search

## When search is on

By default search turns on by itself when a select has **more than 8 options**, and always for [multiple](/features/multiple), [remote](/features/remote) and [create](/features/create). Force it with `data-fs-search`:

| Value | Result |
|---|---|
| (not set) | Automatic, as above |
| `true` | On, in the default position for the variant |
| `inline` | On, typing happens inside the control |
| `dropdown` | On, a search box sits at the top of the list |
| `false` | Off |

The default position is `inline` for the field variant and `dropdown` for pill and ghost.

The threshold is the `searchThreshold` option. Change it for every select with `FlowSelect.defaults.searchThreshold = 12`.

::: warning Options added later
The automatic choice is made when the select starts. If your script adds the options afterwards, set `data-fs-search` explicitly.
:::

## Inline search

You type directly in the control, like a combobox. While the list is open the current value fades; as soon as you type it is replaced by your text. Press <kbd>Esc</kbd> and the value comes back.

<Demo>
  <div class="field">
    <label for="se-inline">Country</label>
    <select id="se-inline" name="country" data-flow-select data-fs-search="inline">
      <option value="">Choose a country</option>
      <option>Argentina</option><option>Austria</option><option>Belgium</option><option>Brazil</option>
      <option>Canada</option><option>Chile</option><option>Côte d'Ivoire</option><option>Denmark</option>
      <option>France</option><option>Germany</option><option>México</option><option>Norway</option>
      <option>Portugal</option><option>Spain</option><option>Sweden</option><option>Türkiye</option>
    </select>
  </div>
</Demo>

```html
<select name="country" data-flow-select data-fs-search="inline">...</select>
```

## Search in the list

A search box appears at the top of the list, like a command menu. This is the default for pill and ghost.

<Demo>
  <div class="field">
    <label for="se-dropdown">Country</label>
    <select id="se-dropdown" name="country" data-flow-select data-fs-search="dropdown" data-fs-search-placeholder="Search countries...">
      <option value="">Choose a country</option>
      <option>Argentina</option><option>Austria</option><option>Belgium</option><option>Brazil</option>
      <option>Canada</option><option>Chile</option><option>Côte d'Ivoire</option><option>Denmark</option>
      <option>France</option><option>Germany</option><option>México</option><option>Norway</option>
    </select>
  </div>
</Demo>

```html
<select data-flow-select data-fs-search="dropdown" data-fs-search-placeholder="Search countries...">...</select>
```

On touch screens the search box is not focused when the list opens, so the on-screen keyboard only appears when you tap the box.

## How matching works

- Case and accents are ignored: `cote` finds "Côte d'Ivoire", `mexico` finds "México".
- Several words must all match, in any order: `new york` finds "America / New York".
- Options whose label starts with your text come first (unless the list has groups, which keep their order).
- The label, `data-meta`, `data-description` and `data-keywords` are searched. Use keywords for synonyms:

```html
<option value="de" data-keywords="deutschland allemagne">Germany</option>
```

## Without search

With search off, typing letters on the closed control selects the next matching option, exactly like a native select. Typing the same letter again cycles through matches.

<Demo>
  <div class="field">
    <label for="se-off">Status (type a letter)</label>
    <select id="se-off" data-flow-select data-fs-search="false">
      <option>Draft</option><option>Done</option><option>In review</option><option>Published</option><option>Paused</option>
    </select>
  </div>
</Demo>

## Long lists

Lists render 100 rows at a time and add more as you scroll, so even 10,000 options open instantly.

<Demo setup="huge">
  <div class="field">
    <label for="se-huge">10,000 options</label>
    <select id="se-huge" data-flow-select data-fs-search="true"></select>
  </div>
</Demo>
