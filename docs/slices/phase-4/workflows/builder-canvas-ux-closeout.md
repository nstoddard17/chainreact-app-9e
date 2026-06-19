# Builder Canvas UX (drag + config-open focus + connection UX) — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this arc.
**Date:** 2026-06-19 _(updated for connection UX: `BUILDER-CANVAS-UX-CLOSEOUT-2`)_
**Branch:** `v2-main`
**Marker:** `BUILDER-CANVAS-UX-CLOSEOUT-1` → extended by `BUILDER-CANVAS-UX-CLOSEOUT-2`
**Scope:** workflow-builder canvas — (1) live node drag with controlled React Flow + grab/grabbing
cursor; (2) focus/zoom the canvas toward a node when its config panel opens; (3) connection/edge UX —
discoverable handles + inline feedback when an invalid connection is refused.

> **STATUS: LOCAL / UNPUSHED.** All three slices are local on `v2-main` and **not pushed**.
> **No migration, no feature flag, no backend change** — this arc is entirely builder UI /
> canvas / client config-state. No workflow data, edge semantics, routing, billing, AI, or RLS impact.

---

## 1. Summary

- **Node drag fix** (`192826625`): `WorkflowCanvas` ran React Flow as a *controlled* flow but had no
  `onNodesChange`, so interactive position changes were never fed back during a drag — the node only
  jumped to its final spot at drag-stop. Now a local `rfNodes` state applies RF's own changes live on
  pointer movement, while the workflow graph slice is written only on `onNodeDragStop`.
- **Config-open focus/zoom** (`fde9b1110`): opening a node's config rail now smoothly pans/zooms the
  canvas toward that node (gentle context zoom, left offset so the right-side config panel doesn't
  cover the node), reusing the existing `useCanvasNodeFocus` → `setCenter` seam. The "reveal"
  ("Go to field") path is unchanged.
- **Connection UX** (`784fe89d9`): connecting steps was functional but rough — `WorkflowCanvas` caught
  `connectNodes`' rejection in an **empty catch**, so invalid attempts (self-loop / duplicate) failed
  **silently**, and the handles were small / low-contrast / hard to discover. Now handles light up on
  node hover/selection, carry a crosshair cursor, and an invalid attempt surfaces the rejection reason
  as a transient inline banner (`ConnectionHintBanner`). Valid connects still go through `connectNodes`.

## 2. Completed commit chain

- `192826625` — fix(builder-canvas): live node drag + grab/grabbing cursor (BUILDER-CANVAS-NODE-DRAG-UX-AUDIT-1) _(2026-06-19)_
- `fde9b1110` — feat(builder-canvas): focus/zoom canvas toward a node when its config opens (BUILDER-CANVAS-FOCUS-SELECTED-NODE-1) _(2026-06-19)_
- `784fe89d9` — feat(builder-canvas): connection UX — discoverable handles + invalid-connection feedback (BUILDER-CANVAS-CONNECTION-UX-AUDIT-1) _(2026-06-19)_

  _(The initial closeout `a32d06fbf` covered the first two slices; this revision — `BUILDER-CANVAS-UX-CLOSEOUT-2` — adds the connection UX slice.)_

## 3. Current behavior

### 3a. Node drag
- **Root cause:** controlled React Flow nodes with no `onNodesChange` handler — interactive position
  changes were not fed back during the drag, so the node appeared frozen until release.
- **Fix:** `WorkflowCanvas` holds RF's working node array in local `rfNodes` state, applies RF's own
  changes via `applyNodeChanges` on every pointer move (live movement), and re-syncs from the
  slice-derived `flowNodes` whenever the graph slice changes. The graph slice is written **only** at
  `onNodeDragStop` (via `updateNodePosition`, with non-overlapping-drop resolution).
- **Result:** the node visibly follows the pointer during a drag; the final position persists on
  release.
- **Performance boundary:** no Zustand workflow-slice writes, no readiness/AI/autosave/server work,
  and no graph rebuilds per mousemove — a drag just re-renders the canvas locally.
- **Cursor:** hover uses `grab`, active drag uses `grabbing` (added in `app/globals.css`); connection
  handles keep their own cursor behavior.

### 3b. Config-open focus/zoom
- Opening a node config panel bumps the existing canvas-focus signal (`canvasFocusNodeId` +
  `canvasFocusSeq`) in a new `"config"` focus mode.
- `useCanvasNodeFocus` calls `setCenter` with a gentle context zoom (**1.2**), a short **300ms** eased
  animation, and a **left offset (~220px / zoom)** so the node sits left of viewport center, clear of
  the right-side config rail.
- **No-repeat:** `openNode` advances the focus signal only on a genuinely-new selection — re-opening
  the already-active node does **not** re-pan (no repeated zoom loop).
- Opening a **different** node pans again toward the new node.
- The existing **reveal / "Go to field"** path is unchanged: `"reveal"` mode stays centered (offset 0)
  with the closer zoom **1.75** / **450ms**.
- **Drag and connection-handle flows never trigger focus** — drag goes through the graph slice
  (`onNodeDragStop`) / local `rfNodes` (`onNodesChange`), and connecting goes through `onConnect` →
  `connectNodes`; none of these advance the config focus signal.

### 3c. Connection / edge UX
- **Root cause:** `handleConnect` wrapped `connectNodes` in an **empty catch**, so a rejected attempt
  (self-loop / duplicate / unknown node) just "snapped back" with no explanation. Handles were 8px,
  panel-fill, low-contrast, with no hover emphasis.
- **Affordance:** handle base styling moved from per-node inline styles to a `.builder-handle` class.
  Default look stays subtle (no canvas clutter); on **node hover/selection** handles gain an accent
  border + `accent-soft` ring, and they carry an explicit **crosshair** cursor (RF only sets crosshair
  via `.connectionindicator`). Node-body drag cursor (`grab`/`grabbing`) is unaffected — the handle is
  the more-specific element under the pointer.
- **Invalid-connection feedback:** `handleConnect` now catches `connectNodes`' error and shows its
  message — `connectNodes` stays the **single source of validation truth** — as a small, auto-dismissing
  `role="status"` / `aria-live="polite"` banner (`ConnectionHintBanner`, mirroring
  `NoTriggerRecoveryBanner`). Self-loop → "Self-loops are not allowed."; duplicate → "An edge … already
  exists." A subsequent valid connect (or the × button) clears it.
- **Unchanged:** valid connects still create the edge via `connectNodes` (existing mutation path); edge
  rendering/semantics untouched; **trigger topology unchanged** — trigger nodes omit the target handle,
  so action→trigger / trigger→trigger remain structurally impossible to drag.

## 4. Security / no-leak guarantees

No change to the security surface. All three slices are client-side builder UI / canvas-navigation
only: no new endpoints, no credential/token handling, no membership or RLS-gated reads, no
service-role writes. `useCanvasNodeFocus` is navigation-only (`setCenter`); the connection hint is
local component state; none of it mutates anything beyond the in-memory graph slice on a valid connect.

## 5. Data / RLS / model notes

None. No tables, no migrations, no RLS/GRANT changes, no account-model implications. Nothing to apply.

## 6. UI behavior

- Dragging a node moves it live under the pointer; it settles into a non-overlapping final position on
  release. Cursor reflects `grab` (hover) → `grabbing` (active drag).
- Clicking a node opens its config rail and gently pans/zooms the canvas so the node stays visible
  beside the panel; clicking the same node again does nothing extra; clicking a different node re-pans.
- "Go to field" / reveal continues to use its closer, centered focus.
- Connection handles are quiet until you hover/select a node, then light up (accent ring) and show a
  crosshair cursor so connect points are easy to find and aim at. Attempting an invalid connection
  (self-loop / duplicate) shows a brief inline banner with the reason instead of silently snapping back.
- No fake or unsupported controls were added. **No toast system was introduced** — the hint reuses the
  existing inline `role="status"` banner pattern (no new dependency).

## 7. Deferred / known limitations

- The config-panel offset is a **fixed `220px / zoom` heuristic**, not measured from the actual rail
  width — if the rail width changes materially the clearance is approximate.
- There is **no "already comfortably visible, skip focus" check** yet — opening config always pans/zooms
  toward the node even when it is already well within view.
- Some focus/config tests emit cosmetic React `act(...)` warnings around `openNode` calls (the tests
  call `openNode` outside `act`); the suites pass and behavior is unaffected. Clean up only if it
  becomes CI noise or those tests are touched again.
- **Connection hint timer:** re-triggering the **same** invalid message does not reset the 4s
  auto-dismiss timer (identical-string state → no re-render → effect doesn't re-arm). Cosmetic only;
  the banner is already visible.
- **No toast system** was introduced intentionally — there is no toast library in V2, so the hint
  deliberately reuses the inline `role="status"` banner pattern rather than adding a dependency.
- The `services/analytics/sources/monday/api.ts` **typecheck error is unrelated parallel WIP**, not
  caused by this canvas slice (untracked file, not in this arc). Left for the analytics session.

## 8. Verification baseline

**Run this session (newly measured at `fde9b1110`):**
- `npx jest` on `useCanvasNodeFocus.test.tsx` + `WorkflowCanvas.drag.test.tsx` → **2 suites, 11 tests
  passed.** (Covers: config-open gentle-zoom + left offset, no-re-pan on same node, re-pan on different
  node, reveal-unchanged, and drag never advancing the focus signal.)

**Inherited / reported by the implementation session (NOT re-run this session):**
- Node-drag implementation tests: controlled flow exposes `nodes` + `onNodesChange`; a live node change
  updates local RF state without persisting mid-drag; drag-stop persists the final position.
- Canvas + WorkflowBuilder suites: **154 passed**.
- focus + drag + canvas suites: **31 passed**.
- Full `tests/unit/features/workflow-builder`: **1972 passed**.
- `typecheck` exit 0; eslint on touched files 0; `lint:structure` OK.
- Manual (running builder): node drag works; config-open focus/zoom works.

**Connection UX slice (`784fe89d9`) — run during that slice / its smoke (at the commit):**
- Focused: connect + drag + focus + node-card → **4 suites, 36 passed** (re-run at the manual-smoke step).
- Connection implementation suite + drag + node-card + focus + graphSlice → **121 passed**.
- Full `tests/unit/features/workflow-builder/canvas/` → **12 suites, 115 passed**.
- `eslint` on touched files → **0**; `npm run lint:structure` → **OK**.
- `npm run typecheck` → one error in `services/analytics/sources/monday/api.ts` (**unrelated untracked
  parallel analytics WIP**, not in HEAD, not touched by this slice); the canvas files are type-clean.

**Migrations:** none. **Feature flags:** none added; behavior is unconditional builder UI.

**Manual verification (human pass):** Marcus tested the connection UX in the running builder and
reported: _"this feels super smooth. i've tested it"_ — the handle affordance and live connection
preview confirmed by a human, closing out the subjective "feel" items the smoke step could not assert.

## 9. Recommended next tracks

- Replace the fixed `220px / zoom` config offset with a value derived from the actual config-rail
  width (e.g. measured panel width) so clearance is exact across rail-width changes.
- Add an "already comfortably visible" guard so config-open skips the pan/zoom when the node is already
  well within the viewport (avoids unnecessary motion).
- Silence the `act(...)` warnings if/when those focus tests are next touched.

## 10. Closeout confirmation

**Docs-only. Nothing pushed.** Doc path: `docs/slices/phase-4/workflows/builder-canvas-ux-closeout.md`.
All three source commits (`192826625`, `fde9b1110`, `784fe89d9`) plus the two closeout commits
(`a32d06fbf`, this CLOSEOUT-2 revision) are local on `v2-main` and unpushed.
