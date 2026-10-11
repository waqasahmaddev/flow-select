# Browser support

| Browser | Version |
|---|---|
| Chrome, Edge, Opera | 123+ |
| Firefox | 125+ |
| Safari, iOS Safari | 17.5+ |

These are the versions from 2024 that support the [Popover API](https://developer.mozilla.org/docs/Web/API/Popover_API) and CSS [`light-dark()`](https://developer.mozilla.org/docs/Web/CSS/color_value/light-dark), which flow-select uses for the list and the theme.

## Optional features

- `field-sizing: content` makes pill and ghost selects exactly as wide as their value before the script runs. Browsers without it show the plain select at its usual width until the script starts, which takes no time when the script is in `<head>`.
- Without the Popover API the list falls back to a fixed position with a high `z-index`.

## Testing

The test suite runs with Playwright in Chrome, Firefox and WebKit on desktop, and with Pixel and iPhone emulation for touch.
