# Options

Options can be set in three ways. Later ones win:

1. `FlowSelect.defaults` for every select
2. `data-fs-*` attributes, or a JSON object in `data-flow-select='{ ... }'`
3. The object passed to `new FlowSelect(select, options)`

Attribute names are the option names in kebab case with `data-fs-`: `maxItems` is `data-fs-max-items`. `"true"`, `"false"` and an empty value are read as booleans; numbers are read as numbers.

## Appearance

| Option | Attribute | Default | Description |
|---|---|---|---|
| `variant` | `data-fs-variant` | `'field'` | `'field'`, `'pill'` or `'ghost'`. See [Variants](/features/variants) |
| `size` | `data-fs-size` | `''` | `'sm'` or `'lg'` |
| `checkPosition` | `data-fs-check-position` | `'start'` | `'start'`, `'end'` or `'none'` |
| `className` | `data-fs-class-name` | `''` | Extra classes on the wrapper |
| `maxHeight` | `data-fs-max-height` | `''` | Maximum list height, any CSS length |

## Behaviour

| Option | Attribute | Default | Description |
|---|---|---|---|
| `search` | `data-fs-search` | `null` | `null` automatic, `true`, `false`, `'inline'` or `'dropdown'`. See [Search](/features/search) |
| `searchThreshold` | `data-fs-search-threshold` | `8` | Automatic search turns on above this many options |
| `searchPlaceholder` | `data-fs-search-placeholder` | `'Search...'` | Placeholder of the dropdown search box |
| `placeholder` | `data-fs-placeholder` | `''` | Text when nothing is chosen. Defaults to the `<option value="">` label |
| `clearable` | `data-fs-clearable` | `false` | Shows a clear button when a value is chosen |
| `hidePlaceholderOption` | `data-fs-hide-placeholder-option` | `false` | Leaves the `<option value="">` row out of the list |
| `closeOnSelect` | `data-fs-close-on-select` | `null` | `null`: single closes, multiple stays open |
| `maxItems` | `data-fs-max-items` | `0` | Multiple: maximum choices, `0` for no limit |
| `hideSelected` | `data-fs-hide-selected` | `false` | Multiple: hides chosen options from the list |
| `create` | `data-fs-create` | `false` | `true`, or `async (label, instance) => item or null`. See [Creating options](/features/create) |
| `pageSize` | `data-fs-page-size` | `100` | Rows rendered at a time in long lists |
| `refreshOn` | `data-fs-refresh-on` | `''` | Space separated document events that call `reload()` |

## Remote data

| Option | Attribute | Default | Description |
|---|---|---|---|
| `url` | `data-fs-url` | `''` | Endpoint. `{query}` and `{page}` placeholders, or `?q=` and `&page=` are added |
| `load` | | `null` | `async (query, { page, signal }) => items or { items, hasMore }` |
| `queryParam` | `data-fs-query-param` | `'q'` | Query parameter name |
| `minQueryLength` | `data-fs-min-query-length` | `0` | Characters needed before searching |
| `debounce` | `data-fs-debounce` | `250` | Milliseconds to wait after typing |
| `cache` | `data-fs-cache` | `true` | Remember results per query and page (last 50) |
| `fetchOptions` | | `null` | Extra `fetch()` options such as headers |
| `mapItem` | | `null` | `(serverItem) => item` |

See [Remote data](/features/remote).

## Rendering and text

| Option | Default | Description |
|---|---|---|
| `renderOption` | `null` | `(item, { selected }) => Node or HTML string`. See [Custom rendering](/customization/rendering) |
| `renderValue` | `null` | `(item) => Node or HTML string` |
| `messages` | see [Messages](/customization/messages) | Texts and screen reader announcements |

## Option attributes

On each `<option>`:

| Attribute | Description |
|---|---|
| `data-description` | Second line, wraps |
| `data-meta` | Small muted text under the label |
| `data-badge` | Small rounded tag |
| `data-avatar` | Image URL, or up to two letters |
| `data-keywords` | Extra words to search on |
| `disabled`, `hidden`, `selected` | Native meaning |

## Select attributes

| Attribute | Description |
|---|---|
| `data-flow-select` | Enhance automatically. May hold a JSON options object |
| `data-flow-select="manual"` | Pre-styled, but you create the instance in JavaScript |
| `multiple`, `required`, `disabled`, `name`, `form` | Native meaning |
| `aria-label`, `aria-labelledby`, `aria-describedby` | Passed to the control |
