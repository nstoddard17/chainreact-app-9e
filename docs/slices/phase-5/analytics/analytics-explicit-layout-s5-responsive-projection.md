# Explicit layout S5 — responsive projection (ANALYTICS-EXPLICIT-LAYOUT-S5-RESPONSIVE-PROJECTION-1)

**Status:** implemented locally. Not pushed, not deployed.
**Date:** 2026-07-29
**Production baseline:** compatibility reader live at `a675a14000`
**Preceded by:** [audit](./analytics-edit-mode-layout-audit.md) · S1 `0343e7065` ·
[S2](./analytics-explicit-layout-s2-contract.md) · [S2.5](./analytics-explicit-layout-s2-5-boundary-realign.md) ·
[S3](./analytics-explicit-layout-s3-render-seam.md) ·
[S4](./analytics-explicit-layout-s4-editor-integration.md) `ea1ca6d72`
**Followed by:** [responsive chart surfaces](./analytics-responsive-chart-surfaces-1.md) — S5 sized the CONTAINERS correctly; the charts inside them still carried fixed
desktop dimensions, which that slice fixes. No layout or persistence rule changed.

---

## 1. What S5 adds

Narrow screens now get a readable board. **One layout is still persisted** — the
canonical four-column arrangement — and every narrower view is a derivation
computed on render and thrown away. This closes the blocker S4 recorded.

| Concern | Path |
| --- | --- |
| Projection arithmetic (pure) | `core/analytics/layout/project.ts` |
| Container measurement + gating | `features/analytics/grid/useResponsiveGrid.ts` |
| Canonical vs render placement | `features/analytics/grid/buildAnalyticsGridItems.ts` |
| Renderer | `features/analytics/grid/AnalyticsExplicitGrid.tsx` |

## 2. Canonical rule

`ANALYTICS_CANONICAL_COLUMNS = 4` is the only persisted geometry. No mobile,
tablet, per-breakpoint or projected coordinates are stored — enforced by a
structure guard that bans `mobileLayout` / `layoutsByBreakpoint` and any
breakpoint-shaped field in the contract.

## 3. API

```ts
projectLayoutToColumns(canonical, 1 | 2 | 3 | 4): LayoutResult
columnsForContainerWidth(width): 1 | 2 | 3 | 4
ANALYTICS_MIN_CELL_WIDTH_PX          // 220
ANALYTICS_CANONICAL_MIN_WIDTH_PX     // 922 = 4×220 + 3×14
```

## 4. Target columns and the minimum cell

```
possible = floor((width + 14) / (220 + 14))
columns  = clamp(possible, 1, 4)
```

**220px** is the measured floor for the shipping card: the header holds the
grip, icon, a truncated title and up to four edit controls without wrapping, and
still leaves a usable body. Four of them plus three gaps need **922px of grid** —
inside a 1280px desktop once the sidebar and page padding are removed, and
deliberately outside a tablet. One definition; no scattered breakpoint numbers.

An unmeasured, zero or nonsense width falls back to **canonical**, not to one
column: a brief too-wide board is honest, a brief phone layout on a desktop reads
as broken.

## 5. Why container width, not viewport width

The grid sits inside a page with a sidebar and padding, so `window.innerWidth`
answers a different question: two users at the same window size can have very
different grids. A `ResizeObserver` watches the element itself — there is no
global resize listener.

## 6–9. Behaviour per width

- **Four** — the canonical layout, returned **by reference**. Exact coordinates,
  deliberate gaps preserved, no compaction, no reordering.
- **Three / two / one** — deterministic repack: canonical **visual reading
  order** (`y`, `x`, array index, id), width clamped to `min(w, columns)`,
  height untouched, placed by top-to-bottom left-to-right first fit.

Projection is **not** the placement engine — no push-down against canonical
coordinates. Push-down would try to preserve positions that cannot survive
narrowing and would leave holes and stragglers.

## 10. Canonical vs render placement

```ts
type AnalyticsGridItem = { widget; canonicalPlacement; renderPlacement; originalIndex }
```

`canonicalPlacement.w/h` must match the size preset — that check was **not**
weakened. `renderPlacement` may be narrower purely because of projection. The
serializer, dirty comparison and pointer editing all use canonical only; the
renderer uses `renderPlacement`. Both are mirrored onto the cell as
`data-grid-*` and `data-canonical-*`. Structure guards assert the serializer,
edit state and drag session never mention `renderPlacement` or the projector.

## 11–13. Clamping, ordering, gaps

A widget wider than the target becomes full-width; height is never clamped. Order
follows the canonical **visual** reading order, not the persisted array order
(they can differ). At four columns a deliberate gap is authored intent and is
preserved; below four a gap is just wasted screen, so the projection compacts —
safe precisely because it cannot travel back.

## 14–15. Editing needs four columns

Below four columns the edit control is genuinely `disabled`, with the tooltip and
an adjacent note: **"Use a wider window to rearrange this dashboard."** Widgets
stay visible; nothing is hidden and nothing implies breakage. Grip, resize and
add are edit-mode only, so they are absent by construction.

**Active-edit lock:** if the window narrows during a session the grid stays at
four columns with the working canonical rectangles, gains `overflow-x-auto` and a
`min-width` of 922px, and shows a notice — "Your full four-column layout stays on
screen while you edit — scroll sideways to reach the rest of it." The board must
never move under the pointer because a breakpoint changed. Normal projection
resumes on save or cancel.

## 16. Resizing changes nothing

Tested: no `updateDashboard` call at any width; no dirty state; canonical
rectangles identical after 4 → 1 → 2 → 4; deterministic under repeated
oscillation; no component remount; a legacy board still saves as
`preserve-source` after narrowing, and after narrowing *during* an edit session.

## 17–19. Legacy, explicit, repaired

All three project identically — the source is whatever effective canonical layout
normalization produced. A legacy board never gains a `layout`; an explicit board
keeps its exact coordinates; a repaired fallback renders responsively without
persisting the repair. Projection is not a migration mechanism.

## 20. Renderer

`AnalyticsExplicitGrid` now takes `renderColumnCount` and an optional
`renderLayout`, and emits `repeat(N, minmax(0, 1fr))`. Still explicit grid lines
only — no auto-flow, no `dense`, no DOM-order positioning, no span classes, no
absolute positioning. 190px rows and 14px gaps unchanged; a two-row widget is
still 394px.

## 21. Hydration / first paint

`measured` starts false and the column count starts **canonical**, so server and
first client render agree and no widget is ever drawn at an invalid coordinate.
The observer fires on observe, so the real count lands before paint in practice.

## 22. Results

Unit/component: projection **30**, responsive component **22**, plus the S4
suites unchanged. Chromium: **20 passed** — the 14 S4 cases plus four/three/two/
one-column projection, the resize round trip (with a route assertion proving
**zero** non-GET requests), and the active-edit lock.

## 23. Rollback

```
Once explicit layouts are written in production,
rollback may not go below a675a14000.
```

## 24. Remaining before deployment

Production certification the compatibility release could not close: no-change
save, title/config-only save, explicit save/reload and mixed-size drag against
real data; recovery-rate observability (`partial-layout`, `repaired-fallback`);
and an Analytics production smoke path (the authenticated suite has no
`/analytics` coverage and its sign-in is Turnstile-blocked).
