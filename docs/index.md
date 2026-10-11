---
layout: home

hero:
  name: flow-select
  text: A select that feels native
  tagline: Fast, keyboard-first and accessible. It enhances a normal &lt;select&gt;, so your forms keep working. No dependencies.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: See the features
      link: /features/variants

features:
  - title: Plain HTML first
    details: Add one attribute to a select. The form still posts the same fields, so ASP.NET Core, PHP, Django, Rails and Laravel need no changes.
  - title: Keyboard first
    details: Follows the WAI-ARIA combobox pattern. Arrows, Home and End, typeahead, chip navigation, and Tab always moves on.
  - title: Search, multiple, remote
    details: Search in the field or in the list, chips, groups, descriptions, avatars, create new options, and remote data with paging.
  - title: No layout shift
    details: The stylesheet draws the plain select at its final size, and the script enhances selects while the page is parsed.
  - title: htmx friendly
    details: The native change event fires, swapped-in selects start automatically, and server events can reload the data.
  - title: Small and themeable
    details: About 11 KB gzipped. Neutral grey, light and dark from the page's color-scheme, every value a CSS custom property.
---

<div class="vp-doc" style="max-width: 720px; margin: 48px auto 0; padding: 0 24px">

## Try it

<Demo inline>
  <select aria-label="Status" data-flow-select data-fs-variant="pill">
    <option value="">All statuses</option>
    <option>Draft</option>
    <option>In review</option>
    <option>Published</option>
  </select>
  <select aria-label="Group by" data-flow-select data-fs-variant="ghost">
    <option value="">Group by</option>
    <option>Author</option>
    <option>Category</option>
    <option>Month</option>
  </select>
  <div class="field" style="flex: 1 1 260px">
    <select aria-label="Tags" multiple data-flow-select data-fs-create data-fs-placeholder="Add tags...">
      <option selected>Design</option>
      <option>CSS</option>
      <option>JavaScript</option>
      <option>Accessibility</option>
    </select>
  </div>
</Demo>

</div>
