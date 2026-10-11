# Forms and servers

flow-select never replaces your `<select>`. It writes every choice to the real `<option>` elements, so the browser posts exactly what a native select would. Your server code does not change.

## What gets posted

| Select | Posted fields |
|---|---|
| Single | `plan=team` |
| Single with the placeholder chosen | `category=` (empty) |
| Multiple | `tags=css&tags=js`, one field per choice, in the order chosen |
| Multiple with nothing chosen | nothing, like a native select |
| Value picked from [remote](/features/remote) results | posted like any other option |
| `disabled` select | nothing |
| Select outside the form with `form="id"` | posted with that form |

These cases are covered by automated tests that submit a real form and read what the server receives.

## ASP.NET Core

```html
<select asp-for="Status" asp-items="Model.Statuses" data-flow-select></select>

<select asp-for="TagIds" asp-items="Model.Tags" multiple data-flow-select></select>
```

```csharp
public class PostForm
{
    public string Status { get; set; } = "";
    public List<Guid> TagIds { get; set; } = [];
}
```

Model binding reads repeated keys into the list. Tag helpers, `asp-for`, validation attributes and anti-forgery tokens all keep working. For remote search, add the token with `fetchOptions` if your endpoint needs it.

With Razor Components (static server rendering), render the `<select>` as usual and add `data-flow-select`.

## PHP

Name multiple selects with `[]`, as with any multiple select:

```html
<select name="tags[]" multiple data-flow-select>...</select>
```

```php
$tags = $_POST['tags'] ?? [];   // array
$status = $_POST['status'] ?? '';
```

## Laravel

```blade
<select name="tags[]" multiple data-flow-select>
  @foreach ($tags as $tag)
    <option value="{{ $tag->id }}" @selected(in_array($tag->id, old('tags', [])))>{{ $tag->name }}</option>
  @endforeach
</select>
```

`old()` and validation errors work as with a native select.

## Django

```python
tags = forms.MultipleChoiceField(choices=TAG_CHOICES, widget=forms.SelectMultiple(attrs={"data-flow-select": ""}))
```

```python
request.POST.getlist("tags")
```

## Ruby on Rails

```erb
<%= form.select :tag_ids, Tag.pluck(:name, :id), {}, multiple: true, data: { flow_select: "" } %>
```

Rails adds an empty hidden field for multiple selects, so "nothing chosen" still reaches the controller.

## Validation

`required` works. When the browser blocks a submit, the control gets the `is-invalid` class and focus moves to it. Choosing a value removes the class. A select rendered with `class="is-invalid"` (for example Bootstrap server-side validation) shows the invalid style from the start.

```html
<select name="country" required data-flow-select>
  <option value="">Choose a country</option>
  ...
</select>
```

## Reset and the Back button

- `form.reset()` and `<button type="reset">` restore the initial selection, and the control follows.
- When a user comes back with the Back button, browsers may restore earlier form values. The control shows them.

## Reading values in JavaScript

```js
new FormData(form).getAll('tags');              // ['css', 'js']
document.querySelector('#status').value;        // 'published'
FlowSelect.get('#tags').value;                  // ['css', 'js']
```
