# Events

All events are dispatched on the native `<select>` and bubble, so you can listen on the select, its form, or the document.

## Native events

Every change made by the user, or by a method without `silent: true`, fires `input` and then `change`, exactly like a native select. Existing code and htmx `hx-trigger="change"` keep working.

```js
document.querySelector('#status').addEventListener('change', (event) => {
  console.log(event.target.value);
});
```

## flowselect events

Each is a `CustomEvent`. `event.detail.instance` is the instance and `event.detail.value` the current value.

| Event | When | Extra detail |
|---|---|---|
| `flowselect:init` | The instance was created | |
| `flowselect:open` | The list opened | |
| `flowselect:close` | The list closed | |
| `flowselect:change` | The value changed, after `input` and `change` | `items`: the chosen items |
| `flowselect:search` | The search text changed while open | `query` |
| `flowselect:load` | Remote results arrived | `query`, `page`, `items` |
| `flowselect:error` | A remote request or `create` function failed | `error`, `query`, `page` |
| `flowselect:create` | A new option was created | `item` |
| `flowselect:destroy` | The instance was destroyed | |

<Demo log>
  <div class="field">
    <label for="ev-plan">Plan</label>
    <select id="ev-plan" name="plan" data-flow-select>
      <option value="free">Free</option>
      <option value="team">Team</option>
      <option value="business">Business</option>
    </select>
  </div>
</Demo>

```js
document.addEventListener('flowselect:change', (event) => {
  const { instance, value, items } = event.detail;
  console.log(instance.element.name, value, items);
});
```

## With htmx

```html
<select name="person" data-flow-select data-fs-url="/api/people"
        hx-get="/preview" hx-trigger="flowselect:change" hx-target="#preview"></select>
```
