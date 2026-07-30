# Explicit layout S4 — editor integration (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1)

**Status:** implemented locally. **NOT deployable — see §11.**

> **§11's blocker is closed by S5** — responsive projection is implemented in
> [`analytics-explicit-layout-s5-responsive-projection.md`](./analytics-explicit-layout-s5-responsive-projection.md).
> Everything else below stands as the historical S4 result.
**Date:** 2026-07-29
**Production baseline:** compatibility reader live at `a675a14000a03c7c988e930401366228f53b40a2`
**Preceded by:** [audit](./analytics-edit-mode-layout-audit.md) · S1 `0343e7065` ·
[S2](./analytics-explicit-layout-s2-contract.md) `97c72907a` ·
[S2.5](./analytics-explicit-layout-s2-5-boundary-realign.md) `4f3503e8f` ·
[S3](./analytics-explicit-layout-s3-render-seam.md) `c51e652ba`

---

## 1. What changed

The Analytics editor now runs on explicit rectangles end to end. The destination
is a **place**, not another widget's card, so every valid cell is reachable —
including the holes the audit showed were permanently untargetable.

| Concern | Path |
| --- | --- |
| Shipping page | `features/analytics/AnalyticsDashboard.tsx` → `grid/AnalyticsExplicitGrid` |
| Edit-session rules (pure) | `features/analytics/grid/layoutEditState.ts` |
| Pointer → cell (pure) | `features/analytics/grid/candidateRect.ts` |
| Drag session | `features/analytics/grid/useExplicitDragSession.tsx` |
| Overlay | `features/analytics/grid/DragOverlayGhost.tsx` |

Retired: `useWidgetDragSession.tsx`, `useGridReflow.ts`, `SIZE_GRID_CLASS`, and
the dashboard's `grid-auto-flow` container. `computeDragPreview` / `hitTestSlot`
remain in `dashboardHelpers.tsx` **only** as the audit diagnostic's executable
record of why the ordered model could not work; no production code calls them.

---

## 2. Effective-layout initialization

`normalizeDashboardWidgets` runs at render against the committed board.

- **Legacy board** (no `layout`): rectangles derived deterministically at four
  columns from order + size. Deriving is not writing — the stored widgets are
  untouched and the board stays legacy in storage.
- **Explicit board**: persisted coordinates used verbatim; gaps preserved, no
  compaction, no reordering.
- **Damaged board**: repaired fallback, every widget preserved.

View mode and edit mode render from the **same** model; there is no second layout
path.

---

## 3. Edit-state ownership

One pure module, `layoutEditState.ts`, owns every rule:

```ts
{ savedWidgets, savedLayout, workingWidgets, workingLayout, layoutSource }
```

`beginEdit` copies saved → working. `cancelEdit` restores saved. `afterSave`
adopts the server's response. Rendering during edit uses `workingLayout`; a
failed save leaves it untouched.

**`layoutDirty` is computed, never latched.** Working rectangles are compared to
saved ones by widget id, so a widget moved and put back leaves the board clean —
and a legacy dashboard stays legacy. `contentDirty` is separate (title, size,
icon, config).

---

## 4. Candidate calculation

Frozen at drag start: the grid's viewport origin, its measured width, the grab
offset, and the dragged widget's footprint. Per move:

```
localLeft = pointerX − gridLeft − grabDx
localTop  = pointerY − gridTop  − grabDy
x = round(localLeft / (columnWidth + 14))     // nearest cell
y = round(localTop  / (190 + 14))
x clamped to [0, 4 − w];  y clamped to ≥ 0
```

**Nearest-cell rounding**, so the candidate flips when the card's own top-left
crosses the half-way point of a track — what the user sees is what they get.
Width and height are never changed to make something fit; `y` is unbounded
below, so a pointer under the board yields a real new row.

---

## 5. Drag-start snapshot and preview-equals-commit

```ts
preview = placeWidget(dragStartLayout, draggedId, candidate, { columnCount: 4, collisionPolicy: "push-down" })
```

Always from the **drag-start** snapshot, never from the previous preview. The
engine deliberately leaves displaced widgets where it pushed them, so chaining
previews would ratchet the board downward as the pointer wandered. Recomputing
from the snapshot is what makes "move across several targets, come back, drop"
land exactly where it started — proven in both jsdom and Chromium.

On release the working layout becomes **the last previewed layout**. There is no
second algorithm, no array splice, and no re-derivation from whatever card is
under the pointer. A drag that ends on its starting rectangle commits nothing, so
it cannot convert a legacy board.

Collision is the engine's unchanged push-down policy: down only, `x` preserved,
minimum rows, deterministic cascade, no automatic compaction, unrelated widgets
untouched.

---

## 6. Add-widget bridge

`findFirstAvailableRect(workingLayout, footprintForSize(size), 4)` — the widget
and its rectangle are added **atomically**, so a widget can never exist without a
placement. A new widget reuses a gap inside the board instead of always being
appended. Adding marks the layout dirty, so it converts a legacy board.

---

## 7. Resize bridge

`resizeWidgetToFootprint` — the same engine, the same push-down policy. `size`
and `layout.w/h` move together or not at all. Shrinking preserves the gap it
opens. A preset that would cross the right edge at the widget's current column is
**disabled in the dropdown**, with the tooltip:

```
Move this widget left to use this size.
```

A refused resize returns a typed reason and leaves state unchanged; the widget is
never silently slid left.

---

## 8. Persistence intent

| Situation | Intent |
| --- | --- |
| Legacy board, no layout change | `preserve-source` |
| Legacy board, title-only edit | `preserve-source` |
| Legacy board, config-only edit | `preserve-source` |
| Drag returned to its origin | `preserve-source` |
| Real drag / add / resize | `persist-explicit-layout` |
| Board already persisted | `persist-explicit-layout` |

Explicit saves carry a rectangle for **every** widget and are validated as a whole
board by the serializer before sending; a partial or invalid board is a typed
refusal, never a silent repair. A save failure keeps the user in edit mode with
their arrangement intact and surfaces the existing error banner. A **Cancel**
button was added so leaving without saving is explicit.

---

## 9. Writer-boundary guards

The S2/S3 blanket ban would now either be deleted or be a lie, so it is replaced
with **ownership** guards (`explicitLayoutRolloutGuard.test.ts`, 10 tests):

- only `layoutEditState.ts` and the serializer name `persist-explicit-layout`;
- `saveIntent` must consult `isLayoutDirty` (a version that always returns the
  explicit intent would convert every legacy board on first save);
- no read path (`normalizeDashboardWidgets`, `legacyMigration`,
  `services/analytics/dashboards`) can reach the serializer;
- API routes never decide intent;
- no component hand-builds a `layout: { x: … }` literal — placement reaches
  storage only through the validating serializer;
- the dashboard sends `payload.widgets`, never a hand-assembled array;
- the ordered drag model is absent from production code.

---

## 10. Tests

| Suite | Tests |
| --- | --- |
| `layoutEditState.test.ts` (edit rules, intent, add, resize, candidate maths) | 34 |
| `explicitEditorIntegration.test.tsx` (real component, real pointer events) | 27 |
| `explicitLayoutRolloutGuard.test.ts` (ownership) | 10 |
| Engine (`tests/unit/core/analytics/layout/`) | 106, unchanged |
| **Chromium** `tests/browser/analytics/explicitLayout.geometry.spec.ts` | **14** |

### Backend-free Chromium harness

`playwright.analytics.config.ts` + `npm run test:analytics:layout`. No
`globalSetup`, no auth, no Supabase, no Docker, **no new public route** — it
drives the existing double-gated `/dev-drag-harness`, which mounts the real
dashboard with in-memory widgets. The harness board was extended to explicit
placement with mixed footprints and a deliberate hole at row 0 column 2.

Verified in a real browser: 1×1 = one 190px row; 2×1 = two columns + one gap;
2×2 = two rows + one gap (394px); the hole is genuinely empty
(`elementFromPoint` finds no widget); the overlay stays under the grabbed point
while moving right; moving right does not release early and moving left keeps
capture; dropping into the empty cell moves nothing else; a new row below the
board commits; a 1×1 into the 2×2 pushes it down keeping its column; a 2×1 onto
two 1×1s pushes both down and leaves the widget outside the chain alone; moving
through a collision and back restores every rectangle; Escape restores and clears
both overlay and placeholder; the placeholder footprint always equals the dragged
widget's.

---

## 11. Why this is not deployable

**Responsive projection is not implemented.** The canonical four-column grid is
rendered at every viewport width, so on a narrow screen the board does not reflow
— columns simply become narrow. This is a real visual regression for small
screens and is the reason the batch must not be pushed.

The deliberate non-solution: do **not** fall back to ordered auto-flow at small
widths once explicit layouts exist. That would reintroduce two layout models and
the preview/commit divergence the whole arc removes. The fix is a render-time
projection of the canonical layout (a later stage), which never writes back.

Also unaddressed here, by instruction: Tidy up, automatic compaction, persisted
breakpoints, free-form pixel placement, resize handles, keyboard drag redesign.

---

## 12. Rollback floor

```
Once explicit layouts are written in production,
rollback may not go below a675a14000.
```

That build is the first that can READ `layout`. Nothing in this batch writes to
production, so the floor has not moved yet — it moves the moment a writer
release ships.

---

## 13. Remaining work before deployment

1. Responsive projection (render-time only, never persisted).
2. Production verification the compatibility release could not close: no-change
   save, title/config-only save, explicit save/reload, mixed-size drag in prod.
3. Recovery-rate observability (`partial-layout`, `repaired-fallback`).
4. A production Analytics smoke path — the authenticated smoke suite has no
   `/analytics` coverage and its sign-in is blocked by Turnstile.
