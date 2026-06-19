# Builder Canvas UX (drag + config-open focus) — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this arc.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Marker:** `BUILDER-CANVAS-UX-CLOSEOUT-1`
**Scope:** workflow-builder canvas — (1) live node drag with controlled React Flow + grab/grabbing
cursor; (2) focus/zoom the canvas toward a node when its config panel opens.

> **STATUS: LOCAL / UNPUSHED.** Both commits are local on `v2-main` and **not pushed**.
> **No migration, no feature flag, no backend change** — this arc is entirely builder UI /
> canvas / client config-state. No workflow data, routing, billing, AI, or RLS impact.

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

## 2. Completed commit chain

- `192826625` — fix(builder-canvas): live node drag + grab/grabbing cursor (BUILDER-CANVAS-NODE-DRAG-UX-AUDIT-1) _(2026-06-19)_
- `fde9b1110` — feat(builder-canvas): focus/zoom canvas toward a node when its config opens (BUILDER-CANVAS-FOCUS-SELECTED-NODE-1) _(2026-06-19)_

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

## 4. Security / no-leak guarantees

No change to the security surface. Both commits are client-side builder UI / canvas-navigation only:
no new endpoints, no credential/token handling, no membership or RLS-gated reads, no service-role
writes. `useCanvasNodeFocus` is navigation-only (`setCenter`); it never mutates graph state, config,
or runs anything.

## 5. Data / RLS / model notes

None. No tables, no migrations, no RLS/GRANT changes, no account-model implications. Nothing to apply.

## 6. UI behavior

- Dragging a node moves it live under the pointer; it settles into a non-overlapping final position on
  release. Cursor reflects `grab` (hover) → `grabbing` (active drag).
- Clicking a node opens its config rail and gently pans/zooms the canvas so the node stays visible
  beside the panel; clicking the same node again does nothing extra; clicking a different node re-pans.
- "Go to field" / reveal continues to use its closer, centered focus.
- No fake or unsupported controls were added.

## 7. Deferred / known limitations

- The config-panel offset is a **fixed `220px / zoom` heuristic**, not measured from the actual rail
  width — if the rail width changes materially the clearance is approximate.
- There is **no "already comfortably visible, skip focus" check** yet — opening config always pans/zooms
  toward the node even when it is already well within view.
- Some focus/config tests emit cosmetic React `act(...)` warnings around `openNode` calls (the tests
  call `openNode` outside `act`); the suites pass and behavior is unaffected. Clean up only if it
  becomes CI noise or those tests are touched again.

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

**Migrations:** none. **Feature flags:** none added; behavior is unconditional builder UI.

## 9. Recommended next tracks

- Replace the fixed `220px / zoom` config offset with a value derived from the actual config-rail
  width (e.g. measured panel width) so clearance is exact across rail-width changes.
- Add an "already comfortably visible" guard so config-open skips the pan/zoom when the node is already
  well within the viewport (avoids unnecessary motion).
- Silence the `act(...)` warnings if/when those focus tests are next touched.

## 10. Closeout confirmation

**Docs-only. Nothing pushed.** Doc path: `docs/slices/phase-4/workflows/builder-canvas-ux-closeout.md`.
Both source commits (`192826625`, `fde9b1110`) are local on `v2-main` and unpushed.
