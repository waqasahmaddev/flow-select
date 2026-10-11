# Remote data

Load options from your server as the user types.

::: info The demos on this page
These docs are a static site, so the demos use a `load()` function with fake data and a short delay. With a real server you would usually just set `data-fs-url`.
:::

## From a URL

```html
<select name="person" data-flow-select data-fs-url="/api/people"></select>
```

When the list opens, flow-select requests `/api/people?q=` and shows the results. As the user types it requests `/api/people?q=maya`. The server returns JSON:

```json
[
  { "value": "p1", "label": "Maya Patel", "meta": "maya@example.com", "badge": "Admin", "avatar": "MP" },
  { "value": "p2", "label": "Leo Martin" }
]
```

<Demo setup="remotePeople" log>
  <div class="field">
    <label for="re-person">Person</label>
    <select id="re-person" name="person" data-flow-select="manual" data-fs-placeholder="Search people"></select>
  </div>
</Demo>

### Item fields

| Field | Also accepted | Purpose |
|---|---|---|
| `value` | `id`, `key` | Posted value (required) |
| `label` | `text`, `name`, `title` | Shown text |
| `description` | | Second line |
| `meta` | `subtitle` | Small muted text |
| `badge` | | Small tag |
| `avatar` | `image` | Image URL or initials |
| `group` | | Group header |
| `disabled` | | Cannot be chosen |

If your API uses other names, map them with `mapItem`:

```js
new FlowSelect('#person', {
  url: '/api/users',
  mapItem: (user) => ({ value: user.userId, label: user.displayName, meta: user.email })
});
```

### URL format

By default the query is added as `?q=`. Change the name with `data-fs-query-param="search"`, or place it yourself with `{query}` and `{page}`:

```html
<select data-flow-select data-fs-url="/api/people/search/{query}?page={page}"></select>
```

Requests send `Accept: application/json` and `X-Requested-With: XMLHttpRequest`, with cookies for the same origin. Add headers, such as an anti-forgery token, with `fetchOptions`:

```js
new FlowSelect('#person', {
  url: '/api/people',
  fetchOptions: { headers: { 'X-CSRF-Token': token } }
});
```

## Paging

Return an object with `hasMore` and the next page loads when the user scrolls near the end, or arrows past the last row:

```json
{ "items": [ ... ], "hasMore": true }
```

The second request is `/api/people?q=maya&page=2`. `results` and `data` are accepted instead of `items`.

<Demo setup="remoteReviewers">
  <div class="field">
    <label for="re-reviewers">Reviewers (160 people, 20 per page)</label>
    <select id="re-reviewers" name="reviewers" multiple data-flow-select="manual" data-fs-placeholder="Add reviewers"></select>
  </div>
</Demo>

## Your own loading function

Use `load` when you need full control, for example GraphQL or a client library. It receives the query, the page number and an `AbortSignal`, and returns an array or `{ items, hasMore }`.

```js
new FlowSelect('#person', {
  load: async (query, { page, signal }) => {
    const response = await fetch(`/graphql?q=${encodeURIComponent(query)}&page=${page}`, { signal });
    const json = await response.json();
    return { items: json.data.people, hasMore: json.data.hasMore };
  }
});
```

## Typing, cancelling and caching

- **Debounce:** requests wait until typing pauses for 250 ms (`data-fs-debounce`). Opening the list loads at once.
- **Cancelling:** a new request aborts the previous one, and an old response never replaces newer results.
- **Caching:** results are remembered per query and page (the last 50), so going back is instant. Turn this off with `data-fs-cache="false"`, or clear it with `reload()`.

## Minimum length

<Demo setup="remoteMinimum">
  <div class="field">
    <label for="re-min">Type at least 2 characters</label>
    <select id="re-min" data-flow-select="manual" data-fs-placeholder="Type to search"></select>
  </div>
</Demo>

```html
<select data-flow-select data-fs-url="/api/people" data-fs-min-query-length="2"></select>
```

## Loading and errors

A spinner shows while the first results load. When new results load over old ones, the old rows dim. If a request fails, the list shows a message and a "Try again" button (also <kbd>Enter</kbd>), and `flowselect:error` fires.

<Demo setup="remoteSlow">
  <div class="field">
    <label for="re-slow">Slow server (1.5 seconds)</label>
    <select id="re-slow" data-flow-select="manual" data-fs-placeholder="Search"></select>
  </div>
</Demo>

<Demo setup="remoteError">
  <div class="field">
    <label for="re-error">Server that always fails</label>
    <select id="re-error" data-flow-select="manual" data-fs-placeholder="Search"></select>
  </div>
</Demo>

## Values chosen earlier

Render the current value as a normal selected option. It is shown straight away, and kept while the user searches:

```html
<select name="person" data-flow-select data-fs-url="/api/people">
  <option value="p2" selected data-avatar="LM">Leo Martin</option>
</select>
```

Options picked from results are added to the native select (marked `data-fs-dynamic`), so the form posts them; unpicked ones are removed again.

## Reloading

Call `reload()` to clear the cache, or let an event do it with `data-fs-refresh-on`:

```html
<select data-flow-select data-fs-url="/api/people" data-fs-refresh-on="people-changed"></select>
```

```js
document.dispatchEvent(new Event('people-changed'));
```

With htmx a server response can trigger this. See [htmx](/integrations/htmx).
