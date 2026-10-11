# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Setup

```bash
git clone https://github.com/waqasahmaddev/flow-select.git
cd flow-select
npm install
npm run build
```

## Useful commands

| Command | What it does |
|---|---|
| `npm run build` | Builds `dist/` |
| `npm run serve` | Demo page with mock endpoints at http://localhost:5180/demo/ |
| `npm test` | Runs the Playwright tests |
| `npm run docs:dev` | Documentation site with live demos |

Install the test browsers once with `npx playwright install`.

## Guidelines

- Keep it dependency free and small. Check the size with `npm run build` before and after.
- The native `<select>` stays the source of truth. Forms must keep posting what a native select would.
- Keyboard and screen reader behaviour follow the WAI-ARIA combobox pattern. Add a test for any key behaviour you change.
- Colours and sizes are CSS custom properties, so users can theme without editing the stylesheet.
- Public API changes need a docs page update in `docs/`.
- Use only generic sample data in demos and tests.

## Reporting a bug

Open an issue with the browser and version, a minimal HTML example, what you expected and what happened.
