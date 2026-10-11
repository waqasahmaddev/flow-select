# Groups and rich options

## Groups

`<optgroup>` elements become group headers. A disabled group disables its options.

<Demo setup="timezones">
  <div class="field">
    <label for="r-tz">Time zone</label>
    <select id="r-tz" name="timezone" data-flow-select data-fs-search="true"></select>
  </div>
</Demo>

```html
<select name="timezone" data-flow-select>
  <optgroup label="Europe">
    <option value="Europe/Berlin">Berlin</option>
    <option value="Europe/Paris">Paris</option>
  </optgroup>
  <optgroup label="Asia">
    <option value="Asia/Tokyo">Tokyo</option>
  </optgroup>
</select>
```

## Descriptions

Add `data-description` to show a second line that wraps.

<Demo>
  <div class="field">
    <label for="r-tier">Service tier</label>
    <select id="r-tier" name="tier" data-flow-select>
      <option value="standard" selected data-description="Standard processing, pay as you go">Standard</option>
      <option value="fast" data-description="Faster processing, pay as you go, with an automatic ramp-up period">Fast</option>
      <option value="flex" data-description="Cheaper processing that may be delayed during busy periods">Flex</option>
    </select>
  </div>
</Demo>

```html
<option value="fast" data-description="Faster processing, pay as you go">Fast</option>
```

## Avatars, meta text and badges

| Attribute | Shows |
|---|---|
| `data-avatar` | An image when the value is a URL (`https://...`, `/path`, `data:`), otherwise up to two letters |
| `data-meta` | Small muted text under the label, such as an email |
| `data-badge` | A small rounded tag, such as a role |

<Demo>
  <div class="field">
    <label for="r-author">Author</label>
    <select id="r-author" name="author" data-flow-select data-fs-search="true" data-fs-search-placeholder="Search authors...">
      <option value="maya" data-avatar="MP" data-meta="maya@example.com" data-badge="Admin" selected>Maya Patel</option>
      <option value="leo" data-avatar="LM" data-meta="leo@example.com" data-badge="Editor">Leo Martin</option>
      <option value="jonas" data-avatar="JB" data-meta="jonas@example.com" data-badge="Author">Jonas Berg</option>
      <option value="ava" data-avatar="AN" data-meta="ava@example.com" data-badge="Author">Ava Novak</option>
    </select>
  </div>
</Demo>

```html
<option value="maya" data-avatar="/avatars/maya.jpg" data-meta="maya@example.com" data-badge="Admin">
  Maya Patel
</option>
```

The avatar also appears in the closed control.

## Disabled options

The native `disabled` attribute works. Disabled options are shown faded, skipped by the keyboard and cannot be chosen.

<Demo>
  <div class="field">
    <label for="r-keys">Key</label>
    <select id="r-keys" data-flow-select>
      <optgroup label="Active keys">
        <option>Production</option>
        <option>Staging</option>
      </optgroup>
      <optgroup label="Revoked keys">
        <option disabled>Old laptop</option>
      </optgroup>
    </select>
  </div>
</Demo>

## Search keywords

`data-keywords` adds extra words to search on without showing them:

```html
<option value="de" data-keywords="deutschland allemagne">Germany</option>
```

## Anything else

For full control over a row, use [custom rendering](/customization/rendering).
