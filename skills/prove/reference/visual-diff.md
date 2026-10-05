# Pixel comparison: no visible change intended

This path is for UI-touching refactors, lint fixes and dependency or tooling
updates, not for intended visual changes. Use the project's installed tools and
its existing fixture driver.

## Capture and provenance

List the affected screens and states before running: changed transitions plus
the responsive, empty, loading and error states the code affects. An empty or
partial list cannot prove `identical: N/N`.

Record the full base and head SHAs. Run the same driver against both checkouts
with the same OS or container, browser version, headless mode, viewport, device
scale, fixtures, locale, clock and fonts. Reset fixtures between runs and use
test data only. Pin `timezoneId` and `locale` when creating the browser context
and freeze browser time **before navigation**. With Playwright 1.45 or later:

```js
const context = await browser.newContext({
  timezoneId: 'UTC', locale: 'en-US',
  viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
// Configure the project's seeded fixtures or init scripts before navigation too.
await page.goto(targetUrl);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: imagePath, fullPage: true, animations: 'disabled' });
```

`setFixedTime` fixes `Date.now()` and `new Date()` while timers keep running.
For timer-driven UI, call `page.clock.install({ time })` before navigation
instead and advance the clock to the same point on both runs; do not combine the
two modes. With an older Playwright, reuse the project's existing time mock and
never fall back to wall-clock time silently. See the
[Clock API](https://playwright.dev/docs/api/class-clock) and the
[browser context options](https://playwright.dev/docs/api/class-browser#browser-new-context).

Browser clock mocking does not freeze server-rendered time. Use fixed fixture
timestamps (including inputs for relative ages) and the project's mechanism for
freezing server time; pin server timezone and locale as needed. Seed or stub
randomness on client and server with the project's existing test hooks before
application code runs (`context.addInitScript` for a browser seed). Never replace
production randomness or credential generation.

`animations: 'disabled'` covers CSS transitions, CSS animations and Web
Animations, not every JavaScript motion source. Pause requestAnimationFrame,
canvas or Lottie motion through the project's deterministic hooks and seek videos
to the same frame; check that the motion really stops. If a state cannot be
stabilized, mark it `not comparable: <reason>`, publish ordinary before/after
evidence for it, and leave it out of `identical: N/N`. That exception never
covers missing images, stale SHAs or tool errors.

Keep both capture directories and the diff output outside git. Do not mask
elements or inject CSS that hides affected UI; stabilize the fixture instead.

## Compare

### With `compare.mjs`

The skill's script wraps the installed `pixelmatch` and `pngjs`:

```bash
node <skill-dir>/scripts/compare.mjs /tmp/base /tmp/head /tmp/diff
```

- Pairs PNG files by name; a file present on only one side is `missing` and fails.
- Different dimensions are `size` differences and fail; no padding turns them
  into a pass.
- Uses color threshold `0` with antialiasing pixels included, and allows zero
  differing pixels. `--threshold <0..1>` exists for documented exceptions only;
  the result line records the value used.
- Writes `<name>.png` into the diff directory for every pair that differs.
- Exit codes: `0` all pairs identical (at least one pair), `1` any difference,
  missing pair or empty set, `2` usage or tool error. `--json` prints the result
  as JSON.

### With existing Playwright visual tests

Reuse the project's screenshot test and put snapshots and results outside git
through `snapshotPathTemplate` and `outputDir`. Set the assertion strictly:

```js
await expect(page).toHaveScreenshot('affected-state.png', {
  animations: 'disabled', fullPage: true,
  threshold: 0, maxDiffPixels: 0, maxDiffPixelRatio: 0,
});
```

Create the snapshots once on the **base**, then run the **head** with
`--update-snapshots=none`. A missing baseline is a failure, not permission to
create one. Playwright's comparator has its own antialiasing handling; record it,
and fall back to `compare.mjs` when you need antialiasing pixels counted. See
[visual comparisons](https://playwright.dev/docs/test-snapshots).

## Report

Put the text result in the PR's Evidence section:

```text
Intent: no visible change (lint-only UI edit)
Base: FULL_BASE_SHA; head: FULL_HEAD_SHA
Capture: same container, 1280x900 @1x, fixture revision R, fonts loaded, animations disabled
Clock: 2026-01-01T00:00:00Z, setFixedTime before navigation; timezoneId=UTC; locale=en-US
Server time: fixed fixture timestamps; random seed 42 via init script
Tool: compare.mjs with pixelmatch X.Y.Z; threshold=0; antialiasing counted; allowed pixels=0
Pairs: desktop-loading 0; desktop-loaded 0; mobile-loaded 0
Result: identical: 3/3 (exit 0)
Artifacts: <where the reviewer can find the captures>; reproduce: <exact commands>
```

If any pair differs, write `no visible change claim failed`, publish before,
after and diff for every differing state, fix unintended regressions and compare
again. Never report an unexplained difference as identical. A new head needs a
new comparison.
