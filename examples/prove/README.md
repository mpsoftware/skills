# prove example

A one-page checkout (`app/index.html`) with a "before" state (`?variant=old`, no
order summary) and an "after" state (with the summary). `flow.json` drives it;
[`criteria.example.json`](../../skills/prove/assets/criteria.example.json) holds
matching acceptance criteria for a judge run.

```bash
npm ci
npx playwright install chromium
npm run example:prove
```

`run.mjs` serves the page on a random loopback port, captures before, after and
a second after run with `capture.mjs`, and runs `compare.mjs` twice: before vs
after must differ (exit 1), after vs after must be identical (exit 0). It prints
the directory with all captures and diff images.
