# Explicit layout S3 — the render seam (ANALYTICS-EXPLICIT-LAYOUT-S3-RENDER-SEAM-1)

**Status:** accepted and implemented (local only).
**Date:** 2026-07-28
**Preceded by:** [audit](./analytics-edit-mode-layout-audit.md) · S1 `0343e7065` ·
[S2 contract](./analytics-explicit-layout-s2-contract.md) `97c72907a` ·
[S2.5 boundary realign](./analytics-explicit-layout-s2-5-boundary-realign.md) `4f3503e8f`
**Scope:** an explicit grid renderer and its view-model boundary. **Not wired
into the shipping page. Writes nothing.**

---

## 1. What S3 built

A grid that draws a board from real rectangles. Every card is placed by grid
LINE, so what is on screen is exactly `x/y/w/h` and nothing else gets a vote —
no auto-placement, no `dense`, no reliance on DOM order. A deliberately empty
cell stays empty.

| Thing | Path |
| --- | --- |
| Renderer | `features/analytics/grid/AnalyticsExplicitGrid.tsx` |
| View-model adapter | `features/analytics/grid/buildAnalyticsGridItems.ts` |
| Geometry constants + placement style | `features/analytics/grid/gridGeometry.ts` |

Ownership is unchanged from S2.5: `contracts/` owns the persisted shape,
`core/analytics/layout/` owns every piece of arithmetic, `features/analytics/`
owns React. The adapter delegates overlap, bounds and duplicate-id checking to
the engine's `validateLayout` and reads footprints from the contract's size map.
Nothing was duplicated.

---

## 2. The view-model adapter and how it fails

```ts
buildAnalyticsGridItems(widgets, layout, { columnCount? }): AnalyticsGridItemsResult
// ok:true  → items: { widget, placement, originalIndex }[]  — one per widget
// ok:false → problems: { code, widgetIds, message }[]       — ALL of them
```

Codes: `missing-placement` · `orphan-placement` · `duplicate-widget-id` ·
`duplicate-placement-id` · `size-layout-mismatch` · `invalid-layout`.

**It refuses rather than improvises.** The old renderer's defining failure was
that a widget with no usable position still appeared *somewhere*, because CSS
auto-flow always has an answer — that is how the arrangement on screen drifted
away from the stored one. Here an unmatched widget is a typed failure, never a
silently-omitted or silently-relocated card, and the failure result carries no
items at all: there is no partial success to render.

Problem messages name widget ids only — never a title, config or note.

---

## 3. CSS placement mechanism

```tsx
style={{
  gridColumnStart: placement.x + 1,
  gridColumnEnd:  `span ${placement.w}`,
  gridRowStart:    placement.y + 1,
  gridRowEnd:     `span ${placement.h}`,
}}
```

Grid lines are 1-based, so `x = 0` is column line 1. The container declares
`grid-template-columns: repeat(4, minmax(0, 1fr))`.

Explicitly **not** used: absolute pixel coordinates, transforms, cell-simulating
margins, DOM order, auto-placement, `dense`, or per-widget hardcoded classes.

Each placement is mirrored onto `data-grid-x/y/w/h` on the cell, so S4's drag
system and the tests can read the intended rectangle without parsing CSS.

---

## 4. Row geometry — the decision

```
--analytics-grid-row-height: 190px;   grid-auto-rows: var(--analytics-grid-row-height);
--analytics-grid-gap:        14px;    gap: var(--analytics-grid-gap);
```

Both match the shipping grid exactly (`gap-3.5` = 14px, 190px rows), so a board
renders at the same size in either renderer.

**The change is `minmax(190px, auto)` → a fixed `190px`.** The engine treats `h`
as a count of equal rows; a row whose height depends on its content would make
the engine's arithmetic and the rendered pixels disagree, and the drag system
that measures this grid in S4 would inherit that as jitter. Each cell is
`min-h-0 overflow-hidden` so one tall card cannot redefine its track — without
both, a single widget silently moves every cell coordinate below it.

Height of an `h`-row footprint is `h × 190 + (h − 1) × 14` — the pixels between
rows are gaps, not rows. Exposed as `rowSpanHeightPx(h)`.

**Trade-off, recorded honestly:** content taller than its footprint is now
bounded by the cell rather than growing it. This is consistent with the existing
widget design, whose card is already `overflow-hidden` with a `min-h-0 flex-1`
body — the cards were never *intended* to grow. What changes is that they now
*cannot*. If a widget type turns out to need more room, the answer is a larger
footprint or internal scrolling, not a taller track.

---

## 5. DOM and accessibility order

Widgets render in visual reading order: placement `y`, then placement `x`, then
the widget's original array index, then widget id. Keyboard and screen-reader
traversal therefore follows top-to-bottom, left-to-right.

The persisted widget array is never mutated to achieve this — the adapter sorts a
copy. React keys are widget ids, so a layout-only move reorders DOM nodes without
remounting a widget; a component keeps its identity and its state. (Tested: two
widgets swap columns, DOM order reverses, neither remounts.)

In a valid board no two widgets share a cell, so `y`/`x` always decides; the
remaining keys exist so an unusual board still has exactly one answer.

---

## 6. Deliberate gaps

Preserved, by construction: every card is placed by explicit line, so nothing
flows into a hole. No `dense`, no compaction, and placements are never derived
from rendered DOM order.

Proven for the brief's example —

```
A | · | B | B
C | · | B | B
```

— including a positive assertion that **no** cell renders at column 2, plus an
empty row area, and that a later widget is not pulled up into an earlier hole.

---

## 7. Mixed footprints

`1×1`, `2×1`, `3×1`, `4×1`, `1×2` and `2×2` each render at exactly their
rectangle, plus a six-widget mixed board (`3×1`+`1×1` / `2×1`+`2×2` / `1×1`+`1×2`)
asserted cell-by-cell, a small widget below part of a wide one, and a valid gap
beside a large one.

---

## 8. Placeholder seam

```ts
type AnalyticsGridPlaceholder = GridRect & { widgetId?: string; label?: string }
```

Presentation only. It uses the same explicit coordinates as widgets, occupies the
exact candidate footprint, is `pointer-events-none` and `aria-hidden` (so it can
never be its own drop target), takes no part in placement, cannot displace or
reorder a widget, and disappears when `null`. Moving it does not change widget
order. No pointer behaviour was implemented; the existing drag placeholder in
`Widget.tsx` was left alone.

**Overlay seam:** the grid applies no transform, perspective or filter, and no
utility class that would create one — so S4's `position: fixed` drag overlay
keeps resolving against the viewport. The grid is `position: relative`, making it
the offsetParent for grid-local pointer maths, exactly as the shipping grid is.

---

## 9. Why the shipping page was not switched

Rendering and dragging have to change together. A page that renders explicit
rectangles while the drag session still permutes an array would spend a release
in a half-converted edit mode: the preview would come from one model and the
commit from the other — the precise failure this whole arc exists to remove. S4
switches both in one batch.

No public test page was added, and no environment variable was introduced to hide
unfinished rendering. The renderer is reached only by its tests.

---

## 10. Why S4 still may not write

The S2/S2.5 compatibility reader has **not been deployed**. Persisting `layout`
is a one-way door: once production rows carry the field, rolling back to a build
whose strict parser rejects it is no longer safe. Nothing in S3 persists layout,
enables explicit drag commits, changes the `Done editing` payload, or converts a
legacy dashboard on save.

### The rollout guard now distinguishes three states

`tests/unit/features/analytics/explicitLayoutRolloutGuard.test.ts` — widened, not
weakened:

| State | Status | Guard |
| --- | --- | --- |
| Reading x/y inside the prepared seam | **allowed now** | confined to `features/analytics/grid/` and the engine; anywhere else fails |
| The shipping page importing the renderer | **blocked until S4** | no shipping module may import `features/analytics/grid`; plus a positive assertion that `AnalyticsDashboard.tsx` still renders the ordered auto-flow grid and does not mention `AnalyticsExplicitGrid` |
| Writing explicit layout | **blocked until the reader is live** | nothing outside the serializer may ask for `persist-explicit-layout` |

Each boundary is crossed by moving a path into the right allow-list, not by
deleting a test.

---

## 11. Tests

| Suite | Tests |
| --- | --- |
| `tests/unit/features/analytics/buildAnalyticsGridItems.test.ts` | 18 |
| `tests/unit/features/analytics/AnalyticsExplicitGrid.test.tsx` | 40 |
| `tests/unit/features/analytics/explicitLayoutRolloutGuard.test.ts` | 5 (was 2) |

Every renderer test reads the placement a browser would actually use — the grid
line and span on the rendered element — not an internal call.

### Browser evidence, and its limitation

**jsdom does not lay out CSS Grid.** The component tests prove the *instructions*
are exact; they cannot prove a browser turns them into the right rectangles.

The repo has no backend-free Playwright harness to close that gap: there is a
backend-free drag-harness *route* (`E2E_DRAG_HARNESS`), but `playwright.config.ts`
starts `npm run dev` wired to local Supabase and runs a `global-setup`, so the
runner is not backend-free. Per this batch's constraints (no Docker, no Supabase,
no authenticated Playwright) no committed browser test was added.

Instead the geometry was verified **once, locally**, with a throwaway script that
launched the repo's already-installed Chromium and measured the CSS via
`page.setContent` — no server, no route, no Supabase, no auth. It is **not
committed**; its measurements are recorded here so the claim is checkable:

| Cell | Rect | Measured (left, top, w, h) | Expected |
| --- | --- | --- | --- |
| `a` | 0,0,1,1 | 0, 0, 190, 190 | ✅ |
| `b` | 1,0,1,1 | 204, 0, 190, 190 | ✅ |
| `wide` | 0,1,2,1 | 0, 204, 393, 190 | ✅ |
| `big` | 2,1,2,2 | 407, 204, 393, **394** | ✅ |
| `tall` | 0,2,1,2 | 0, 408, 190, **394** | ✅ |
| placeholder | 2,0,1,1 | 407, 0, 190, 190 | ✅ |

Grid width 800px, four columns, 14px gaps. The two `394`s confirm the row-span
formula (`2 × 190 + 14`) — the value S4's drag maths depends on. Row 0 column 2
was measured as occupied by **no widget**, confirming the deliberate gap.

**Recommendation:** S4 should add a committed browser geometry test. The cheapest
honest route is a small Playwright project whose `testDir` is a new geometry
folder with no `webServer` and no `globalSetup`, driving `page.setContent` — it
would need no infrastructure at all. That is new repo surface this batch was not
asked to add.

---

## 12. S4 entry gate

S3 passing locally does **not** unblock S4. All of these must hold first:

1. The S2/S2.5 compatibility reader is **deployed to production**.
2. Production reads legacy dashboards successfully.
3. No widget-loss diagnostics appear (`unparseable-widget`).
4. No malformed-layout recovery spike appears (`repaired-fallback`,
   `partial-layout`, `invalid-layout-field`).
5. The rollback window is accepted, or the pre-`layout` deployment is no longer a
   viable rollback target.
6. **Full repository typecheck is green** — currently it is not, for reasons
   outside this arc (see the batch report).
7. The S3 explicit renderer is green and ready — ✅ as of this commit.
8. S4 can switch renderer and drag state together in one coherent batch.

Items 1–5 are deployment facts that cannot be established from a local branch.
