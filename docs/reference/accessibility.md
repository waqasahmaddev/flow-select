# Accessibility

flow-select is built on the [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) and tested with keyboard-only use.

## Roles

| Mode | Focused element | Pattern |
|---|---|---|
| No search | `button` with `role="combobox"` | Select-only combobox |
| Inline search | `input` with `role="combobox"` | Editable combobox with list autocomplete |
| Search in the list | `button`, then the search `input` with `role="combobox"` | Button opening an editable combobox |
| Multiple | `input` with `role="combobox"` | Editable combobox, `aria-multiselectable` list |

The list is `role="listbox"` with `role="option"` rows. The highlighted row is announced through `aria-activedescendant`, so focus stays in the control. Chosen rows have `aria-selected="true"`, disabled rows `aria-disabled="true"`.

## Labels

- A `<label for>` pointing at the select names the control. Clicking the label focuses it.
- `aria-label`, `aria-labelledby` and `aria-describedby` on the select are passed to the control.
- In search modes the current value is part of the control's name, so screen readers read "Country, Germany".
- Pill and ghost controls often have no visible label: give them an `aria-label`.

## Announcements

A polite live region announces:

- the number of results while searching ("12 results", "No results"),
- loading errors and "Type at least 2 characters",
- the highlighted chip while moving between chips,
- "You can choose up to 3" when a limit is reached.

## The native select

The original select stays in the page with `aria-hidden="true"` and `tabindex="-1"`, so it is not read twice and not reached with <kbd>Tab</kbd>. Browser validation still works and moves focus to the control.

## Touch and zoom

- On touch screens rows are at least 44 pixels high.
- Inputs use at least 16 pixel text on touch screens, so iOS does not zoom in.
- Search in the list is not focused when opened by touch, so the keyboard does not cover the list.

## Motion and contrast

- `prefers-reduced-motion` turns off the opening fade.
- The focus state changes the border colour and adds a ring. Adjust `--fs-accent` and `--fs-ring` if your design needs more contrast.

See also [Keyboard](/reference/keyboard).
