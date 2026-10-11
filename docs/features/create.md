# Creating options

Let users add what they typed when it is not in the list.

<Demo log>
  <div class="field">
    <label for="cr-tags">Tags</label>
    <select id="cr-tags" name="tags" multiple data-flow-select data-fs-create data-fs-placeholder="Type a new tag...">
      <option>Design</option>
      <option>CSS</option>
      <option>JavaScript</option>
    </select>
  </div>
</Demo>

```html
<select name="tags" multiple data-flow-select data-fs-create>...</select>
```

When the typed text does not match an existing label, a row "Create “text”" appears at the end. Choose it with a click or <kbd>Enter</kbd>. The new option:

- is added to the list for this page,
- is added to the native select, so the form posts it with the typed text as both value and label,
- fires `flowselect:create` with `event.detail.item`.

It works for single selects too.

## Saving on the server first

Pass a function to `create` to save the option and use the value your server returns. Return `null` to cancel. If the function throws, nothing is added and `flowselect:error` fires.

```js
new FlowSelect('#tags', {
  create: async (label) => {
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: label })
    });
    if (!response.ok) {
      return null;
    }
    const tag = await response.json();
    return { value: tag.id, label: tag.name };
  }
});
```

<Demo setup="remoteTagsCreate">
  <div class="field">
    <label for="cr-remote">Tags from a server, with create</label>
    <select id="cr-remote" name="tags" multiple data-flow-select="manual" data-fs-placeholder="Search or create..."></select>
  </div>
</Demo>

## Translating the row

The text comes from `messages.create`, with `{query}` as the typed text. See [Messages and translation](/customization/messages).
