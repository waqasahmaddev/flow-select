# Introduction

flow-select turns a normal `<select>` into a searchable, keyboard-friendly control with a polished list. It has no dependencies and works with any server framework, because the original `<select>` stays in your form.

<Demo>
  <div class="field">
    <label for="intro-fruit">Fruit</label>
    <select id="intro-fruit" name="fruit" data-flow-select data-fs-search="true">
      <option value="">Choose a fruit</option>
      <option value="apple">Apple</option>
      <option value="apricot">Apricot</option>
      <option value="banana">Banana</option>
      <option value="cherry">Cherry</option>
      <option value="mango">Mango</option>
    </select>
  </div>
</Demo>

## Why another select library

Most select libraries replace the native element with their own widget. That brings the usual problems: the keyboard behaves differently from a real select, the page jumps when the script loads, forms need extra hidden fields, and the bundle is large.

flow-select takes a different approach:

- **The native select is the source of truth.** Every choice is written back to the real `<option>` elements, so the browser posts exactly what a native select would, `required` works, and `form.reset()` works.
- **It behaves like a native control.** It opens on mouse press, supports typeahead, never traps focus, and follows the [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
- **It does not shift the layout.** The stylesheet gives the plain select the same box as the finished control, so nothing moves when the script runs.
- **It stays small.** About 11 KB of gzipped JavaScript and 3 KB of CSS, with search, multiple selection, groups, remote data and more.

| | Minified | Gzipped |
|---|---|---|
| flow-select | 34 KB | 11.5 KB |
| Choices.js 11.1 | 73.6 KB | 19.9 KB |

## What you can build

- Simple dropdowns that look the same in every browser
- Filter bars with [pill](/features/variants) controls and toolbar menus with the ghost variant
- Searchable lists, [inline](/features/search) like a combobox or with a search box in the list
- [Tag pickers](/features/multiple) with chips, limits and [new tags](/features/create)
- [People pickers](/features/rich-options) with avatars, emails and role badges
- [Remote search](/features/remote) over thousands of records with paging

Next: [Getting started](/guide/getting-started).
