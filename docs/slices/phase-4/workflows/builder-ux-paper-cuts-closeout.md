# Builder UX paper-cuts mini-arc — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this arc.
**Date:** 2026-06-16
**Branch:** `v2-main`
**Scope:** workflow-builder canvas layout + node-card quick actions.

> **STATUS: LOCAL / UNPUSHED.** All three commits are local on `v2-main` and **not
> pushed** (`a6ec958ac`, `424facf54`, `d812e02b6`). Not yet production-smoked. **No
> migration, no feature flag, no backend change** — this arc is entirely
> builder UI / canvas / client graph-state.

---

## 1. User-visible problems (from Marcus's live usage)

1. **Nodes could overlap** on the canvas — should never happen.
2. **No clear "add at the end of the chain"** path — the visible affordances effectively
   added in the middle.
3. **No "arrange neatly" action** to tidy a messy layout.
4. **Rename / delete required opening the config panel** — there was no node-level quick
   action on the canvas.

## 2. What shipped

**BUILDER-CANVAS-LAYOUT-1** (`a6ec958ac`):
- **Append-at-end anchors on the chain tail.** `graphSlice.addAction` now anchors on the
  sole leaf action (the real chain end), not the array tail — so the "+ Add action" CTA
  appends to the chain's end instead of branching off whatever was last inserted. Ambiguous
  tails fall back to the prior behavior; trigger-only is unchanged.
- **Appended nodes never overlap.** Position comes from `computeNonOverlappingPosition`
  (place below the anchor, step down until clear), replacing the old `length × 120`
  heuristic that collided after a delete shrank the array. A freshly-built linear chain
  gets identical positions to before.
- **Arrange action.** New `graphSlice.autoLayout()` + an **"Arrange"** button in the canvas
  action bar apply the pure `layoutWorkflowGraph` (component → BFS-depth rows → sibling
  columns; branches, disconnected pieces, and cycles all non-overlapping). Dirty flips only
  when a position actually moved; disabled on an empty canvas.

**BUILDER-CANVAS-LAYOUT-2** (`424facf54`):
- **Mid-chain insert opens a row instead of overlapping.** The edge "+" insert used to drop
  the new node at the A↔B midpoint, which overlapped both endpoints when they were one row
  apart. It now pushes B and its **downstream subtree** down by only the shortfall needed
  (endpoints already far enough apart don't move), then places the node via the shared
  `computeNonOverlappingPosition` — guaranteed clear of every node.
- **Branch-safe.** Only the clicked edge's downstream subtree shifts; parallel branches in
  other columns are untouched (`collectDownstreamIds` is cycle-safe and excludes the
  inserted node).

**BUILDER-NODE-QUICK-ACTIONS-1** (`d812e02b6`):
- **Inline node rename** on the card (✎ button or double-click the title) — commits through
  the existing `graphSlice.renameNode` (trims; blank clears to the metadata default). Enter/
  blur commit, Escape cancels. The editor isolates keydown + pointer events (`nodrag nopan`)
  so canvas shortcuts (Delete/Backspace) and node select/drag never fire while typing.
- **Node delete quick action** (🗑) — routes through the **existing** confirm flow: a new
  `requestDelete()` on `useCanvasNodeDeletion` arms the same `pendingDelete` the keyboard
  path uses, so `DeleteNodeConfirmDialog` + the safe `deleteNodeAndRewire` (edge-rewire,
  multi-edge block, draft-drop) are reused unchanged. **Delete always confirms first.**
- **Restricted nodes:** one-click delete renders on **action nodes only**; trigger / manual
  start nodes get rename only (the start node stays deletable via the existing keyboard +
  confirm path with the recovery banner, just not as a one-click affordance).
- Handlers reach the ReactFlow-rendered card via a small `BuilderNodeActionsContext`
  (keeps node `data` a narrow read-only window). Labels use "step" — never a raw node id.

## 3. Safety constraints honored

This arc is **UI / canvas / client graph-state only**:
- **No DB migration.**
- **No backend / runtime / execution change** — position + display-label edits live in the
  client `graphSlice` draft; persistence uses the existing draft save.
- **No activation / deactivation / trigger-registration change.**
- **No credential / integration / provider-account mutation.**
- **No AI behavior change** (the AI-repair surfaces are untouched).
- **No feature flag** — low-risk UI, on by default.
- Node `displayName` is a USER-only label, never identity (edges/dispatch/persistence key
  on `id`). Delete keeps the graph valid via the existing safe-rewire contract.

## 4. Verification summary

Measured **this session** during each implementation slice (per the three slice reports):

| Slice | Focused tests | Full builder suite | tsc | lint |
|------|---------------|--------------------|-----|------|
| LAYOUT-1 `a6ec958ac` | 110 passed (layout/graphSlice/canvas) | 1770 passed | exit 0 | eslint touched 0; `npm run lint` 0 errors; structure OK |
| LAYOUT-2 `424facf54` | 121 passed (+insert) | 1776 passed | exit 0 | eslint touched 0; structure OK |
| QUICK-ACTIONS-1 `d812e02b6` | 91 passed (canvas + hook) | 1790 passed | exit 0 | eslint touched 0; `npm run lint` 0 errors; structure OK |

New deterministic coverage added across the arc: pure `workflowLayout` helpers
(`findChainTailId`, `computeNonOverlappingPosition`, `layoutWorkflowGraph`,
`collectDownstreamIds`), `addAction` chain-tail + non-overlap, `autoLayout`, mid-chain
insert overlap/branch cases, node quick rename (commit/blur/cancel/seed/keyboard-isolation),
quick delete → confirm → safe rewire, and trigger-restricted behavior. Append-at-end and
Arrange are regression-tested together with the insert change. **Note on `npm run lint`:**
`graphSlice.ts` carries a pre-existing `max-lines` **warning** (was 412 before LAYOUT-1,
~432 after — still under the 500 hard cap); 0 errors throughout. `WorkflowNodeCard.tsx`
briefly crossed the soft cap in QUICK-ACTIONS-1 and was brought back under by extracting
`NodeCardQuickActions.tsx`.

**This closeout is docs-only — no tests / typecheck / lint were run for it.**

## 5. Caveats / deferred

- **Extreme hand-dragged layouts** can still end up loosely spaced after a mid-chain insert
  (only the clicked edge's downstream subtree moves). The non-overlap invariant always
  holds; **Arrange** normalizes spacing in one click.
- **Quick actions are always rendered but visually subtle** (`opacity-60`, emphasized on
  hover) rather than hover/selection-only — this keeps them discoverable on touch and
  testable. A hover/selection-only reveal is possible later polish.
- **No full browser E2E** asserts the buttons inside the live ReactFlow canvas — the
  existing canvas tests deliberately don't render node internals in jsdom. The seams are
  covered by component (card → handler), hook (`requestDelete` → state → safe rewire), and
  state (`graphSlice` / pure layout) tests; the canvas→context wiring is typed and trivial.
- Multi-select delete remains blocked ("one at a time") — unchanged from the prior
  keyboard-delete slice.

## 6. Push / deploy status

- **Local only.** Nothing pushed.
- `v2-main` is **ahead of `origin/v2-main`** (includes these three commits + earlier
  unpushed work).
- **No production push / deploy** from this arc; not yet prod-smoked.

## 7. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/workflows/builder-ux-paper-cuts-closeout.md`.
