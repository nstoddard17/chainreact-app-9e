# Builder UX mini-arc — Closeout

**Type:** Post-ship closeout (docs-only). Nothing pushed from this arc.
**Date:** 2026-06-16
**Branch:** `v2-main`
**Scope:** workflow-builder canvas layout + add-node ergonomics + node quick actions + top
tabs + single selected-node config tab model + Data Map MVP outline + single config-panel
close + Settings MVP (real workflow-level metadata).

> **STATUS: LOCAL / UNPUSHED.** All commits are local on `v2-main` and **not pushed**.
> Not yet production-smoked. **No migration, no feature flag, no backend change** — this
> arc is entirely builder UI / canvas / client graph-state.
>
> An earlier closeout (`720e2195e`) was written **prematurely** and **reverted**
> (`cfa837bfe`). An interim closeout (`abea98f81`) covered the arc through SHELL-TABS-1; a
> second pass (`42297da93`) extended it through the Data Map MVP. **This revision supersedes
> both**, adding the Settings MVP (`67ee7f6a6`) as the final slice of the arc.
>
> **Parallel-session note:** a separate parallel AI / CLI / security session committed its
> own unrelated local work **interleaved** with this arc (CLI scaffolding/executor +
> `V2-READY-47E/48/49/50` security/docs). Those commits are **NOT part of this arc** — see §10
> for the explicit split. They advanced `HEAD` between builder commits but touch disjoint
> files.

---

## 1. User-visible problems (from Marcus's live usage)

1. Nodes could **overlap** on the canvas.
2. **Arrange** was in the wrong place (top action bar) instead of with the zoom/fit controls.
3. A **manual drag** could still drop a node on top of another (overlap).
4. No clear **add-at-bottom / branch-tail append** affordance — add effectively happened mid-chain or only via a top-right button.
5. **Rename / delete** required opening the config panel.
6. The **top builder tabs were dead disabled placeholders**.
7. **"Schema"** was not a user-friendly tab name.
8. The **right-side config panel had duplicated / dead tab rows** (an outer
   `Setup | Advanced | Test | Variables` over an inner `Setup | Advanced | Results | Data
   Inspector` — both confusing and mostly dead).
9. The config panel showed **two close (×) controls** (one in the panel header, one inside
   the selected-node content near the title).
10. **Data Map was still only a placeholder** even when the workflow already had nodes.
11. **Settings was still only a placeholder** after the top-tab cleanup — it just said
    workflow settings would live there.

## 2. Completed commit chain (builder UX only)

- `a6ec958ac` — non-overlap append-at-end + arrange-all canvas layout (BUILDER-CANVAS-LAYOUT-1) _(2026-06-16)_
- `424facf54` — non-overlapping mid-chain insert placement (BUILDER-CANVAS-LAYOUT-2) _(2026-06-16)_
- `d812e02b6` — node-level quick rename + delete on the canvas (BUILDER-NODE-QUICK-ACTIONS-1) _(2026-06-16)_
- `cfa837bfe` — **revert** of the premature closeout (`720e2195e`) _(2026-06-16)_
- `79f47ffc2` — canvas ergonomics: Arrange in controls, drag non-overlap, tail + append (BUILDER-CANVAS-ERGONOMICS-FIX-1) _(2026-06-16)_
- `48392d318` — rename top tabs to Builder | Runs | Data Map | Settings + empty states (BUILDER-SHELL-TABS-1) _(2026-06-16)_
- `abea98f81` — interim closeout, superseded by this doc (BUILDER-UX-MINI-ARC-CLOSEOUT) _(2026-06-16)_
- `5024f184f` — single selected-node config tab model: Setup | Test | Data (BUILDER-CONFIG-TABS-1) _(2026-06-16)_
- `9de915b50` — Data Map MVP outline + single config-panel close (BUILDER-DATA-MAP-MVP-1) _(2026-06-16)_
- `42297da93` — second-pass closeout doc (through Data Map), superseded by this revision (BUILDER-UX-MINI-ARC-CLOSEOUT) _(2026-06-16)_
- `67ee7f6a6` — top-level Settings tab MVP: real workflow-level metadata (BUILDER-SETTINGS-MVP-1) _(2026-06-16)_

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
- **Right config panel now has ONE tab strip: Setup | Test | Data** (CONFIG-TABS-1) — the
  duplicated outer + inner tab rows collapsed into a single functional model. Setup is the
  real form; Test / Data show honest empty states (per-step test execution + the node-level
  data context are deferred). **Advanced is omitted entirely until a node actually has
  advanced metadata** (no dead tab).
- **Data Map MVP shows a graph-derived workflow outline when actions exist** (DATA-MAP-MVP-1)
  — see §5. Trigger-only / empty workflows keep the honest empty state.
- **Duplicate inner config-panel close (×) removed** (DATA-MAP-MVP-1) — only the
  drawer-level close (next to "Node configuration") remains. The unsaved-edit discard guard
  the inner × triggered is preserved via the footer **Cancel** button (same handler), so no
  behavior was lost.
- **Settings MVP shows real workflow-level sections + values** (SETTINGS-MVP-1) — see §6.
  Four sections (General · Status & publishing · Run behavior · Error handling &
  notifications) render real values where available (workflow name, status, publish state,
  unsaved + unpublished state, trigger type, node/edge/action counts, created/updated
  timestamps) with explicit "Coming later" rows for not-yet-built behavior. Read-only this
  slice (editing deferred — see §6).

## 4. Branch behavior

- **Per-branch tail "+" is the intended append path** — every chain/branch end (a node with
  no outgoing edge) renders its own "+ Add step", so an append targets that exact branch and
  never guesses. `addActionAfter` throws on an unknown anchor rather than guessing.
- **The global "Add action" CTA is disabled + redirected when multiple tails exist** —
  tooltip: "use the + on the step you want to extend." It stays enabled for the single-tail
  / first-action case.
- **Arrange lays split branches side-by-side by column** (`layoutWorkflowGraph`: component →
  BFS-depth rows → sibling columns), not stacked.

## 5. Data Map behavior (DATA-MAP-MVP-1)

- **Frontend-only.** Derived entirely from the current **draft** graph
  (`graphSlice.pending*`) + existing node/action/trigger metadata. No run-result /
  sample-data plumbing, no backend call.
- **Trigger-only / empty workflow** → the same honest empty state (reuses the SHELL-TABS-1
  placeholder copy); no outline.
- **Workflow with action steps** → a **workflow-ordered outline** (forward BFS from the
  trigger; trigger first, then actions in graph order). Per node: display name,
  provider label, operation/type label, **configured field LABELS** (never values),
  **variables used** (friendly source label + path; deleted/unknown source refs flagged
  "no longer available"), and **metadata-declared outputs** (or an honest "appears after
  testing / once metadata available" note).
- **No-leak posture:** field labels only — **never config values**; variable references show
  a friendly source label + path, **never the raw `{{nodeId.path}}` token or internal node
  id**; broken refs say "Unknown step"; **no raw JSON / schema dump**; no DB ids; no provider
  secrets (credentials never live in node config). The **trigger's** outputs offer a safe
  copyable `{{trigger.<path>}}` token (carries no id); **action-output copy tokens are
  deferred** (they would require rendering a raw node id).
- **Reuse, not reinvention:** tokenization via `core/workflows/variableReferences`
  (`parseReferences`); the broken-ref definition mirrors
  `core/workflows/invalidVariableReferences.ts`; meta resolution mirrors the
  `useUpstreamVariables` pattern. New pure helper:
  `core/workflows/configVariableReferences.ts` (all-refs collector, top-level string /
  string[] scope — same as the broken-ref detector).

## 6. Settings behavior (SETTINGS-MVP-1)

- **Frontend-only.** Derived entirely from data already available in the builder: the
  `WorkflowDetail` subset threaded from `WorkflowBuilder` (name, state, `activeRevisionId`,
  `unpublishedChanges`, created/updated) + the live `graphSlice` draft (trigger type, node/
  edge/action counts, save status). No new backend route, no fetch, no migration.
- **Four real sections, no dead/blank UI:**
  - **General** — workflow name (read-only); Description + Folder as "Coming later" rows.
  - **Status & publishing** — Status (Draft/Active/…), Publish state (Published / Not
    published yet, from `activeRevisionId`), Unpublished changes (only when active +
    `unpublishedChanges`), Save status (live from `graphSlice.isDirty`/`isSaving`), Created +
    Last updated (deterministic UTC timestamps).
  - **Run behavior** — Trigger type (e.g. `manual.run`), Steps (action count), Graph (node ·
    edge counts); Schedule & timezone as a "Coming later" row.
  - **Error handling & notifications** — Retry, Failure notifications, Access & permissions
    as "Coming later" rows.
- **Read-only this slice. Editing intentionally deferred** — the v2 builder has **no existing
  safe client metadata-update path**: `graphSlice.save()` persists only `draftDefinition`, so
  wiring a name/description PATCH from Settings would be net-new backend interaction that
  could race the draft save. Deferred path documented in the component (PATCH
  `/api/workflows/[id]` `name`, ideally via a shared rename action).
- **Clear boundaries (asserted by test):** workflow-LEVEL metadata only — **no provider
  credentials** (those live in Apps / Connections) and **no node-level config values** (those
  live in the right config panel). Copy points users to both.
- **Not available in current client data → honest "Coming later":** `description` and
  `folderId` are not on `WorkflowDetail` client-side; schedule/timezone, retry/error
  handling, failure notifications, and access/permissions are not built yet.
- New component: `features/workflow-builder/canvas/SettingsPanel.tsx`; new optional
  `WorkflowCanvas` `workflowSettings` prop threaded from `WorkflowBuilder`.

## 7. Safety constraints honored

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

## 8. Verification baseline

**Inherited** from each slice's own implementation report (measured at the time of that
slice, **not re-run for this closeout**):

| Slice | Focused tests | Full builder suite | tsc | lint / structure |
|------|---------------|--------------------|-----|------------------|
| LAYOUT-1 `a6ec958ac` | 110 | 1770 | exit 0 | eslint touched 0; `npm run lint` 0 errors; structure OK |
| LAYOUT-2 `424facf54` | 121 | 1776 | exit 0 | eslint touched 0; structure OK |
| QUICK-ACTIONS-1 `d812e02b6` | 91 | 1790 | exit 0 | eslint touched 0; `npm run lint` 0 errors; structure OK |
| ERGONOMICS-FIX-1 `79f47ffc2` | 196 | 1806 | exit 0 | eslint touched 0; `npm run lint` 0 errors / 23 warnings; structure OK |
| SHELL-TABS-1 `48392d318` | 20 (canvas) | 1810 | exit 0 | eslint touched 0; structure OK |
| CONFIG-TABS-1 `5024f184f` | config-modal suite | (per slice report) | exit 0 | eslint touched 0; structure OK |

**Measured during this conversation's implementation turns** (via the MCP verification
tools, exact results):

- **DATA-MAP-MVP-1 `9de915b50`:** `typecheck` → **exit 0**. Focused / related Jest suites
  all green — `configVariableReferences.test.ts` 6/6 · `DataMapPanel.test.tsx` 7/7 ·
  `ConfigModalShell.test.tsx` 50/50 (covers the CONFIG-TABS-1 tab model + the
  single-close-control assertions) · `WorkflowCanvas.test.tsx` 20/20 ·
  `NodeInspectorPanel.test.tsx` 10/10 · `canvas-config-sync.test.tsx` 6/6 ·
  `BuilderRightDrawer.test.tsx` 6/6. `npm run lint` → **0 errors / 23 warnings**;
  `lint:structure` → **OK**.
- **SETTINGS-MVP-1 `67ee7f6a6`:** `typecheck` → **exit 0**. `SettingsPanel.test.tsx` 8/8
  (real values · UTC timestamps · live unsaved-state · published vs not · "Coming later"
  rows · credentials/node-config NOT presented) · `WorkflowCanvas.test.tsx` 20/20 (Settings
  tab renders the real panel + boundary assertions; tab-swap test moved to the Runs
  placeholder). `npm run lint` → **0 errors / 23 warnings** (all pre-existing, none in
  touched files — incl. the parallel session's `services/oauth/dispatcher.ts`);
  `lint:structure` → **OK** (every leaf folder ≤ 50 files).

> The full `~1810+`-test builder suite was **not** re-run as a whole; the per-slice canvas-era
> totals in the table are inherited from the slice reports. **This closeout edit itself is
> docs-only — it runs nothing new.**

New deterministic coverage added across the arc: pure `workflowLayout` helpers
(`findChainTailId`, `computeNonOverlappingPosition`, `layoutWorkflowGraph`,
`collectDownstreamIds`, `resolveNonOverlappingDrop`), `addAction` chain-tail + non-overlap,
`addActionAfter`, `autoLayout`, mid-chain insert overlap/branch cases, node quick
rename/delete + keyboard isolation, tail "+" rendering/branch-specific append, branch-aware
CTA gating, renamed tabs + per-tab empty states, the single Setup | Test | Data tab model +
single-close-control assertions, the Data Map outline (trigger-only empty / linear /
action→action / trigger-token / no-leak), the `configVariableReferences` collector, and the
Settings panel (real sections/values · UTC timestamps · live save-status · published vs not ·
"Coming later" rows · credential/node-config boundary).

## 9. Caveats / deferred

- **Real Runs tab wiring deferred** — `features/workflow-builder/panels/RunHistory.tsx`
  exists but is server-fed (via `app/workflows/[id]/page.tsx`); wiring it into the tab needs
  client data plumbing. It is the future seam.
- **Workflow Settings editing deferred** — Settings is read-only this slice; name/description
  editing needs a safe client metadata-update path (builder save only persists
  `draftDefinition`), so it was intentionally not wired.
- **`description` / `folder` unavailable in current `WorkflowDetail` client data** — both are
  absent from the wire shape the builder receives, so Settings shows them as "Coming later"
  rather than fabricating values. Surfacing them needs the detail endpoint to include them.
- **Settings behavior sections deferred** — schedule/timezone, retry/error handling, failure
  notifications, and access/permissions render honest "Coming later" rows (not built yet).
- **Node-level Test execution deferred** — the config panel's Test tab is an honest empty
  state; per-step test runs aren't wired.
- **Node-level Data tab wiring remains empty-state-only** — the per-node data context (in
  the config panel) is not yet populated; the top-level Data Map MVP is the live surface.
- **Run-result / sample-data plumbing deferred** — the Data Map (and node Data tab) show
  metadata-declared shape, not captured run values.
- **Action-output copy tokens deferred** — only the trigger offers copyable
  `{{trigger.<path>}}`; action outputs would need a raw node id, so no copy button yet.
- **Nested-config variable scanning deferred** — the variable collector scans top-level
  string / string[] config (same scope as the broken-ref detector); keyvalue maps / router
  routes are out of scope for this slice.
- **Tail "+ Add step" lives in the node footer** for now (ReactFlow card clipping), not a
  hanging connector below the card. Still at the chain/branch end and clearly "add the next
  step." A hanging connector is possible later polish.
- **No browser E2E** for ReactFlow internals — jsdom can't simulate ReactFlow drag, so
  drag-overlap is verified at the pure-helper seam + typed wiring; tab swap is verified via
  the `.react-flow` container. Seams are covered by helper / component / hook / state tests.
- **A `max-lines` warning on `graphSlice.ts`** (~468 lines) is pre-existing (already >400
  before this arc); under the 500 hard cap. `WorkflowCanvas.tsx` was kept under the cap by
  extracting `CanvasActionBar.tsx` + `BuilderTabPlaceholder.tsx` (SHELL-TABS-1),
  `DataMapPanel.tsx` (DATA-MAP-MVP-1), and `SettingsPanel.tsx` (SETTINGS-MVP-1). A future
  `graphSlice` extraction is possible if it grows past the soft cap.

## 10. Push / deploy status

- **Local only.** Nothing pushed.
- `v2-main` is **ahead of `origin/v2-main`** (these commits + earlier unpushed work).
- **No production push / deploy** from this arc; not yet prod-smoked.
- **Parallel non-builder commits exist locally and are NOT part of this arc.** A separate
  parallel AI / CLI / security session committed, interleaved with the builder commits:
  `3bdd5486c` (cli: trigger scaffolding), `0cac51058` (V2-READY-47E), `1acdf0382`
  (cli: verify --changed), `42433bff6` (V2-READY-48), `578452dda` (cli: structured
  executor), `0a91d4ad7` (V2-READY-49), `d44880af2` (cli: verify --changed --report),
  `2c99a71bd` (V2-READY-50). They touch disjoint files (CLI / OAuth / security docs) and
  advanced `HEAD` between builder commits; the builder arc owns only the ten builder commits
  in §2 (eight slices + two superseded closeout-doc commits). That session may also have
  in-flight uncommitted edits under `scripts/chainreact/**` — **left untouched** by this
  closeout.

## 11. Closeout confirmation

Docs-only. Nothing pushed. Doc:
`docs/slices/phase-4/workflows/builder-ux-mini-arc-closeout.md`.

> **PROJECT_MEMORY:** the single compact LOCAL/UNPUSHED bullet for this mini-arc under
> "Recently completed arcs" is updated in the same commit as this doc to extend its range to
> `67ee7f6a6` and include the Settings MVP (no new bullet — the existing one is amended).
