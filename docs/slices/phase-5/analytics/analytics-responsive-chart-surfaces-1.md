# Responsive chart surfaces (ANALYTICS-RESPONSIVE-CHART-SURFACES-1)

**Status:** implemented locally. Not pushed, not deployed, no PR.
**Date:** 2026-07-29
**Production baseline:** compatibility reader live at `a675a14000`
**Preceded by:** [S4 editor integration](./analytics-explicit-layout-s4-editor-integration.md) `ea1ca6d72` ·
[S5 responsive projection](./analytics-explicit-layout-s5-responsive-projection.md) `86ad3a744`

---

## 1. What this is

S4/S5 made the widget **containers** correct: a card is exactly its rectangle,
and narrow screens get a derived projection. The charts **inside** those cards
were still sized for one desktop widget. This slice fixes the charts.

It is a chart-rendering correction. **No layout rule, persisted field, save
intent, request shape, migration or database row changed.** Chart measurement is
never serialized.

## 2. Root cause, per chart

| Chart | Root cause | Symptom in the screenshot |
| --- | --- | --- |
| `Runs over time` | `<svg viewBox="0 0 600 220" width="100%" preserveAspectRatio="none">` with **no `height` attribute**. The browser therefore gave the SVG its aspect-ratio height — at a four-column card that is ~500px of SVG inside a ~117px body — and the card's `overflow-hidden` cut the bottom off. | Clipped vertically; the spike's top and the bottom axis both lost |
| `When your automations run` | `const cell = 14; const gap = 3;` with `width={W} height={H}` in absolute pixels. A 16×7 matrix is therefore always 269×116, whatever the card is. | Tiny heatmap marooned in the upper-left of a large widget |
| Metric sparklines | `Sparkline` defaulted to `width = 140` and was called at `width={150}`. | ~150px of chart in a ~264px-wide card |
| `By outcome` | Fixed `r=70` in a fixed `150×150` box, with a permanently side-by-side legend. | Never grew; cramped when narrow |
| `Top automations` / `Connected apps` | No height awareness at all — six rows at an intrinsic row height. | Overflowed a short card; bar track ignored extra width |
| Insight line / bar | Two private copies of a **width-only** `useMeasuredWidth`, and a fixed `height = 190`. | A tall insight widget drew a 190px chart in a 320px body |

The common cause: **height was measured nowhere in Analytics.** Widths were
measured in two places, by two duplicate hooks; nothing measured a chart's
available height, so nothing could notice a chart was taller than its card.

## 3. Shared responsive chart surface

| Concern | Path |
| --- | --- |
| Pure geometry (margins, cell size, donut layout, bar metrics) | `core/analytics/chartSizing.ts` |
| The single measurement seam | `components/analytics/ResponsiveChartSurface.tsx` |
| Chart primitives | `components/analytics/charts.tsx` |
| Widget bodies | `features/analytics/widgetBodies.tsx` |
| Widget shell | `features/analytics/Widget.tsx` |

```tsx
// The hook — the ONLY place Analytics observes a chart box.
const [ref, { width, height, measured, animate }] = useChartSize({
  fallbackWidth: 600,
  fallbackHeight: 170,
});

// The component — fills a `relative` parent, hands its own size to children.
<div className="relative min-h-0 min-w-0 flex-1">
  <ResponsiveChartSurface testId="analytics-line-surface">
    {({ width, height }) => <LinePlot width={width} height={height} … />}
  </ResponsiveChartSurface>
</div>
```

Both duplicate `useMeasuredWidth` hooks were deleted; `InsightLineChart` and
`InsightBarChart` now use `useChartSize`, and the insight line chart's height
comes from its measured plot region rather than a fixed 190.

## 4. Widget-shell sizing structure

```
Widget card        flex h-full min-h-0 min-w-0 flex-col overflow-hidden
├── Header         shrink-0                       ← added
└── Chart body     relative min-h-0 min-w-0 flex-1 overflow-hidden p-4
    └── Chart      flex h-full min-h-0 min-w-0 flex-col
        ├── Surface  absolute inset-0   (inside a relative flex-1 frame)
        └── Legend   shrink-0
```

Three properties make this work:

- **`shrink-0` on the header** — the body absorbs the squeeze, not the title row.
- **`relative` on the body** — it is the offset parent the surface fills.
- **`absolute inset-0` on the surface** — the observed element is sized purely by
  its parent, so a chart can never influence the box that sized it. A
  ResizeObserver feedback loop is structurally impossible, not merely unlikely.

`overflow-hidden` remains as a final boundary. It is **not** the mechanism: the
browser suite asserts each painted chart's rectangle against its body's, so
clipping fails a test rather than looking fine.

## 5. ResizeObserver behaviour

- Observes its **own element**; no `window.resize` listener anywhere.
- Reports **both** width and height, rounded to whole pixels.
- An identical rounded size is dropped **before it reaches React** — compared
  against a ref, not inside the state updater, because `setSettled` would
  re-render on its own and a reflow storm would still become a render storm.
- Updates coalesce into **one animation frame**. Scheduling is tracked by a
  boolean, not by the frame handle: a synchronous `requestAnimationFrame` runs
  the callback before the handle is assigned, and clearing the handle inside the
  callback would then be undone — which latched the guard and dropped every later
  resize. (Found by the unit suite.)
- A `0×0` or non-finite box is **ignored**, keeping the previous size. The
  finiteness check matters as much as the sign one: a `NaN` passes `<= 0` and
  poisons every downstream path coordinate.
- Disconnects the observer, cancels the frame and clears the settle timer on
  unmount. No network, no persistence, no dashboard state.
- Below a minimum drawable box the surface renders **nothing** rather than a
  scribble (`48×32` for axed charts, `40×18` for sparklines).

## 6. Per-chart responsive rules

**Runs over time.** Paints into `width`/`height` in real pixels (`viewBox="0 0 w
h"`, no `preserveAspectRatio`). Margins from `lineChartMargins(width, height)`;
`v === max` lands exactly on `margins.top`, so a spike cannot be clipped, and the
last point lands on `width - margins.right`, so the line's right edge is visible.
Compact thresholds are declared once:

| | Compact (`width < 320`) | Wide |
| --- | --- | --- |
| Margins | `{ 6/8/14/24 }` (short) → `{ 10/8/20/24 }` | `{ 10/14/20/36 }` |
| Ticks | `2` under 90px, `3` under 130px | `4` |
| Value labels | thousands shorten to `1.8k` | full number |
| Category labels | trailing token only (`Jun 15` → `15`) | full label |
| Label step | `ceil(count / floor(innerWidth / 42))` | `… / 64` |

Zero points draw gridlines only; one point draws a dot (no line to draw); an
impossible box draws nothing.

**Sparklines.** Fill the card's width and the slack height of the stat body — the
readout and footer are `shrink-0`, so a 1×1 card squeezes the chart rather than
pushing the footer out of the card. Insets keep the first point, the last point
and the end dot inside the SVG.

**Donut.** `donutLayout({width, height, sliceCount})` decides orientation and
diameter together, from the one measurement — legend extent is arithmetic from
the slice count, so there is no nested observer. Side-by-side while
`min(width − 128, height) ≥ 92`, stacked below it. `diameter` is the inscribed
square, ring thickness is `15%` of it, and `outerRadius + strokeWidth/2` sits a
half-pixel inside the box so antialiasing stays off the boundary. The centre
readout's font size is derived from the inner radius so it cannot spill; the
sublabel drops below a 26px inner radius. Every value stays readable as text in
the legend at every size.

**Horizontal bars.** `label | bar | value` as
`minmax(0, labelMaxPx) minmax(0, 1fr) auto`. `labelMaxPx = clamp(56,
0.34 × width, 96 | 180)`; the bar fill is a percentage, never a pixel width. Rows
shrink toward an 18px floor before the count is reduced, and a body that cannot
hold every row shows **"+N more"** rather than silently dropping records or
slicing the last row. The note's allowance includes one more `rowGap` — omitting
it was a three-pixel overflow that the browser suite caught as a scrolling chart
body.

**Heatmap.**

```ts
cellSize = clamp(
  4,
  floor(min(
    (availableWidth  - gap * (columns - 1)) / columns,
    (availableHeight - gap * (rows    - 1)) / rows,
  )),
  30,
);
```

Cells stay **square** — a calendar heatmap stretched to fill the card reads as a
different chart — and the leftover space stays leftover. **Alignment decision:
the matrix is centred in both axes**, because a fixed-aspect grid almost always
has slack on one axis and centring reads as "this is the whole chart" where
top-left anchoring read as "something failed to fill the card". The 30px maximum
is more than double the old fixed 14px, so a large widget genuinely grows.

**Non-chart widgets.** `Recent runs` and the ranked table are lists, so they keep
their header and scroll their rows internally — the honest behaviour for a list
whose records must not be hidden. Charts never scroll.

## 7. Animation during resize

`animate` is false for 180ms after any size change and false permanently under
`prefers-reduced-motion: reduce` (checked once, in the surface). The bar fill's
width transition is the only animation in these charts; it is dropped while a
resize is in flight and carries `motion-reduce:transition-none`. Nothing replays
an entry animation per ResizeObserver callback, and no frames accumulate — at
most one is scheduled at a time.

## 8. Accessibility

Accessible names preserved or improved: each plot keeps `role="img"` with a real
`aria-label` (the sparkline's bogus `<title>{useId()}</title>` — which rendered a
React internal id as the accessible description — is gone). Truncated bar and
legend labels carry `title` with the full text. The donut's centre percentage,
every legend percentage, every bar value and every metric value remain text.
Reduced motion is respected. No responsive rule hides the only textual
representation of a value: when the donut's sublabel is dropped for room, the
value itself and the legend remain.

## 9. Layout and persistence: unchanged

Confirmed unchanged: canonical four-column persistence, explicit `x/y/w/h`,
deliberate gaps, compact projections, four-column-only editing, the active-edit
canonical lock, empty-cell and new-row targeting, push-down collisions,
preview-equals-commit, no automatic compaction, first-fit add, right-edge resize
refusal. Chart resizing does not route through the layout engine. No
`chartWidth` / `chartHeight` / `plotWidth` / `plotHeight` exists anywhere in
widget config or dashboard JSON — asserted by a test. No migration, backfill, row
rewrite, RLS change, new column or `db:push`.

## 10. Results

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint` (analytics paths + playwright config) | clean |
| `npm test -- tests/unit/core/analytics/` | **6 suites, 76 tests** passed |
| `npm test -- tests/unit/features/analytics/` | **41 suites, 906 tests** passed |
| `npm run test:analytics:layout` | **63 passed** (43 new chart cases + the 20 S4/S5 cases) |
| `npm run lint:structure` | pre-existing `docs/slices/phase-5` baseline only |
| `npm run lint:migrations` | clean |

New coverage:

- `tests/unit/core/analytics/chartSizing.test.ts` — 31 geometry property tests.
- `tests/unit/features/analytics/responsiveChartSurface.test.tsx` — 13 tests on
  the measurement seam (resulting dimensions, not "the observer was called").
- `tests/unit/features/analytics/chartResponsiveness.test.tsx` — 39 tests on each
  plot's emitted geometry plus the widget-shell contract.
- `tests/unit/features/analytics/chartResizeIntegration.test.tsx` — 8 tests on the
  shipping dashboard: remeasure on preset change and on projection change, round
  trip, widgets stay mounted, and **no request / no legacy conversion**.
- `tests/browser/analytics/chartSurfaces.spec.ts` — 43 Chromium cases.

## 11. Chromium evidence

Backend-free, double-gated, no Supabase / auth / Docker / new public route. The
existing harness route gained a fixture selector:

```bash
npm run test:analytics:layout
npm run test:analytics:layout -- tests/browser/analytics/chartSurfaces.spec.ts
```

`/dev-drag-harness?board=charts` mounts the real `AnalyticsDashboard` with 14
in-memory chart widgets covering **1×1, 2×1, 3×1, 4×1, 1×2 and 2×2**, with a
deliberate spike in `runsOverTime` so a clipped peak fails. The parameter selects
a fixture; it unlocks nothing.

Every chart is asserted `left/top/right/bottom` inside its body (1.5px
tolerance), and `scrollWidth ≤ clientWidth` / `scrollHeight ≤ clientHeight` on
every chart surface and body. Measured boxes at 1600px viewport:

| Widget | Surface | Painted chart |
| --- | --- | --- |
| `Runs over time` 2×1 | 575×88 | svg 575×88 (fills) |
| `Runs (wide)` 3×1 | 887×88 | svg 887×88 |
| `Runs (tall)` 1×2 | 264×292 | svg 264×292 |
| `By outcome` 2×1 | 575×111 | donut 111×111, legend beside |
| `Outcome (large)` 2×2 | 575×315 | donut 315×315 |
| `Activity (large)` 2×2 | 575×270 | matrix 525×228, **cell 30px** |
| `When your automations run` 3×1 | 887×66 | matrix 141×60, cell 6px |
| `Total runs` 1×2 | 264×232 | sparkline 264×232 |
| `Success rate` 1×1 | 264×28 | sparkline 264×28 |

The run also fails on uncaught exceptions and console errors (ResizeObserver
loops, SVG dimension errors, non-finite coordinates, React key/hydration
warnings), and asserts **zero** non-GET `/api/analytics` requests across a
4→3→2→1→4 round trip and during the active-edit lock.

## 12. Before / after assessment

Assessed from the backend-free harness, not from production.

| | Before | After |
| --- | --- | --- |
| `Runs over time` at 2×1 | SVG ~2.5× the body height; bottom axis and peak clipped | svg exactly 575×88; peak and both axes inside |
| Heatmap at 2×2 | 269×116 matrix in a 575×270 body (~22% of it) | 525×228 (~77%); cell 14px → 30px |
| Sparkline at 1×1 | 150px in a 264px card | 264px |
| Donut at 1×1 | fixed 150px box, side legend squeezed | 111px ring, legend stacked, nothing clipped |
| Bars at 4×1 | fixed 130px label column; rows overflowed a short card | label 180px, track 1fr, rows fit or say "+N more" |

Screenshots were not committed — the project has no test-artifact policy that
keeps them in source control, and `test-results/` is a local artifact.

## 13. Remaining visual limitations

1. **A wide, short heatmap stays small.** A 16×7 matrix of square cells in a
   3×1 or 4×1 body is height-bound: 66px of matrix room gives 6px cells even
   though 887px of width is free. Square cells and a full 16-week matrix are both
   deliberate, so this is geometrically forced rather than a sizing bug. The
   **default** heatmap widget is `l` (2×2), which is the reported case and which
   now reaches the 30px maximum. A user who narrows it to one row gets small
   cells.
2. **The 30px cell maximum** means a very large heatmap widget leaves slack
   around a centred matrix rather than growing indefinitely. Chosen for
   readability; it is far above the old fixed 14px.
3. **A 1×1 line chart is dense.** Two-series legend plus axes in an 88px plot is
   legible but tight; the compact rules thin the ticks rather than shrinking type.
4. **Insight charts** now use the shared hook and their measured height, but
   their internal presentation (legend placement, tooltip anchoring) was not
   otherwise redesigned in this slice.

## 14. Not done here

No production verification: this is local work against the backend-free harness.
The S5 production-certification items remain open and are unaffected.
