# Keyboard

flow-select follows the [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). Focus never gets trapped: <kbd>Tab</kbd> always moves to the next field.

## Closed

| Key | Action |
|---|---|
| <kbd>↓</kbd> <kbd>↑</kbd> <kbd>Enter</kbd> | Opens the list on the chosen option |
| <kbd>Space</kbd> | Opens the list (types a space in inline search) |
| <kbd>Home</kbd> <kbd>End</kbd> | Opens on the first or last option |
| Letters | Without search: chooses the next option starting with them, like a native select. With search: opens and starts searching |
| <kbd>Backspace</kbd> <kbd>Delete</kbd> | Clears a clearable select. Multiple: <kbd>Backspace</kbd> removes the last chip |
| <kbd>Esc</kbd> | Nothing, so a surrounding dialog can close |
| <kbd>Tab</kbd> | Next field |

## Open

| Key | Action |
|---|---|
| <kbd>↓</kbd> <kbd>↑</kbd> | Moves the highlight, skipping disabled options |
| <kbd>Page Down</kbd> <kbd>Page Up</kbd> | Moves ten options |
| <kbd>Home</kbd> <kbd>End</kbd> | First or last option (moves the text cursor while you have typed something) |
| <kbd>Enter</kbd> | Chooses the highlighted option. Multiple: adds or removes it |
| <kbd>Space</kbd> | Chooses the highlighted option when not typing |
| <kbd>Alt</kbd> + <kbd>↑</kbd> | Chooses and closes |
| Letters | Filters, or jumps to the next match without search |
| <kbd>Esc</kbd> | Closes without changes and keeps focus |
| <kbd>Tab</kbd> | Closes and moves to the next field |

## Chips

In a multiple select with an empty input:

| Key | Action |
|---|---|
| <kbd>←</kbd> | Highlights the last chip |
| <kbd>←</kbd> <kbd>→</kbd> | Moves between chips; <kbd>→</kbd> after the last returns to the input |
| <kbd>Backspace</kbd> <kbd>Delete</kbd> | Removes the highlighted chip |

## Forms

<kbd>Enter</kbd> inside a flow-select never submits the surrounding form.
