# Analytics edit-mode layout audit (ANALYTICS-EDIT-MODE-LAYOUT-AUDIT-1)

**Status:** audit + architecture recommendation. No layout system was replaced.
**Date:** 2026-07-28
**Branch:** `react-agent-guided-build-1-work` (identical to `origin/v2-main` at audit start)
**Scope:** `features/analytics/` edit mode — placement, collision, resize, add,
persistence, responsive behaviour.

> **Accepted.** Implementation follows the staged plan in §17. Stage outcomes and
> the owner decisions that supersede specific proposals here:
> S1 (pure engine) — commit `0343e7065`;
> S2 (contract + normalization) — [`analytics-explicit-layout-s2-contract.md`](./analytics-explicit-layout-s2-contract.md);
> S2.5 (boundary realign; engine now at `core/analytics/layout/`) — [`analytics-explicit-layout-s2-5-boundary-realign.md`](./analytics-explicit-layout-s2-5-boundary-realign.md).
> The conclusions below are the historical audit and are left as written.

---

## 1. Plain-language result

Analytics edit mode is **Model A — ordered auto-flow**, and it cannot be repaired
into the dashboard editor the product needs.

A widget's position is not stored anywhere. What is stored is **its index in an
array plus a size preset**. The page then hands that array to CSS Grid and lets
`grid-auto-flow: row` decide where every card lands. Drag-and-drop does not move
a widget to a place; it moves a widget to an **index**, and the browser re-derives
every position from scratch.

That is why the reported problems all appear together, and why they are not
separate bugs:

- A visible empty cell is not a drop target because **no widget is there**, and
  the drag session's only destinations are the boxes of existing widgets.
- A gap cannot be created on purpose because the persisted shape has **no field
  in which "this cell is deliberately empty" could be written**.
- Mixed sizes behave badly because moving a card changes an index, and CSS Grid
  then repacks *every* card — the result is a valid auto-layout, but almost never
  the arrangement the user was aiming at.
- Resize and drag disagree because they are genuinely different algorithms:
  drag permutes the array, resize edits one field and lets the browser repack.

The three recent drag fixes (`ANALYTICS-WIDGET-DRAG-STABILITY-1`,
`ANALYTICS-DRAG-COORDINATE-SPACE-REPAIR-1`,
`ANALYTICS-DRAG-RIGHTWARD-CAPTURE-LOSS-1`) are correct and worth keeping — they
fixed the *pointer* layer. The remaining defects are in the *state* layer, one
level below them. No further pointer work can reach them.

**Recommendation: move to explicit `x/y/w/h` placement (Recommendation 2), with
a pure layout engine local to `features/analytics/`, keeping the existing pointer
session. No database migration is required.**

Evidence for every structural claim below is executable:
[`tests/unit/features/analytics/dashboardLayoutModelDiagnostic.test.ts`](../../../../tests/unit/features/analytics/dashboardLayoutModelDiagnostic.test.ts)
(10 tests, all passing).

---

## 2. Why visible open positions are not targetable

Three independent causes stack. Removing any one of them is not enough.

### 2a. The holes are created by CSS, and CSS never goes back to fill them

The grid is declared in [`AnalyticsDashboard.tsx:579`](../../../../features/analytics/AnalyticsDashboard.tsx#L579):

```
relative grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
[grid-auto-rows:minmax(190px,auto)]
```

No card sets `grid-column-start` or `grid-row-start`; no `dense` is used
anywhere in `features/analytics/` (verified by grep). Every card is therefore
**auto-placed** in the *sparse* `grid-auto-flow: row` mode, whose defining
property (CSS Grid Layout §8.5) is that the placement cursor **never moves
backwards**. A cell skipped because the next item was too wide to fit stays empty
forever, no matter what comes after it.

Worked, checkable examples produced by simulating §8.5 over the **shipped**
`SIZE_GRID_CLASS` map and the **shipped** `DEFAULT_OVERVIEW_WIDGETS`:

| Board | Columns | Empty cells (`x,y`) |
| --- | --- | --- |
| Default board | 4 (`xl`, ≥1280px) | *none* — 20 column-units pack into 5 clean rows |
| Default board | 3 (`lg`, 1024–1279px) | `1,1` `2,1` `2,4` `2,5` `2,6` `2,7` `2,8` |
| Default board | 2 (`sm`) | `1,3` |
| Four 1×1 + one 2×1 | 4 | `3,0` `3,1` |

The fourth row is the important one. The default board packing cleanly at 4
columns is **luck, not design** — 20 units happens to divide by 4. A single
resize of one stat tile from 1×1 to 2×1 immediately opens two visible holes at
the widest breakpoint. That is the screenshot.

### 2b. Destinations are widget identities, not grid locations

At drag start, [`useWidgetDragSession.tsx:213-229`](../../../../features/analytics/useWidgetDragSession.tsx#L213-L229)
builds one `DragSlot` **per rendered widget card**:

```ts
const cards = Array.from(grid.children).filter(c => Boolean(c.dataset.widgetId));
const slots: DragSlot[] = cards.map(c => ({ left: c.offsetLeft, … }));
```

So an N-widget board has exactly N destinations. `hitTestSlot`
([`dashboardHelpers.tsx:178-190`](../../../../features/analytics/dashboardHelpers.tsx#L178-L190))
walks that list and returns `null` for any point not inside one of them — and
`onPointerMove` treats `null` as *keep the current destination*
([`useWidgetDragSession.tsx:271-275`](../../../../features/analytics/useWidgetDragSession.tsx#L271-L275)):

```ts
if (slot === null || slot === live.destination) return;
```

An empty cell is, by construction, not inside any widget's box. Hovering it is
therefore indistinguishable from hovering a gutter: the destination silently
holds whatever it was, and releasing commits *that* — which is exactly the
reported "the widget goes back somewhere else" behaviour. The "Add a widget"
tile is also excluded (it carries no `data-widget-id`), so its cell is not a
destination either.

The diagnostic test asserts this directly: every hole's centre **and both
corners** hit-test to `null`, on both the 3-column default board and the
4-column mixed board.

### 2c. Even if a hole could be hovered, the state cannot record it

`computeDragPreview` ([`dashboardHelpers.tsx:157-169`](../../../../features/analytics/dashboardHelpers.tsx#L157-L169))
is `rest.splice(at, 0, dragged)`. Every layout it can produce is a **permutation
of the same widget set**. There is no index that means "empty". The persisted
widget object has keys `config, id, size, title, type` — and nothing else.

A further proof that hole *position* is not user-choosable: under sparse flow the
first item always lands at the cursor origin, so **no ordering of any board can
leave the top-left cell empty**. The test brute-forces all 120 orderings of the
mixed board and confirms `0,0` is occupied in every one.

---

## 3. Current saved layout shape

### What is stored

`supabase/migrations/20260702000000_analytics_dashboards.sql:64` —

```sql
widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
```

One JSONB array per dashboard row. Validated by
`AnalyticsWidgetsSchema` (`z.array(AnalyticsWidgetSchema).max(48)`), and each
element by `AnalyticsWidgetSchema` — **`.strict()`**
([`contracts/analytics.ts:245-260`](../../../../contracts/analytics.ts#L245-L260)):

```ts
{ id, type, size, title, icon?, config }
```

`size` is the enum `s | m | l | xl | tall | w`, mapped to Tailwind spans in
[`Widget.tsx:19-26`](../../../../features/analytics/Widget.tsx#L19-L26)
(`s`=1×1, `m`=2×1, `l`=2×2, `xl`=3×1, `w`=4×1, `tall`=1×2).

### Checklist requested by the audit brief

| Field | Persisted? |
| --- | --- |
| widget id | ✅ `id` |
| array order | ✅ implicit — the JSONB array's own order **is** the layout |
| width | ⚠️ only via the `size` preset (6 presets, not a number) |
| height | ⚠️ same |
| x coordinate | ❌ |
| y coordinate | ❌ |
| breakpoint-specific placement | ❌ (one `size` for all breakpoints) |
| creation order | ❌ (not distinguishable from array order) |
| hidden / removed state | ❌ (removal deletes the element) |
| revision / edit-session state | ❌ (draft is React state only) |

### Full flow trace

```
analytics_dashboards.widgets (jsonb)
  → repositories/analyticsDashboards.ts       opaque `unknown`, RLS-authorising SELECT
  → services/analytics/dashboards.ts toDashboard()
        AnalyticsWidgetsSchema.safeParse; on failure, per-widget safeParse and
        DROP the individual bad widgets (capped at 48)
  → GET /api/analytics/dashboards → server component props
  → AnalyticsDashboard state `dashboards[]`
  → startEditing(): draftWidgets = active.widgets.map(w => ({...w}))   [pending state]
  → orderedWidgets = previewOrder ?? widgets                            [render input]
  → <div class="grid …">{orderedWidgets.map(<Widget/>)}                 [DOM order only]
  → drag: slots frozen at start; destination = slot index;
          preview = computeDragPreview(startOrder, id, slot)
  → "Done editing" → PATCH /api/analytics/dashboards/[id] { widgets: draftWidgets }
        UpdateDashboardBodySchema → services.updateDashboard → repo (service-role)
  → response dashboard replaces the in-memory row
  → reload: the same array comes back; CSS re-derives every position
```

**Does position survive reload?** No — *position is never saved*. It is
**reconstructed** from `(array order, size, live column count)` on every render.
The arrangement is reproduced only because the reconstruction is deterministic
**at the same viewport width**.

---

## 4. Current rendering model

| Question | Answer |
| --- | --- |
| `grid-template-columns` | `grid-cols-1` / `sm:2` / `lg:3` / `xl:4` (Tailwind `repeat(N, minmax(0,1fr))`) |
| `grid-auto-flow` | not set → default `row`, **sparse** |
| implicit rows | `grid-auto-rows: minmax(190px, auto)` |
| `grid-column` on cards | only `col-span-N` (a *span*, never a start line) |
| `grid-row` on cards | only `row-span-M` |
| explicit placement styles | **none** |
| DOM order determines position | **yes, entirely** |
| dense auto-flow | **no** |
| empty cells addressable | **no** — nothing renders into them |
| visual order vs DOM order | identical (sparse row flow preserves order) |
| responsive column count | **yes** — 1 / 2 / 3 / 4 across breakpoints, while `col-span-N` is **static** |

Two consequences worth naming:

1. The grid's `position: relative` is load-bearing for the drag coordinate
   contract (`offsetLeft/offsetTop` are grid-local because of it). Any explicit-
   placement rewrite must preserve that.
2. `w` (`col-span-4`) and `xl` (`col-span-3`) exceed the column count at the
   `sm` (2) and base (1) breakpoints. Per CSS Grid §8.5 step 1 the browser
   **adds implicit columns** to accommodate an over-wide span rather than
   clamping it — a real responsive defect (horizontal overflow / collapsed
   `1fr` tracks). This is reasoned from the specification and is **not
   browser-verified in this audit**; it is on the required test matrix.

---

## 5. Current destination-generation model

| Candidate destination kind | Generated today? |
| --- | --- |
| existing widget positions | ✅ — the only kind |
| array insertion indexes | ✅ — a slot index *is* an insertion index |
| every valid grid cell | ❌ |
| every valid rectangular footprint | ❌ |
| row gaps | ❌ |
| new rows | ❌ (only "after the last widget", via the clamp in `computeDragPreview`) |
| empty cells left by differently-sized widgets | ❌ |

**Called out explicitly, as the brief requires:** the editor can only target
locations that an existing widget already occupies. A dashboard editor must not
require a widget to already be somewhere before that somewhere can be a drop
target. This is the single most consequential finding.

A secondary defect follows from it: the frozen slot boxes carry the *occupant's*
footprint, not the *dragged widget's*. Dropping a 1×1 onto a 3×1's slot targets a
3-column-wide rectangle, but the blue placeholder renders the dragged widget's own
1×1 footprint at an index-derived location. **What is aimed at, what is
previewed, and what is committed are three different things** whenever the sizes
differ.

---

## 6. Current collision and reflow behaviour

There is **no collision system**. Nothing detects, resolves, rejects, or
compacts. Every scenario resolves to "change the array, let CSS repack".

| Scenario | What actually happens |
| --- | --- |
| 1×1 enters another 1×1 | array splice at that index; equal footprints ⇒ looks like a swap; the only case that feels right |
| 1×1 enters one cell of a 3×1 | the 3×1's whole box is one slot; the 1×1 takes that array index; the 3×1 shifts one index and the entire tail repacks |
| 3×1 enters cells occupied by three 1×1s | only the slot under the pointer is targetable; the 3×1 takes that index and pushes **all three** 1×1s down the array; where they land is auto-flow's decision |
| widget enters a partially open region | not targetable at all (§2b) — destination unchanged |
| widget moved below a wide widget | reachable only if a widget already sits there |
| widget moves between rows | only via a widget's box; rows are not addressable |
| widget resized into occupied cells | no collision check; `size` changes and the whole board repacks |

Classification against the brief's list — the current logic **reorders an array**
and **relies on CSS Grid to repack**. It never shifts one sibling deliberately,
never recomputes placements, never rejects a placement, and it **silently holds
the previous destination** whenever the pointer is over a hole. It also
**produces a preview that differs from the drop result** in the mixed-size case
described in §5.

---

## 7. Current add-widget behaviour

`handleAdd` ([`AnalyticsDashboard.tsx:242-247`](../../../../features/analytics/AnalyticsDashboard.tsx#L242-L247)):

```ts
setDraftWidgets((ws) => [...ws, widget]);
```

| Question | Answer |
| --- | --- |
| always appends | ✅ |
| scans for the first fitting rectangle | ❌ |
| uses the first empty cell | ❌ |
| respects the pending edit layout | ✅ (it appends to the draft) |
| user can choose a destination | ❌ |
| can overlap / displace | n/a — overlap is unrepresentable |
| same position after save + reload | ✅ at the same viewport width |

The new widget's *visual* position is then whatever sparse flow gives the last
array element — which is never one of the earlier holes. Two related paths behave
the same way but insert mid-array instead of appending: `duplicateWidgetAt`
(after its source) and `saveExploration` (after its source widget).

**Recommended behaviour:** place a new widget in the **first open rectangle that
fits its footprint**, scanning row-major, and only append a new row when nothing
fits. That is `findFirstAvailableRect` in the proposed engine, and it should be
shared by add, duplicate and save-as-insight.

---

## 8. Current resize behaviour

`handleResize` ([`AnalyticsDashboard.tsx:221-222`](../../../../features/analytics/AnalyticsDashboard.tsx#L221-L222)):

```ts
setDraftWidgets(ws => ws.map(w => w.id === id ? { ...w, size } : w));
```

One field changes; the array order is untouched; CSS repacks everything.

| Resize | Result today |
| --- | --- |
| 1×1 → 2×1 | if the current row has no 2 free columns at the cursor, the widget jumps to the next row and **leaves a hole behind it** |
| 1×1 → 3×1 | same, larger blast radius; can push several rows |
| 3×1 → 1×1 | frees two cells that later widgets can only use if flow reaches them going forward |
| expands into occupied cells | not possible to express — everything after it shifts |
| shrinks leaving open cells | holes remain, unreachable |
| near the right edge, widened | wraps to the next row |
| at the bottom, made taller | new implicit rows are created |

There is **no preview at all** for resize: the `<select>` commits immediately.
So drag and resize maintain two incompatible algorithms today, exactly what the
brief prohibits going forward. Both must route through one engine.

---

## 9. Current responsive behaviour

| Question | Answer |
| --- | --- |
| One canonical desktop layout, responsively rendered? | **Sort of** — one canonical *order*, but the rendered arrangement is re-derived per breakpoint and differs materially between them |
| Separate layout persisted per breakpoint? | No |
| Does changing viewport width permanently mutate placement? | **No** — nothing is written on resize; this is the one thing the current model gets right, and it must be preserved |
| What happens when a wide widget no longer fits? | Its span exceeds the column count; the browser adds implicit columns (§4, unverified in a browser) |
| Does returning to desktop restore the arrangement? | Yes — it is recomputed from the unchanged order |
| Can responsive flow create gaps that edit mode treats as persisted gaps? | **The inverse, and worse:** flow creates gaps that edit mode cannot see *at all*. At 3 columns the shipped default board has 7 of them, two in the second row |

**Recommended model: one canonical layout at a fixed column count, projected for
narrower viewports, never persisted per breakpoint.** Details in §14/§17.

---

## 10. Can the ordered-array model meet the desired experience?

**No.** Not as a matter of implementation difficulty — as a matter of
expressiveness.

Check the brief's own acceptance list against the state shape:

| Required behaviour | Reachable from `{id, size}[]`? |
| --- | --- |
| Every valid open grid area can be targeted | ❌ destinations are widget boxes; a hole has no widget |
| Move a widget horizontally or vertically | ⚠️ only as "to another widget's index" |
| Intentionally leave a gap | ❌ **no field can hold it** |
| Move a widget into an existing gap | ❌ |
| Add into an available gap | ❌ (would require the same missing state) |
| Placeholder is the exact post-drop footprint | ❌ target footprint ≠ dragged footprint (§5) |
| Releasing commits exactly what was previewed | ❌ in the mixed-size case |
| Predictable mixed-size collision | ❌ no collision system exists |
| Resize collision handling | ❌ |
| Exact save/reload fidelity | ⚠️ only at an identical viewport width |

Six of ten are blocked by the *absence of a field*, not by handler logic. Adding
a "gap widget", a "spacer" placeholder, or per-drag hole bookkeeping would each
be a way of smuggling coordinates into an array — i.e. reinventing `x/y`
badly, and precisely the "growing collection of special cases" the brief warns
against.

**Recommendation 1 (keep ordered auto-flow) is rejected.**

---

## 11. Recommended long-term model

**Recommendation 2 — explicit two-dimensional placement.**

```ts
export interface WidgetRect {
  readonly x: number; // 0-based column
  readonly y: number; // 0-based row
  readonly w: number; // columns spanned
  readonly h: number; // rows spanned
}
```

Invariants, enforced by `validateLayout` and asserted on every engine output:

```
x >= 0            y >= 0
w >= 1            h >= 1
x + w <= COLUMN_COUNT
no two committed rectangles overlap
every widget id appears exactly once
```

`COLUMN_COUNT` is a single canonical constant — **4**, matching today's widest
(`xl`) breakpoint, so existing wide widgets (`w` = 4 columns) remain expressible
and the default board's current appearance is unchanged at wide viewports.

Pure engine API (a starting point, not a contract):

```ts
placeWidget(layout, widgetId, candidate: WidgetRect, policy): Layout
resizeWidget(layout, widgetId, next: {w,h}, policy): Layout
findFirstAvailableRect(layout, size: {w,h}, columns): WidgetRect | null
compactLayout(layout, policy): Layout
validateLayout(layout, columns): { ok: true } | { ok: false; problems: … }
projectLayout(layout, targetColumns): Layout      // responsive rendering only
migrateOrderedLayout(widgets, columns): Layout    // legacy boards
```

Every function is pure, synchronous, framework-free, and total — it returns a
valid layout for any input, never throws for user input.

---

## 12. Recommended collision / compaction policy

**Push-down during drag; commit exactly the preview; no automatic compaction; an
explicit "Tidy up" action.**

Precisely:

1. **Target.** The pointer resolves to a grid cell; the candidate rect is the
   *dragged widget's* footprint anchored so the grabbed cell stays under the
   cursor, clamped to `0 ≤ x` and `x + w ≤ columns`.
2. **Collision → push down.** Every widget the candidate overlaps moves down by
   the minimum rows needed to clear it, and that displacement cascades
   transitively. **Vertically only.** Horizontal pushing is rejected: with mixed
   widths it is non-deterministic (which side?) and cascades unpredictably across
   a 4-column grid.
3. **Empty target → no movement at all.** Dropping into a hole moves nothing
   else. This is what makes gaps first-class.
4. **Commit = preview.** The layout rendered during the drag *is* the layout
   written on release. No post-drop pass.
5. **No automatic compaction.** A gap the user leaves survives save and reload.
   Removing a widget leaves its cells empty.
6. **Explicit "Tidy up"** in the edit banner runs `compactLayout` (gravity-up,
   order-stable) as a single undoable-by-cancel operation.
7. **Resize uses the identical rules** — the candidate is the resized rect,
   collisions push down, and a live preview is shown while the size preset is
   hovered/selected.

Why not the alternatives, briefly:

- **Swap** — only well-defined for equal footprints; the brief's mixed-size
  matrix is mostly not swappable.
- **Automatic compaction (Grafana-style)** — directly contradicts two stated
  requirements: intentional gaps, and "releasing commits exactly what was
  previewed" (compaction can move the widget you just dropped).
- **Reject-on-collision** — makes large widgets nearly immovable on a full board.
- **Hybrid push-then-compact** — same preview/commit divergence as above.

This is the Datadog/free-form model rather than the Grafana/gravity model. For an
analytics board where users deliberately group related widgets, the free-form
model matches the product intent already written into the brief.

---

## 13. Keep the custom engine, or adopt a library?

**Recommendation: Option C — a small pure grid engine, plus the existing pointer
UI.** No new dependency.

### Option A — repair the ordered-array engine
Rejected in §10. It is not a repair; the state is missing a dimension.

### Option B — adopt a React grid-layout library
The repo currently has **zero** grid/DnD/layout dependencies (50 total deps;
grep for `grid|dnd|drag|sortable|layout|muuri|gridstack` returns nothing). The
best-known candidate is `react-grid-layout`. Assessed:

| Criterion | Assessment |
| --- | --- |
| Explicit `x/y/w/h` | ✅ exactly the model we want |
| Controlled layout | ✅ |
| Drag handles / resize | ✅ built in |
| Collision + compaction control | ⚠️ `compactType={null}` + `preventCollision` exist, but the null-compaction path is the least-exercised one |
| Responsive layouts | ⚠️ via `ResponsiveGridLayout`, which **persists a layout per breakpoint** — the complexity §9 recommends avoiding |
| React 19 / Next 15 app-router | ❓ **must be verified before adoption** — the repo is React `^19` / Next `^15.1`; `WidthProvider` touches `window` and needs client-only mounting |
| Bundle | ⚠️ tens of kB plus its own stylesheets |
| Interaction ownership | ❌ **it owns pointer handling** — adopting it discards the three landed drag fixes and their 40+ passing browser/unit tests, replacing verified behaviour with an unverified vendor implementation |
| Accessibility | ❌ no keyboard placement; we would still write that |
| Testability | ⚠️ behaviour becomes DOM-level, not unit-testable as pure functions |
| Licensing | ✅ MIT |

The decisive point is the interaction row. The *hard, already-solved* part of
this feature is the pointer session (capture ownership, coordinate spaces, frozen
geometry, rAF coalescing) — that work is done, documented and browser-certified.
The *unsolved* part is a few hundred lines of pure grid arithmetic. A library
would replace the solved half and only partly supply the unsolved half.

### Option C — pure engine + existing pointer UI (recommended)
- Occupancy, candidate placement, push, compaction, resize and validation live in
  a React-free, DOM-free module — trivially unit-testable, exactly the kind of
  test the project's testing principle asks for (prove behaviour, not callbacks).
- The pointer layer keeps its single new responsibility: *where is the pointer,
  in grid cells*. It stops deciding layout entirely.
- No dependency, no bundle cost, no SSR question, full control of the collision
  policy in §12.
- Estimated engine size: ~250–350 lines plus tests.

---

## 14. Proposed persisted contract

Inside the **existing** `widgets` JSONB. `contracts/analytics.ts`:

```ts
export const WidgetRectSchema = z.object({
  x: z.number().int().min(0).max(3),
  y: z.number().int().min(0).max(255),
  w: z.number().int().min(1).max(4),
  h: z.number().int().min(1).max(4),
}).strict().refine(r => r.x + r.w <= ANALYTICS_GRID_COLUMNS, {
  message: "Widget extends past the grid.",
});

export const AnalyticsWidgetSchema = z.object({
  id, type, title, icon,
  /** LEGACY. Accepted on read for migration; no longer written. */
  size: AnalyticsWidgetSizeSchema.optional(),
  /** Canonical placement at ANALYTICS_GRID_COLUMNS (=4). */
  layout: WidgetRectSchema.optional(),
  config,
}).strict();
```

Both optional at the contract layer so that legacy rows and migrated rows both
parse; the **service layer guarantees** every widget leaving `toDashboard()` has a
`layout`, so the client type can treat it as required.

Board-level invariants (no overlap, ids unique) are enforced by
`validateLayout` in the service on write, not by Zod — Zod validates elements,
the engine validates the set.

Also add:

```ts
export const ANALYTICS_GRID_COLUMNS = 4;
```

as the single source of truth, imported by the engine, the renderer and the
migration.

**Why not `size` and `x/y` together:** two sources of truth for width is how the
current preview/commit divergence happened. `size` becomes a *preset picker* in
the UI (`"2×1"` → `{w:2,h:1}`) and stops being persisted state.

---

## 15. Existing-layout migration strategy

> **Superseded in part by the owner decision on ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1.**
> The chokepoint, laziness and idempotence below all stand. The *placement rule*
> does not: the owner ruled that the empty cells sparse auto-flow produced were
> side effects, never authored placement, so migration must **not** reproduce
> them. `migrateLegacyOrderedLayout` therefore uses **first-fit**
> (`findFirstAvailableRect` per widget, in legacy array order) rather than
> replaying CSS §8.5. The two differ only on boards that had accidental holes;
> the shipped default board migrates identically under either rule. Implemented
> and tested in `core/analytics/layout/legacyMigration.ts`.

**Deterministic, lazy, idempotent — one chokepoint, no backfill migration.**

`services/analytics/dashboards.ts → toDashboard()` is already the single point
where every stored board is parsed on the way out (and it already drops
individually-malformed widgets). Add there:

```ts
const widgets = parsedWidgets.every(w => w.layout)
  ? parsedWidgets                                  // already migrated — no-op
  : migrateOrderedLayout(parsedWidgets, ANALYTICS_GRID_COLUMNS);
```

`migrateOrderedLayout` **replays the exact CSS sparse row auto-flow algorithm**
(§8.5) at 4 columns over `(order, size)` and assigns each widget the rectangle
the browser gives it today. That guarantees the property that matters: **every
existing user's board looks identical after migration to how it looks now at the
widest breakpoint.** The simulator in the diagnostic test is a working reference
implementation of that algorithm.

Properties:

- **Deterministic** — same input, same output, no clock, no randomness.
- **Idempotent** — a board with layouts is returned untouched; re-running is a
  no-op.
- **Lazy** — the row is only rewritten the next time the user saves. No batch job,
  no downtime, no migration of untouched accounts.
- **Mixed-state safe** — a board where some widgets have layouts and some do not
  (only reachable if a save were interrupted) re-runs the full migration, which
  is stable because it is order-driven.

`DEFAULT_OVERVIEW_WIDGETS` gains explicit `layout` values in the same commit, so
newly seeded boards and "Restore default layout" skip migration entirely.

---

## 16. Database impact

**None.** No migration, no new column, no index, no RLS change, no grant change.

`analytics_dashboards.widgets` is already `jsonb`, opaque to the repository
layer, and validated exclusively by Zod in `services/analytics/dashboards.ts`.
Adding `layout` and making `size` optional is a **contract change only**.

Payload size: `layout` adds roughly 30 bytes per widget; at the 48-widget cap
that is under 1.5 kB per board. Negligible.

Two non-DB risks are recorded in §19: the `.strict()` rollback hazard, and the
fact that `toDashboard()` **drops** widgets that fail to parse.

---

## 17. Staged implementation plan

Seven stages, each a separate local commit that leaves the app working. Stages
1–2 ship no visible change.

| # | Commit | Contents | Verification |
| --- | --- | --- | --- |
| **S1** | `feat(analytics): pure grid layout engine` | New `features/analytics/layout/` — `gridTypes.ts`, `occupancy.ts`, `place.ts` (push-down), `resize.ts`, `compact.ts`, `findFirstAvailableRect.ts`, `validate.ts`, `project.ts`, `migrateOrderedLayout.ts`. React-free, DOM-free. **No UI wiring.** | New unit suite; §18 engine matrix |
| **S2** | `feat(analytics): persist explicit widget placement` | `WidgetRectSchema`, `ANALYTICS_GRID_COLUMNS`, optional `layout`, `size` → optional; `toDashboard()` migration chokepoint; `validateLayout` on write; `DEFAULT_OVERVIEW_WIDGETS` gains layouts | Contract + service unit tests; §18 persistence + migration matrix |
| **S3** | `refactor(analytics): render from explicit placement` | `Widget` emits `gridColumn: "${x+1} / span ${w}"`, `gridRow: "${y+1} / span ${h}"` instead of `SIZE_GRID_CLASS`; grid keeps `position: relative`; DOM order becomes irrelevant to position | Existing analytics suites must stay green; visual check |
| **S4** | `refactor(analytics): drag targets grid cells, not widget slots` | `useWidgetDragSession` captures **grid geometry** (origin, column width, row height, gap) instead of per-card slots; pointer → cell → candidate rect → `placeWidget` → preview layout. `computeDragPreview`/`hitTestSlot` retire. Pointer capture, coordinate contract, rAF coalescing and exit handling are **kept verbatim** | Rewritten drag unit suite; the three existing e2e drag specs, updated |
| **S5** | `feat(analytics): resize and add through the same engine` | Size preset → `resizeWidget` with live preview; `handleAdd`/`duplicateWidgetAt`/`saveExploration` → `findFirstAvailableRect`; "Tidy up" button → `compactLayout` | §18 resize + placement matrix |
| **S6** | `feat(analytics): canonical layout with responsive projection` | `projectLayout` for < 4 columns (render-only, never persisted); edit mode gated to the canonical breakpoint with an honest message below it | §18 responsive matrix |
| **S7** | `docs + cert` | Browser certification spec over the drag harness (extended with mixed sizes and a deliberate hole); outcome doc; update this audit's status | Playwright spec run, or reported blocked |

**Concerns kept out of the layout engine**, per the brief: no layout rules in
pointer handlers, React render branches, class-name generation, `useEffect`, or
API routes. The division is: pointer answers *where is the pointer*, engine
answers *what layout results*, persistence answers *how it is stored*.

---

## 18. Required test matrix

### Engine (pure, `features/analytics/layout/`)

**Empty-space placement** — 1×1 into an empty cell · 2×1 into an empty two-cell
rectangle · into a gap on a lower row · into the rightmost valid column · reject
(clamp) a footprint extending past `x + w > 4` · `findFirstAvailableRect` returns
the first row-major fit · returns `null`→append-row when nothing fits.

**Same-size movement** — 1×1 left / right / up / down · across multiple cells ·
out and back to the origin rect · identical input ⇒ identical output (no
oscillation).

**Mixed-size movement** — 1×1 into a 3×1's cells · 3×1 onto three 1×1s (all three
pushed down, deterministically ordered) · 2×1 into partially occupied space ·
wide widget across a row boundary · small widget beside a wide widget when a
valid cell exists · large widget displaces smaller ones deterministically ·
transitive push cascade terminates.

**Collision policy** — push is vertical only · an empty target moves nothing ·
push is minimal (no over-shoot) · result always satisfies `validateLayout`.

**Resize** — expand into free cells · expand into occupied cells (push down) ·
shrink leaves the gap (no compaction) · resize at the right boundary clamps ·
resize preview === committed result · `1×1→2×1`, `1×1→3×1`, `3×1→1×1`, taller at
the bottom.

**Compaction** — `compactLayout` is gravity-up, order-stable, idempotent, and
never introduces an overlap.

### Persistence (contract + service)

Save and reload exact `x/y/w/h` · cancel restores committed coordinates · a
failed save preserves the pending layout and surfaces the error · legacy ordered
boards migrate to the rectangles CSS gives them today (assert against the §2
worked examples) · migration is idempotent · a board mixing migrated and legacy
widgets converges · overlapping input is rejected on write · the 48-widget cap
still holds.

### Interaction (jsdom + browser)

Preview === commit for every mixed-size case · a hole is a valid destination and
releasing over it lands there · the placeholder footprint equals the dragged
widget's footprint · stationary pointer is inert · gutters hold the destination ·
Escape / blur / capture-loss / unmount still cancel · **the three existing e2e
drag specs continue to pass** (leftward, rightward, hold-still-and-return,
release-outside-the-grid, card controls never start a drag).

### Responsive

Desktop layout survives a temporary narrow viewport (nothing is written) ·
narrow rendering never mutates the canonical layout · `w`/`xl` widgets render
predictably at 1 and 2 columns — **including the implicit-column question from
§4, which must be settled in a browser** · edit-mode drop targets match the
active grid geometry.

---

## 19. Risks and rollback

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **`.strict()` rollback hazard.** Once boards contain `layout`, reverting S2 makes `AnalyticsWidgetSchema.safeParse` fail on every widget — and `toDashboard()` **drops** unparseable widgets individually, so a rollback would present users with empty boards | **High** | Land the *schema-accepts-`layout`* change on its own and treat it as non-revertible; roll back S3+ only. Optionally make `toDashboard` strip unknown keys before the strict parse |
| Migration produces a different arrangement than the user sees today | Medium | The migration replays the exact §8.5 algorithm at 4 columns; asserted against the recorded worked examples in the diagnostic test |
| Regressing the three landed drag fixes | Medium | S4 keeps `useWidgetDragSession`'s capture ownership, coordinate contract and exit handling verbatim — only destination *derivation* changes; the existing e2e specs are the gate |
| Users on `lg` (3-column) laptops see their board change when it becomes explicitly placed at 4 columns | Medium | This is a deliberate improvement (their 7 holes disappear), but it **is** a visible change — call it out in the release note |
| Push cascades in pathological boards | Low | `validateLayout` on every engine output; cascade depth bounded by row count; property tests |
| Engine and renderer disagreeing about geometry | Low | One `ANALYTICS_GRID_COLUMNS` constant; renderer derives styles from the rect only |

**Rollback plan:** S3–S7 are independently revertible commits; reverting any of
them restores the previous rendering/interaction without touching stored data,
because stored data after S2 is a strict superset. S1 is additive (dead code if
unwired). S2 is the one-way door — see the first row. No database change means no
migration to reverse.

---

## 20. Audit document path

`docs/slices/phase-5/analytics/analytics-edit-mode-layout-audit.md` (this file) —
placed alongside the existing analytics slice docs.

---

## 21. Files changed by this audit

| File | Kind |
| --- | --- |
| `docs/slices/phase-5/analytics/analytics-edit-mode-layout-audit.md` | new — this document |
| `tests/unit/features/analytics/dashboardLayoutModelDiagnostic.test.ts` | new — diagnostic evidence (10 tests) |

No production source file was modified. No layout system was replaced.

---

## 22. Verification actually run

| Command | Result |
| --- | --- |
| `npm test -- tests/unit/features/analytics/dashboardLayoutModelDiagnostic.test.ts` | **1 suite passed, 10 tests passed** |
| `npx tsc --noEmit` | see the batch report |
| `npm run lint` | see the batch report |

Not run, and why:

- **Playwright / browser specs** — no browser environment was already available;
  running the existing analytics drag specs would have required starting
  infrastructure. The implicit-column question in §4 is therefore **reasoned from
  the CSS Grid specification and explicitly not browser-verified**.
- **Full repository suite** — not owner-authorised for this batch.
- **Supabase / Docker** — not started; nothing in this audit needs a database.
