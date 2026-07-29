# Explicit layout S2 — contract, normalization, serialization (ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1)

**Status:** accepted and implemented (local only).
**Date:** 2026-07-28
**Preceded by:** [`analytics-edit-mode-layout-audit.md`](./analytics-edit-mode-layout-audit.md) (audit) ·
S1 engine at `0343e7065`
**Scope:** persisted contract, read normalization, write serialization, API
round-trip. **No renderer, drag, resize, add-widget, responsive or database
change.**

This document records the accepted S2 decisions. It does not restate or replace
the audit's conclusions; where it supersedes a specific audit proposal, the audit
carries an inline note.

---

## 1. What S2 changed

Analytics dashboards can now *carry* explicit placement. Nothing yet *produces*
it: the page still renders from array order and CSS auto-flow exactly as before,
and no shipping code path writes the field. What exists after S2 is a contract
that can hold explicit rectangles, a read boundary that can interpret them safely
(including when they are wrong), and a write boundary that will only emit them
when explicitly asked.

---

## 2. The optional persisted contract

`contracts/analytics.ts`. Inside the existing `analytics_dashboards.widgets`
JSONB — no new column, no migration.

```ts
export const ANALYTICS_CANONICAL_COLUMNS = 4;

export const AnalyticsWidgetLayoutSchema = z
  .object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(ANALYTICS_CANONICAL_COLUMNS),
    h: z.number().int().min(1),
  })
  .strict()
  .refine((r) => r.x + r.w <= ANALYTICS_CANONICAL_COLUMNS);

AnalyticsWidgetSchema = z.object({
  id, type, size, title, icon?, config,
  layout: AnalyticsWidgetLayoutSchema.optional(),
}).strict().superRefine(/* size ↔ layout.w/h agreement */)
```

The widget schema stays **strict**: unknown fields on the widget and inside
`layout` are still rejected.

### Size / layout consistency rule

While `size` remains the UI's preset control, a stored rectangle's **dimensions
must mean the same thing the preset does**:

```
layout.w === footprintForSize(size).w
layout.h === footprintForSize(size).h
```

`x`/`y` are the explicit part; `w`/`h` restate the preset so the rectangle is
self-contained. A disagreement is invalid persisted state, enforced inside
`AnalyticsWidgetSchema` itself. Two competing sources of truth for width is
precisely how the old system's preview and commit came to disagree. S5 may later
centralize size changes so the two always move together.

### Where the footprint map now lives

`ANALYTICS_SIZE_FOOTPRINT` / `footprintForSize` **moved from
`features/analytics/layout/widgetSizeMap.ts` down into `contracts/analytics.ts`**,
because the persisted shape's validity depends on it and a contract cannot import
a feature. `widgetSizeMap.ts` re-exports it, so every engine consumer is
unchanged and there is still exactly one definition. `ANALYTICS_CANONICAL_COLUMNS`
moved for the same reason and is likewise re-exported by the engine.

---

## 3. Persisted data vs. effective layout

These are different things and S2 keeps them apart.

```ts
interface NormalizedDashboardWidgets {
  widgets: readonly AnalyticsWidget[];   // as stored — legacy widgets gain nothing
  effectiveLayout: AnalyticsLayout;      // canonical rectangles for rendering
  layoutSource: "persisted" | "legacy-derived" | "repaired-fallback";
  layoutProblems: readonly AnalyticsLayoutProblem[];
}
```

`features/analytics/layout/normalizeDashboardWidgets.ts` — pure: no DOM, no
viewport, no CSS, no clock, no I/O. The same stored board normalizes identically
on every device.

The effective layout is deliberately **not** added to the API payload in S2. The
renderer does not consume it yet, and broadening the client contract before it
does would be scope this stage does not own.

---

## 4. Read behaviour (`services/analytics/dashboards.ts → toDashboard`)

**No eager write-on-read, in any case.** A read never calls a write repository
function; `layout` is never added to a stored widget because it was loaded.

| Case | Condition | `layoutSource` | Effective layout |
| --- | --- | --- | --- |
| **A** | no widget carries `layout` | `legacy-derived` | `migrateLegacyOrderedLayout(order + size, 4)` |
| **B** | every widget carries valid `layout` **and** the board validates | `persisted` | the stored rectangles, exactly — not reordered, not compacted |
| **C** | some widgets carry `layout`, some do not | `repaired-fallback` | derived; typed `partial-layout` problem |
| **D** | every widget carries `layout` but the board is invalid | `repaired-fallback` | derived; typed problems naming the fault |

Case D covers overlap, duplicate id, negative coordinate, zero dimension,
right-boundary overflow, and size/layout disagreement. In every case **every
widget survives** and the board is rebuilt deterministically from order and size.

The service logs one `console.warn` carrying **only** the dashboard id, the
layout source, problem codes and widget ids — never titles, configs, notes or
any other stored user content.

---

## 5. No widget-by-widget schema loss

The audit flagged this as the highest-severity risk in the plan: the previous
read path parsed each widget strictly and **dropped** the ones that failed. Under
that behaviour, shipping a new optional field was a rollback trap — a parser that
did not know `layout` would make every widget vanish while the page still
rendered "successfully".

The read path now parses each stored record and, **if it fails and carries a
`layout`, retries with the layout removed**. A widget whose only fault is its
placement is kept, its placement discarded, a typed problem recorded, and the
whole board falls back to derived rectangles. A widget is dropped only for a
pre-existing, layout-unrelated corruption (the CD-3A salvage behaviour, unchanged)
— and even then it is now reported rather than disappearing silently.

Problem codes: `unreadable-widgets` · `widget-cap-exceeded` ·
`unparseable-widget` · `invalid-layout-field` · `size-layout-mismatch` ·
`partial-layout` · `layout-unrecoverable`, plus the engine's own board-level
codes (`duplicate-id` · `overlap` · `negative-coordinate` · `invalid-size` ·
`exceeds-columns` · `non-integer`).

---

## 6. Serialization and explicit-write intent

`features/analytics/layout/serializeDashboardWidgets.ts`.

```ts
type LayoutPersistenceIntent = "preserve-source" | "persist-explicit-layout";
```

- **`preserve-source`** — emit the widgets exactly as given, identity-preserving.
  A legacy board stays legacy; an explicit board keeps its exact rectangles,
  uncompacted and unreordered. A title-only or config-only save therefore cannot
  convert a board's storage generation.
- **`persist-explicit-layout`** — write placement for **every** widget from a
  supplied canonical layout. Refuses, typed and without silent repair, on a
  partly-placed board (`missing-placement`), a layout that still places a removed
  widget (`stale-placement`), a rectangle contradicting the size preset
  (`size-layout-mismatch`), or a board that does not validate (`invalid-layout`).

**Having an effective layout in memory is not intent.** Every read produces one;
none of them are a reason to write. No shipping code path asks for
`persist-explicit-layout` — a test enforces that, and it also enforces that no
component, hook or store reads `widget.layout.x/y` yet.

---

## 7. API / service / repository behaviour

- Legacy payloads are accepted and **do not gain `layout`** from a read or from
  an unrelated save.
- Explicit payloads round-trip with exact placement.
- Unknown fields are still rejected (strict schema).
- **Board-level** write check (`rejectInvalidWidgetLayout`, `app/api/analytics/_shared.ts`):
  Zod validates one widget at a time and cannot see the set, so both write routes
  now reject an overlapping, duplicate-id, out-of-bounds, or partly-placed board
  with a 400 naming only problem codes and widget ids. A board with no placement
  — every board this release's UI produces — passes untouched.
- The repository still receives only validated, serialized JSON, and no read path
  calls a write function.

---

## 8. Rollback-safe rollout (expand, verify, then write)

Persisting `layout` is a **one-way door**: once production rows carry the field,
rolling back to a build whose strict parser rejects it is no longer safe.

1. **Compatibility release** — ships the S2 code: accepts optional `layout`,
   preserves it when present, reads legacy boards, recovers from damaged ones,
   and **writes nothing new**. Verify in production.
2. **Writer release** — only after step 1 is verified may a later release let
   edit mode persist explicit layouts (S4/S5).

Nothing was pushed or deployed in S2. The implementation is built so that merely
loading a dashboard, or editing a title, never crosses the boundary. The
`explicitLayoutRolloutGuard` test fails the moment shipping code tries to.

---

## 9. Locked forward decisions (owner)

Recorded here so S4/S5 inherit them:

- **Resize (S5).** A size preset that would cross the grid's right boundary at
  the widget's current `x` is **disabled**, with the tooltip
  `Move this widget left to use this size.` Resizing must never silently
  relocate the widget. An explicit move-then-resize interaction may be designed
  separately; it must not happen implicitly. (The S1 engine already refuses such
  a resize with `exceeds-columns`.)
- **Drag preview (S4).** Every preview is derived from the **drag-start**
  canonical layout —
  `placeWidget(dragStartLayout, draggedWidgetId, candidateRect, options)` — never
  from the previous preview. The engine deliberately leaves displaced widgets
  where they were pushed; recomputing from drag-start state is what makes moving
  out and back restore the correct arrangement.

---

## 10. Database impact

**None.** No column, no index, no RLS or GRANT change, no migration, no
`db:push`, no backfill, no row rewritten. `analytics_dashboards.widgets` remains
the persistence location.

---

## 11. Open architectural question for the owner

`services/analytics/dashboards.ts` and `app/api/analytics/_shared.ts` now import
from `features/analytics/layout/`. **This is the first server → `features/`
import in the repository** (verified by grep across `services/`, `core/`,
`repositories/` and `app/api/`). It is not blocked by any lint rule or structure
test, and the imported modules are pure — no React, no DOM, no `"use client"` —
so it is safe today.

It is still backwards for the layering the project otherwise keeps. The clean
remedy is mechanical: move `features/analytics/layout/` to
`core/analytics/layout/`. The engine imports **only** `contracts/`, which is
exactly what `core/` purity requires, so the move is an import-path rewrite with
no code change. It was not done here because S1 and S2 both explicitly locked the
engine's location to `features/analytics/layout/`.

Recommended as a small standalone commit before S4 adds more call sites.

---

## 12. Verification

See the batch report for exact suite and test totals. Summary: the new contract,
normalization, serialization, round-trip, write-guard and rollout-guard suites
pass, together with the full analytics unit inventory and the pre-existing
dashboard service and route suites. No Docker, no Supabase, no Playwright — S2
needs none.
