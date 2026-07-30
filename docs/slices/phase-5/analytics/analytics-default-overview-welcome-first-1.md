# Default Overview: welcome first (ANALYTICS-DEFAULT-OVERVIEW-WELCOME-FIRST-1)

**Status:** implemented locally. Not pushed, not deployed, no PR.
**Date:** 2026-07-29
**Preceded by:** [S4 editor integration](./analytics-explicit-layout-s4-editor-integration.md) ·
[S5 responsive projection](./analytics-explicit-layout-s5-responsive-projection.md) ·
[responsive chart surfaces](./analytics-responsive-chart-surfaces-1.md)

---

## 1. What changed

`Welcome to your dashboard` is now the **first and top-left** widget of every
newly created default Overview board.

| | Position | Canonical rect |
| --- | --- | --- |
| Before | **last** of 11 — row 4, right half, under five rows of charts | `x: 2, y: 4, w: 2, h: 1` |
| After | **first** of 11 — the board's top-left cell | `x: 0, y: 0, w: 2, h: 1` |

Nothing else about the widget changed: same id (`ov-note`), type (`note`), size
(`m` = 2×1), icon (`Sparkle`), title and note text. No copy, config or styling
edit is in this batch.

## 2. Canonical default source

**One definition:** [`contracts/analyticsDefaults.ts`](../../../../contracts/analyticsDefaults.ts)
→ `DEFAULT_OVERVIEW_WIDGETS`.

Every path that can produce a default board reads that constant:

| Path | Where | What it does |
| --- | --- | --- |
| First Analytics visit / account seed | `services/analytics/dashboards.ts` → `listOrSeedDashboards` | Seeds `Overview` when the account has no dashboards |
| Restore default layout (user-triggered) | `features/analytics/AnalyticsDashboard.tsx` → `restoreDefaultLayout` | Rewrites the DEFAULT board through the ordinary atomic PATCH |
| Browser harness fixture | `features/analytics/testing/AnalyticsDragHarness.tsx` | Imports the constant — does not copy it |

Audited and confirmed **not** default-producing: `createDashboard` (service +
`POST /api/analytics/dashboards`) creates a *non-default* board with
`widgets: input.widgets ?? []` — an empty board, never the default inventory.
There is no dashboard cloning and no template application for dashboards. The
only production file naming the default order is the contract itself; the other
files that mention `ov-*` ids are tests pinning it on purpose.

## 3. Legacy-derived, not explicitly placed

New defaults remain **legacy form** — no `layout` field on any default widget.
Array order plus `size` is the whole positional signal, and the read chokepoint
derives canonical rectangles in memory via
`migrateLegacyOrderedLayout(widgets, { columnCount: 4 })`.

So **"welcome first" is expressed as array position**, and first-fit is what turns
that into `x: 0, y: 0`. This batch adds no explicit placement, writes no `layout`
field, and leaves the two representations in agreement because there is only one:
a test asserts every default widget still lacks `layout`, so a future batch that
starts writing explicit defaults has to reconcile the two deliberately instead of
letting them drift.

## 4. The resulting four-column board

```
row 0:  note     note     runs     success
row 1:  active   duration outcome  ·
row 2:  overtime overtime overtime ·
row 3:  top      top      heatmap  heatmap
row 4:  apps     apps     heatmap  heatmap
row 5:  recent   recent   ·        ·
```

Remaining widgets keep their **existing relative order** and their **existing
size presets**, and are placed by the engine's deterministic first-fit — no
hand-authored coordinates, no special cases, no widget reordered or resized.

**Recorded consequence, not a defect:** the board grows from 5 rows to 6 and gains
four empty cells (`3,1` · `3,2` · `2,5` · `3,5`). Leading with a 2-wide widget
means the 3-wide `Runs over time` no longer fits beside the four 1×1 stat tiles.
The old note-last order packed 20 column-units into 5 exact rows; the audit
already called that luck rather than design. Under the explicit-layout model
those cells are **deliberate empty space a user can drag into**, which is exactly
what S3/S4 shipped. Removing them would require changing the welcome widget's
size or another widget's order — both explicitly out of scope here, and both a
product decision rather than an implementation one.

## 5. Existing dashboards are not touched

- **No backfill, no row rewrite, no migration, no `db:push`.**
- Reading never writes: `normalizeDashboardWidgets` returns the widgets exactly
  as stored plus a *separate* effective layout. A stored board with the note last
  still derives the note at `2,4`, and its reading order still starts with
  `ov-runs`.
- A board with explicit placement is used verbatim (`layoutSource: "persisted"`),
  so a welcome widget a user moved stays where they put it.
- Normalization is handed widgets, never a dashboard name — a board titled
  `Overview` cannot be rewritten on that basis. There is no code path from a
  title to the default inventory.
- Saving a customized board serializes that board, not the default.

The change reaches an existing dashboard only through the **explicit,
user-triggered** "Restore default layout", which already required confirmation
before this batch and still does ("Restore the default layout?" → *Restore
layout*, with Cancel leaving the board untouched). It is offered only on the
default dashboard and only to managers. No reset happens on load, and no reload
is treated as a reset. No new reset feature was added.

## 6. Responsive reading order

The canonical board stays four columns; narrower views are derived at render and
thrown away. The welcome widget is first at **4, 3, 2 and 1** columns, at
`x: 0, y: 0` in each, because projection re-packs from canonical reading order and
it leads that order. At one column it clamps to `w: 1`. No projection is ever
persisted, and resizing the browser issues no request.

## 7. Results

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint` (contracts · core · features · services · app/api · harness route · tests) | 0 errors; 2 pre-existing `max-lines` warnings in files this batch did not touch |
| `npm test -- tests/unit/core/analytics/` | **11 suites, 299 tests** passed |
| `npm test -- tests/unit/features/analytics/` | **37 suites, 683 tests** passed |
| `npm test -- tests/unit/services/analytics/` | **83 suites, 1137 tests** passed |
| `npm run test:analytics:layout` | **71 passed** (9 new default-board cases + 62 existing) |
| `npm run lint:structure` | pre-existing `docs/slices/phase-5` baseline only (51 at `origin/v2-main` and at HEAD; this batch's doc went into the `analytics/` subfolder) |
| `npm run lint:migrations` | clean |

**New coverage**

- `tests/unit/core/analytics/defaultOverviewBoard.test.ts` — 30 tests: inventory
  (welcome first, type/size/copy unchanged, unique ids, count 11, non-welcome
  relative order, still legacy form), four-column placement (`0,0`, full
  footprint, nothing above/left, no overlap, board validates, deterministic,
  viewport-independent, no partial layout), projections at 4/3/2/1, and
  existing-dashboard protection.
- Three assertions added to the pinned default rectangles in
  `legacyMigration.test.ts` and `normalizeDashboardWidgets.test.ts`, plus a
  "derives without writing placement" test.
- `dashboards.test.ts` — the seed payload leads with `ov-note`, carries no
  `layout`, and is identical for every caller.
- `dashboardActions.test.tsx` — restore-default's PATCH leads with `ov-note` and
  writes no placement.
- `tests/browser/analytics/defaultOverviewBoard.spec.ts` — 9 Chromium cases.

**Updated, with the reason recorded in the test:**
`dashboardLayoutModelDiagnostic.test.ts` deliberately pins the old sparse
auto-flow model's hole positions "so that a future layout change which removes
them fails loudly here instead of silently invalidating the audit document" — and
it did. Its two default-board assertions now carry the new numbers, note that the
audit's originals (`1,1 · 2,1 · 2,4…2,8`) were measured against the note-last
order, and state that the *finding* is unchanged. The board no longer packs
cleanly at four columns even under the retired model, which that test now says
outright rather than continuing to claim the opposite.

## 8. Browser evidence

Backend-free, double-gated, no Supabase / auth / Docker / new public route. The
existing harness route gained a third fixture selector:

```bash
npm run test:analytics:layout
npm run test:analytics:layout -- tests/browser/analytics/defaultOverviewBoard.spec.ts
```

`/dev-drag-harness?board=default` mounts the real `AnalyticsDashboard` with
`DEFAULT_OVERVIEW_WIDGETS` **imported verbatim**, in the same legacy form the
server seeds — so a reorder cannot pass in the browser while failing in
production. Asserted: all 11 widgets render exactly once; the welcome card's left
and top edges align with the grid's own corner within 1.5px; no card renders above
it or to its left; it spans exactly two column tracks plus the gap; its title is
visible; no two cards overlap anywhere; every card stays inside four columns;
rendering writes nothing; and at 3, 2 and 1 columns welcome stays at `0,0` with
canonical coordinates unchanged and **zero** non-GET `/api/analytics` requests
across the whole round trip.

## 9. Not done here

No production verification — this is local work against the backend-free harness.
No existing dashboard, production row, or database object was touched.
