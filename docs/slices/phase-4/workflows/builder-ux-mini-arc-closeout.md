# Builder UX mini-arc — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this arc.
**Date:** 2026-06-16
**Branch:** `v2-main`
**Scope:** workflow-builder canvas layout + add-node ergonomics + node quick actions + top tabs.

> **STATUS: LOCAL / UNPUSHED.** All commits are local on `v2-main` and **not pushed**.
> Not yet production-smoked. **No migration, no feature flag, no backend change** — this
> arc is entirely builder UI / canvas / client graph-state.
>
> An earlier closeout (`720e2195e`) was written **prematurely** and **reverted**
> (`cfa837bfe`) because the arc was not complete; this doc is the real closeout after the
> ergonomics fix + tab cleanup landed.

---

## 1. User-visible problems (from Marcus's live usage)

1. Nodes could **overlap** on the canvas.
2. **Arrange** was in the wrong place (top action bar) instead of with the zoom/fit controls.
3. A **manual drag** could still drop a node on top of another (overlap).
4. No clear **add-at-bottom / branch-tail append** affordance — add effectively happened mid-chain or only via a top-right button.
5. **Rename / delete** required opening the config panel.
6. The **top tabs were dead disabled placeholders**, and **"Schema"** was not user-friendly.

## 2. Completed commit chain

- `a6ec958ac` — non-overlap append-at-end + arrange-all canvas layout (BUILDER-CANVAS-LAYOUT-1) _(2026-06-16)_
- `424facf54` — non-overlapping mid-chain insert placement (BUILDER-CANVAS-LAYOUT-2) _(2026-06-16)_
- `d812e02b6` — node-level quick rename + delete on the canvas (BUILDER-NODE-QUICK-ACTIONS-1) _(2026-06-16)_
- `cfa837bfe` — **revert** of the premature closeout (`720e2195e`) _(2026-06-16)_
- `79f47ffc2` — canvas ergonomics: Arrange in controls, drag non-overlap, tail + append (BUILDER-CANVAS-ERGONOMICS-FIX-1) _(2026-06-16)_
- `48392d318` — rename top tabs to Builder | Runs | Data Map | Settings + empty states (BUILDER-SHELL-TABS-1) _(2026-06-16)_

## 3. What shipped

- **Append-at-end anchors on the real chain tail** — `addAction` anchors on the sole leaf
  (not the array tail), so the CTA appends to the chain's end, not off the middle.
- **Appended nodes never overlap** — `computeNonOverlappingPosition` replaces the old
  `length × 120` heuristic.
- **Mid-chain insert opens a row** — pushes B and its **downstream subtree** down only by
  the needed amount, then places the new node via the shared non-overlap helper; branch-safe.
- **Arrange moved to the bottom-left zoom/fit cluster** (a ReactFlow `ControlButton`),
  removed from the top action bar; same `autoLayout`.
- **Manual drag/drop resolves to a non-overlapping position** — `resolveNonOverlappingDrop`
  keeps a clear drop as-is and steps a drop-on-top down to the nearest clear slot before
  persisting; normal dragging is undisturbed.
- **Each tail / branch end gets an inline "+ Add step"** — branch-specific append via
  `addActionAfter(nodeId)` (non-overlap placement below the anchor); a tail trigger shows it
  too (adds the first action).
- **Global "Add action" no longer guesses** when multiple tails exist (see §4).
- **Inline node rename** on the card (✎ / double-click title) → `renameNode` (trims; blank
  clears to the metadata default); Enter/blur commit, Escape cancels; keyboard-isolated.
- **Node delete quick action** (🗑) → the **existing** confirm dialog + safe
  `deleteNodeAndRewire` (edge-rewire, multi-edge block, draft-drop). Action nodes only;
  trigger/start node is rename-only.
- **Top tabs are now Builder | Runs | Data Map | Settings** ("Run history" → "Runs",
  "Schema" → "Data Map").
- **Runs / Data Map / Settings have intentional empty states** instead of dead disabled
  tabs — each clickable tab swaps the canvas for a polished panel describing what will live
  there (Settings explicitly notes connections live in Apps and step config lives in the
  step panel).

## 4. Branch behavior

- **Per-branch tail "+" is the intended append path** — every chain/branch end (a node with
  no outgoing edge) renders its own "+ Add step", so an append targets that exact branch and
  never guesses. `addActionAfter` throws on an unknown anchor rather than guessing.
- **The global "Add action" CTA is disabled + redirected when multiple tails exist** —
  tooltip: "use the + on the step you want to extend." It stays enabled for the single-tail
  / first-action case.
- **Arrange lays split branches side-by-side by column** (`layoutWorkflowGraph`: component →
  BFS-depth rows → sibling columns), not stacked.

## 5. Safety constraints honored

UI / canvas / client-graph-state only:
- **No DB migration.**
- **No backend / runtime / execution change** — position + label edits live in the client
  `graphSlice` draft; persistence uses the existing draft save.
- **No activation / deactivation / trigger-registration change.**
- **No credential / integration / provider-account mutation.**
- **No AI behavior change.**
- **No feature flag.**
- Node `displayName` is a USER-only label, never identity. Delete keeps the graph valid via
  the existing safe-rewire contract. Workflow Settings hosts no credentials and no node-level
  config (by design + asserted by test).

## 6. Verification summary

Measured **this session** during each implementation slice (per the slice reports):

| Slice | Focused tests | Full builder suite | tsc | lint / structure |
|------|---------------|--------------------|-----|------------------|
| LAYOUT-1 `a6ec958ac` | 110 | 1770 | exit 0 | eslint touched 0; `npm run lint` 0 errors; structure OK |
| LAYOUT-2 `424facf54` | 121 | 1776 | exit 0 | eslint touched 0; structure OK |
| QUICK-ACTIONS-1 `d812e02b6` | 91 | 1790 | exit 0 | eslint touched 0; `npm run lint` 0 errors; structure OK |
| ERGONOMICS-FIX-1 `79f47ffc2` | 196 | 1806 | exit 0 | eslint touched 0; `npm run lint` 0 errors / 23 warnings; structure OK |
| SHELL-TABS-1 `48392d318` | 20 (canvas) | 1810 | exit 0 | eslint touched 0; structure OK; see §7 lint note |

New deterministic coverage added across the arc: pure `workflowLayout` helpers
(`findChainTailId`, `computeNonOverlappingPosition`, `layoutWorkflowGraph`,
`collectDownstreamIds`, `resolveNonOverlappingDrop`), `addAction` chain-tail + non-overlap,
`addActionAfter`, `autoLayout`, mid-chain insert overlap/branch cases, node quick
rename/delete + keyboard isolation, tail "+" rendering/branch-specific append, branch-aware
CTA gating (driven through the real mounted builder), and the renamed tabs + per-tab empty
states. **This closeout is docs-only — no tests / typecheck / lint were run for it.**

## 7. Caveats / deferred

- **Real Runs tab wiring deferred** — `features/workflow-builder/panels/RunHistory.tsx`
  exists but is server-fed (via `app/workflows/[id]/page.tsx`); wiring it into the tab needs
  client data plumbing. It is the future seam.
- **Real Data Map system deferred** — the tab ships a user-facing empty state only.
- **Real Settings system deferred** — the tab ships an empty state only.
- **Tail "+ Add step" lives in the node footer** for now (ReactFlow card clipping), not a
  hanging connector below the card. Still at the chain/branch end and clearly "add the next
  step." A hanging connector is possible later polish.
- **No browser E2E** for ReactFlow internals — jsdom can't simulate ReactFlow drag, so
  drag-overlap is verified at the pure-helper seam + typed wiring; tab swap is verified via
  the `.react-flow` container. Seams are covered by helper / component / hook / state tests.
- **Full `npm run lint` is currently blocked by unrelated untracked parallel work** (an
  integration-access structure test with 2 lint errors); the builder UX touched files are
  clean (eslint exit 0). The 2 errors are not part of this arc.
- **A `max-lines` warning on `graphSlice.ts`** (now ~468 lines) is pre-existing (already
  >400 before this arc); under the 500 hard cap. `WorkflowCanvas.tsx` was kept under the cap
  by extracting `CanvasActionBar.tsx` + `BuilderTabPlaceholder.tsx` in SHELL-TABS-1.

## 8. Push / deploy status

- **Local only.** Nothing pushed.
- `v2-main` is **ahead of `origin/v2-main`** (these commits + earlier unpushed work).
- **No production push / deploy** from this arc; not yet prod-smoked.

## 9. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/workflows/builder-ux-mini-arc-closeout.md`.

> **PROJECT_MEMORY note:** a compact memory bullet for this mini-arc was **deferred** this
> turn because `docs/PROJECT_MEMORY.md` currently carries uncommitted unrelated parallel-work
> edits; committing it would entangle that work. Record the bullet once the parallel edit
> lands (or via the memory-curator) — marked LOCAL/UNPUSHED.
