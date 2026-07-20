# 5.DUAL-BUILDER-1 — Dual Builder (Visual + Document) Research & Implementation Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed, deployed, migrated, or flagged.**
**Date:** 2026-07-19
**Branch:** `v2-main` (local)

**Design source:** claude.ai/design project **ChainV2Builder**
(`3c6250cb-eea4-43e4-b28e-76fd497ba49b`), imported via the design MCP this session.
Primary entry: *Builder - Creation Layer.html*; full inventory in §3.

**Source of truth (verified current state):**
[contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts) (canonical nodes/edges/positions/labels — read in full) ·
[features/workflow-builder/state/graphSlice.ts](../../../features/workflow-builder/state/graphSlice.ts) (canonical draft state, dirty/save/undo) ·
[services/execution/branching.ts](../../../services/execution/branching.ts) (`selectActivatedEdges` branch semantics) ·
[features/workflow-builder/utils/workflowLayout.ts](../../../features/workflow-builder/utils/workflowLayout.ts) (auto-layout + non-overlapping placement) ·
[features/workflow-builder/canvas/adapters.ts](../../../features/workflow-builder/canvas/adapters.ts) (React-Flow seam; "builder UI never persists ReactFlow's internal types") ·
[features/workflow-builder/validation/collectBuilderValidationIssues.ts](../../../features/workflow-builder/validation/collectBuilderValidationIssues.ts) (shared `findGraphIssues` ruleset) ·
[features/workflow-builder/canvas/WorkflowCanvas.tsx](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx) (`BuilderTab` multi-view precedent) ·
[services/workflows/exportWorkflow.ts](../../../services/workflows/exportWorkflow.ts) (definition field whitelist) ·
[docs/slices/phase-5/advanced-branching-routing-and-entitlement-closeout.md](./advanced-branching-routing-and-entitlement-closeout.md) (BRANCH-ENT-1 state) ·
[docs/slices/phase-5/plain-language-node-audit-tracker.md](./plain-language-node-audit-tracker.md) (sentence-quality rubric).
Deeper file-level findings in §2 were produced by three parallel code-audit passes run
this session over the exact files cited inline; every claim below carries its file
citation, and the load-bearing seams were re-verified by direct read.

---

## 1. Context

Marcus is starting the **dual-builder project**: offer two interchangeable
workflow-building experiences —

1. **Visual Builder** — the existing React-Flow node-and-edge canvas.
2. **Document Builder** — a new readable document projection: prose sentences,
   inline Guided Stops, manual creation layer, sections, and a structural outline.

**The one rule: two editors, one workflow — not two workflow types.** Every workflow
must open and be editable in either builder. Both read and write the same canonical
definition, share node configuration, validation, readiness, the React Agent apply
path, lifecycle, execution, and persistence. The engine must not know which builder
touched a workflow.

This plan audits the real repo, inventories the design project, and lays out a
phased implementation with the smallest real vertical slice first. It implements
nothing.

## 2. Current codebase findings (verified)

### 2.1 Canonical definition — one schema, layout already inside it

[contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts) is the single
source of truth consumed by builder, resolver, and engine:

- `WorkflowNode = { id, kind: "trigger"|"action", provider, type, config, position:{x,y}, displayName? }` (:28-55).
  There is **no third "logic" kind** — if/then, router, delay, http, format are
  ordinary `kind:"action"` nodes with `provider:"native"`; dispatch key is
  `provider:type` ([core/workflows/advancedBranching.ts](../../../core/workflows/advancedBranching.ts):38-48).
- `WorkflowEdge = { id, from, to, label? }` (:57-69). `label` is the **only** branch
  routing mechanism in the persisted model.
- Invariants at parse: ≤1 trigger, endpoints exist, no self-loops, edge dedup on
  `(from,to,label)`, unique node ids (:85-156). **Cycles deliberately allowed** at
  schema level (:81-84).
- **Zod strips unknown keys** (plain `z.object`, not `.passthrough()`): any extra
  field a client sends on nodes/edges/top level is silently dropped at
  `parseJsonBody` → `WorkflowDefinitionSchema`. The template/export sanitizer
  additionally **whitelists** fields ([services/workflows/exportWorkflow.ts](../../../services/workflows/exportWorkflow.ts):114-139).
  ⇒ Document-only presentation metadata cannot ride along today without a
  deliberate schema + sanitizer extension (§6).

### 2.2 Persistence & save paths — one shared write funnel

- `workflows.draft_definition jsonb` holds the draft; publish snapshots to
  immutable `workflow_revisions.definition`; `active_revision_id` points at the
  live one ([supabase/migrations/20260506000000_workflows.sql](../../../supabase/migrations/20260506000000_workflows.sql):28-64).
  Positions persist inside the definition — **no separate layout column**; canvas
  viewport (pan/zoom) is not persisted.
- **All definition writes funnel through one service**:
  [services/workflows/saveDraftDefinition.ts](../../../services/workflows/saveDraftDefinition.ts):83-118 —
  used by manual `PATCH /api/workflows/[id]`, AI apply (with optimistic
  concurrency), checkpoint restore, and template replace. It runs the BRANCH-ENT-1
  plan gate before writing and deactivates on activatable-trigger change.
- **No autosave.** `graphSlice` is in-memory; Save is explicit (header button / ⌘S)
  ([graphSlice.ts](../../../features/workflow-builder/state/graphSlice.ts):39-40, 977-1013).
  Undo/redo is client-only bounded snapshot history (:73-88); durable history is
  the separate 20-cap `workflow_checkpoints` feature.
- **No navigation guard** exists today for unsaved changes (no `beforeunload`;
  documented as a deliberate deferral in
  [BuilderHeader.tsx](../../../features/workflow-builder/layout/BuilderHeader.tsx):230-234).

### 2.3 Builder client state — already canvas-agnostic

- [graphSlice.ts](../../../features/workflow-builder/state/graphSlice.ts) stores **canonical
  `WorkflowNode`/`WorkflowEdge` contract objects, never React Flow objects**
  (`savedNodes/savedEdges` vs `pendingNodes/pendingEdges`, `isDirty`, revision race
  guards). React Flow types appear only under `features/workflow-builder/canvas/*`
  behind pure converters ([adapters.ts](../../../features/workflow-builder/canvas/adapters.ts):30-36:
  "the builder UI never persists ReactFlow's internal types").
- Config editing is a second store ([configSlice.ts](../../../features/workflow-builder/state/configSlice.ts):
  per-node drafts, `activeNodeId`, `revealNode` field focus) whose commit path is
  `graphSlice.updateNodeConfig` — local only until workflow Save.
- **The config panel chain is render-anywhere today**:
  [SchemaForm.tsx](../../../features/workflow-builder/config-modal/SchemaForm.tsx) is pure
  presentational (values/errors/onChange props); the 20+ field renderers
  ([fields/_registry.ts](../../../features/workflow-builder/config-modal/fields/_registry.ts)),
  [useOptionsSource](../../../features/workflow-builder/hooks/useOptionsSource.ts)
  (`GET /api/options/[source]`, dependsOn cascades, owner-gated states), the
  variable picker (`{{nodeId.path}}` tokens,
  [core/workflows/variableReferences.ts](../../../core/workflows/variableReferences.ts):149-157),
  and [useUpstreamVariables](../../../features/workflow-builder/hooks/useUpstreamVariables.ts)
  (pure ancestor topology) have **zero canvas dependency**. `ConfigModalShell`
  already renders in a drawer, not on the canvas.
- Multi-view precedents exist: `BuilderTab = builder | runs | data-map | history |
  settings` over the same graph ([WorkflowCanvas.tsx](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx):251),
  the Data Map outline panel, an orphaned pre-canvas `NodeList.tsx`, and the
  anonymous builder mounting the full `WorkflowBuilder` with `localOnly`.

### 2.4 Branches, readiness, entitlement (BRANCH-ENT-1, just closed)

- Runtime: handlers return `branchTaken`; unlabeled edges always activate; labeled
  edges require exact match; string mismatch ⇒ `INVALID_BRANCH`
  ([services/execution/branching.ts](../../../services/execution/branching.ts):69-88).
  If/Then returns `"true"|"false"|null(skip)`; Router's route `label` **is** the
  `branchTaken` value, first-match-wins, optional `defaultRoute`
  ([integrations/native/actions/router.schema.ts](../../../integrations/native/actions/router.schema.ts):81-108).
- Builder authoring: one React-Flow source handle per returnable label, id
  `branch:<label>` — **the persisted identity is still only `edge.label`**; handles
  are projection ([utils/branchHandles.ts](../../../features/workflow-builder/utils/branchHandles.ts):17-24).
  Config edits reconcile stale labeled edges (`reconcileBranchEdgesForNode`).
- Readiness is genuinely **one ruleset**: `core/workflows/executionReadiness.findGraphIssues`
  (+ [branchWiring.ts](../../../core/workflows/branchWiring.ts) `missing_branch_edge` /
  `stale_branch_edge`) consumed by the builder collector, activate/publish/run-now
  write gates (422), and the engine pre-dispatch backstop.
- Entitlement: `advanced_branching` = exactly `native:if_then_condition` +
  `native:router`, Pro+ fail-closed, enforced at **every** definition write
  (`assertDefinitionPlanEntitlement` inside `saveDraftDefinition`), template use,
  activate/publish/resume/run-now, an engine choke point, AI guidance/apply, and a
  locked-library UX ([planFeatureGate.ts](../../../services/workflows/planFeatureGate.ts):82-116;
  closeout: [advanced-branching-routing-and-entitlement-closeout.md](./advanced-branching-routing-and-entitlement-closeout.md)).
  A Document Builder that can add branches inherits all of this for free by using
  the same write paths.

### 2.5 Engine — provably builder-agnostic

The engine consumes only `node.id/kind/provider/type/config` and
`edge.from/to/label`. A grep across `services/execution/` for
`position|displayName|sourceHandle|targetHandle` returns **zero matches**. Runs are
queued durably (`workflow_runs` queued→running→terminal), walked by BFS + a
fixpoint worklist (order-independent reconvergence, D1), unselected branches persist
as `skipped` steps, terminal paths just stop. **No loop primitive exists** — no loop
node, no max-steps counter; each node runs at most once per run
([engine.ts](../../../services/execution/engine.ts):101-103, 524-527). Nothing anywhere
records which surface authored a workflow (grep `created_via|builder_surface`: zero).

### 2.6 React Agent — one governed path, additive/replace apply

Rail → `WorkflowGuidancePanel` → `POST /api/accounts/[id]/ai/workflow-guidance`;
preview is ephemeral React state (never the graph store); **apply** mutates the
draft via `graphSlice.applyAdditivePatch` (new-workflow patch) or
`replaceGraphLocal(proposedDefinition, { expectedBaseVersion })` (edit path with
stale-version refusal), then normal dirty/Save
([hooks/useBuilderPreview.ts](../../../features/workflow-builder/hooks/useBuilderPreview.ts):317-438).
A pre-apply checkpoint and change-history row are recorded. The deterministic
"Check workflow" review ([core/workflows/checkWorkflowReview.ts](../../../core/workflows/checkWorkflowReview.ts))
and the inline `BuilderNodeSetupCard` fix-up controls are all built on the same
validation + `setupFieldsByType` metadata the Document Builder needs.

### 2.7 Preference & flag infrastructure

- No central flag framework; the convention is a per-domain server module reading
  `process.env.X === "true"` at call time, default OFF (e.g.
  [services/billing/billingFeatureFlags.ts](../../../services/billing/billingFeatureFlags.ts),
  `HERMES_AGENT_ENABLED` in
  [services/ai-guidance/gateway/gatewayConfig.ts](../../../services/ai-guidance/gateway/gatewayConfig.ts)),
  threaded to the client as a server-resolved prop (the C6
  `canUseAdvancedBranching` pattern). **No `NEXT_PUBLIC_*` flags.**
- UI prefs use namespaced localStorage (`chainreact:builder:leftAgentRail:collapsed`
  in [useLeftAgentRail.ts](../../../features/workflow-builder/hooks/useLeftAgentRail.ts):23);
  DB-side user prefs are explicit additive `user_profiles` columns (no generic
  key/value prefs column exists today).

### 2.8 Known gaps relevant to this project

- Definition **read path is a cast, not a parse** (`repositories/workflows.ts:104`)
  — no client-side malformed-definition guard (theoretical; all writes are parsed).
- Variable picker usability is a known P0 cluster (unlabeled `{}` icon, raw ids —
  [plain-language tracker](./plain-language-node-audit-tracker.md) finding 2); the
  Document mocks' friendly `{first name}` chips depend on fixing/aliasing this.
- Plain-language node copy is mid-remediation (R1 shipped, R2+ pending) — Document
  sentence quality inherits whatever the metadata says.

## 3. Design-project inventory

All mocks read from the ChainV2Builder project this session (7 of 8 first-hand via
the design MCP; *Workflow Builder.html* from a local export snapshot dated
2026-06-07). Lineage: **Builder Paradigms** → (**Plain Language**, **Document +
Guided Stops**) → **Document v2** + **Branching & Editing** + **Creation Layer**
(the current direction); **React Agent** matches the already-shipped rail.

| Mock | Role | What it establishes |
|---|---|---|
| **Builder Paradigms** | early exploration | Three paradigms side-by-side: A "The Document" (prose + steps outline + React margin notes), B "The Grid" (spreadsheet of steps), C "Guided Stops" (full-screen wizard track: "Step 2 of 3 · Which audience should a new lead join? · React filled most of this in — just confirm"). The shipped direction merges A + inline C; B is dropped. |
| **Plain Language** | early iteration | Clause list (`When / Then / And` badges + sentence cards) with a right config rail, live email preview, tap-to-insert variable chips (`{first name}`, `{company}`), "Plain English / Advanced" mode toggle. Superseded by the Document, but its config-rail patterns map 1:1 onto today's `ConfigModalShell`. |
| **Document + Guided Stops** | core interaction spec | The Document: serif prose sentences with app chips + value chips (`set` = filled, `blank` = amber dashed glowing "choose an audience"). Setup banner: "React drafted this workflow… Click any highlighted blank — or finish them all in order" + **Finish setup (3 left)** queue → anchored **Guided Stop** popovers (scrim, one question, progress "1 of 3", Skip / Save & next), lane-aware context ("In branch ● Big account path", "Switch lane →"). **Step-level stop**: "Configure step · Mailchimp — Everything this step does. The Document just shows the audience" (full config incl. toggles + collapsible "Advanced · field mapping"). **Whole workflow** right-sheet map with per-step `ready / needs a detail` dots. "Turn on" disabled until all counted blanks resolve. |
| **Document v2 (messy)** | structural spec (most complete) | Collapsible numbered **sections** with collapsed summaries ("3 paths · hot · warm · cold", "↻ up to 3× until they reply"); **3-way fork** as stacked vertical lanes (scales to nesting); **nested fork** inside a lane ("And within hot — Is it an enterprise account?"); **terminal chip** ("Ends here — nothing else runs for cold leads."); **rejoin row** ("Hot & warm → continue to follow-up below"); **loop block** ("Repeat every 2 days, up to 3 times, until they reply" · badge `loop · max 3`); **inline editor that grows in place** under the phrase (not a popover) with breadcrumbs ("Qualify & route › Hot lead › Enterprise"), lane tag, lane-switch buttons, focus-mode dimming; map sheet becomes a hierarchical **tree** (sections → lanes → steps, end/loop flags, readiness dots). |
| **Builder - Creation Layer** (primary) | manual authoring spec | Frame 1 empty state: "What should this workflow do?" — Ask React box ("Draft it with React") *or* "Start with a trigger" / "Blank document"; footer: "AI is the fastest start — never the only one." Frame 2: insertion **+** between every step → add menu **Step / Branch / Loop / Section / Ask React to add it** (keys S/B/L/#); persistent bottom **Ask React bar** ("or press + to add by hand"). Frame 3: sections as containers (inline rename, drag steps, collapse), multi-select → toolbar (**Wrap in section** / Move / Duplicate / Delete), per-step context menu (Add step here / Add branch / Add loop / Add section / Move / Duplicate ⌘D / Delete ⌫). |
| **Builder - Branching & Editing** | branch rendering + editing | Principle (quoted): "linear steps stay as calm words; a branch becomes a compact visual you read in a second (never a full node canvas)." Fork block header carries the condition as a token (`deal > $10,000`) + **Edit condition** → chip builder (`[Deal amount] [is over] [$10,000]`) with live outcome preview; journey-track SVG map with labeled lanes ("BIG ACCOUNT" / "EVERYONE ELSE") as tap-to-edit stops. |
| **React Agent** | AI rail | Rail chat + "Finish these details before applying" setup card + "Apply to draft" + shimmering additive preview nodes ("Preview only — your workflow has not changed"). This is essentially the **shipped** BuilderGuidanceRail/preview/apply model — no new build needed; the Document just re-hosts the same flow. |
| **Workflow Builder** | Visual-Builder baseline | Existing canvas shell, plain-language node naming, labeled branch edges, "Needs setup" badges, propose-then-approve PlanCard. Baseline the Document coexists with. |

**Design vocabulary → repo mapping** (the load-bearing translation):

| Design concept | Existing repo mechanism |
|---|---|
| Sentence step, app chip, value chip | node + provider metadata + `summaryFieldsByType` ([buildNodeSummaryFieldsByType](../../../features/workflow-builder/validation)) |
| Blank (amber) chip / "N left" | `missingRequiredFields` / `requiredFieldsByType` — same rule as the canvas "Needs setup" chip and validation drawer |
| Guided Stop controls | `SchemaForm` field renderers + `useOptionsSource` + variable picker (already pure) |
| Step-level "Configure step" | `ConfigModalShell` (Setup/Advanced tabs) re-hosted |
| Fork block lanes | branching node + `returnableBranchLabels` + edges grouped by `label` |
| "Both paths →" rejoin row | reconvergence node (target of >1 lane's edges) — engine already handles order-independently |
| Terminal chip | lane whose last node has no outgoing edges |
| Loop block | **no engine primitive — cannot ship without new runtime work (§10)** |
| Finish Setup queue | ordered walk of the same validation/missing-fields list |
| Whole-workflow map | `collectBuilderValidationIssues` + topology (Data Map precedent) |
| Ask React bar / add menu | shipped guidance rail + `AddNodePanel` pickers |
| "Turn on" gating | existing `blockingIssueCount === 0` + Save + activate route gates |

## 4. Product / model decision

**What this is:** a second *editor surface* for the one canonical
`WorkflowDefinition`, mounted inside the existing builder page, sharing
`graphSlice`/`configSlice`/validation/save/agent wiring. The Document is a
**projection**, recomputed from the draft graph on every store change; edits are
**commands** dispatched to the same store actions the canvas uses.

**What this is deliberately NOT:**
- Not a second workflow schema, table, column-of-prose, or "document type". No
  prose is persisted — sentences are always derived.
- Not a parallel config UI — Guided Stops host the existing field renderers.
- Not a parallel validation/readiness/entitlement system — same collectors, gates.
- Not a new AI surface — the existing governed guidance route + apply path only.
- Not an engine change — v1 ships zero runtime semantics changes (the Loop mock is
  explicitly out of scope until a loop primitive is a product decision, §10/§13).

## 5. Proposed shared architecture

```
app/workflows/[id]/page.tsx  (server: flag + metadata + entitlement, unchanged shape)
        │
WorkflowBuilder.tsx  ── builderView: "visual" | "document"  (header toggle)
        │
        ├── canvas/…            (existing React-Flow surface — untouched)
        │      ▲ adapters.ts    (existing pure projection)
        │
        ├── document/           (NEW, mirrors the canvas seam)
        │      projection.ts    graph → DocumentModel   (pure, tested)
        │      DocumentView.tsx sentences/forks/stops   (presentational)
        │      commands.ts      thin wrappers over graphSlice/configSlice actions
        │
        └── shared stores: graphSlice · configSlice · runSlice
                 │  save()  →  PATCH /api/workflows/[id]  →  saveDraftDefinition
                 ▼
        contracts/workflowDefinition.ts  →  engine (unchanged, surface-blind)
```

- **One store, two projections.** Both views subscribe to
  `pendingNodes/pendingEdges`. A Document edit calls the same slice action a canvas
  edit would; the other view re-renders from the same state on the next frame.
  Cross-view sync is therefore not a feature to build — it is the absence of a
  second state container. (This is the same relationship `adapters.ts` already
  formalizes for React Flow.)
- **`DocumentModel`** (new, in-memory only, never persisted): ordered blocks
  `sentence | fork{lanes[], rejoin?, terminal[]} | loop(future) | sectionHeader`,
  each carrying `nodeId`s, chips (from summary fields), blanks (from
  missing-required-fields), and entitlement locks. Produced by a pure
  `projectDefinitionToDocument(nodes, edges, meta)` in `document/projection.ts`.
- **Guided Stops** = anchored editors whose body is `SchemaForm` (single-field mode
  for value stops; full `ConfigModalShell` re-host for step-level stops), committing
  through `configSlice` → `commitNodeConfigDraft` → `graphSlice.updateNodeConfig` —
  identical to the inspector. The **Finish Setup queue** iterates the same list the
  validation drawer shows, ordered by document order.
- **Manual creation** (+ menu / add section / add branch) = existing
  `TriggerPicker`/`ActionPicker` (with `lockedActionKeys` for Pro branching) invoked
  from Document anchors; placement uses `addActionAfterFromMeta` /
  `insertActionAtEdge` so **new nodes get `computeNonOverlappingPosition` placement
  and never move existing manually-positioned nodes**. An explicit "Tidy layout"
  affordance (existing `autoLayout`) remains opt-in only.
- **View switching** is a client toggle. Because state is shared, there are no
  unsaved-changes semantics to reconcile: dirty is dirty in both views, Save is the
  same button, canvas positions are untouched by Document rendering. On switch to
  Visual, `fitView` runs as it does today; on switch to Document, scroll to the
  block for the currently `activeNodeId` if any.
- **Rollout flag:** `ENABLE_DOCUMENT_BUILDER` (server env read, default OFF,
  `billingFeatureFlags.ts` pattern) resolved in `page.tsx` → `documentBuilderEnabled`
  prop; no `NEXT_PUBLIC_*`. Flag OFF renders exactly today's builder.

### Graph shapes and Document capability tiers

`projection.ts` classifies each region of the graph:

- **Tier A — fully editable:** single trigger; linear chains; if/then + router
  forks whose lanes are disjoint subtrees that either terminate or reconverge on a
  single node; nesting to a bounded depth (recommend 3); unlabeled "Always" edges
  rendered as a "runs regardless" row.
- **Tier B — rendered, edit-restricted:** cross-lane edges (a node receiving edges
  from multiple lanes without being the fork's single rejoin), fan-out parallelism
  from a non-branching node (multiple unlabeled outgoing edges), unknown
  `provider:type` (sentence renders from the type key, config opens the existing
  panel which already degrades honestly), stale/missing branch wiring (rendered
  with the same warning language as the validation drawer).
- **Tier C — not renderable as prose:** cycles, multiple triggers, disconnected
  islands beyond the reachable graph. Behavior in §10.

Degradation is **per-region**, not per-workflow: a Tier B/C region renders as a
compact read-only "complex section" card listing its nodes, with "Open in Visual
Builder" focusing that node — the rest of the Document stays fully editable. The
Visual Builder is never restricted.

## 6. Graph→Document and Document→graph rules

### 6.1 Graph → Document (pure projection)

1. **Order:** BFS from the trigger (same discipline as
   [executionOrder.ts](../../../services/execution/executionOrder.ts)); document order is
   execution order, ties broken deterministically (edge array order, then node id).
2. **Sentence:** per node — verb template from trigger/action metadata
   (`When a <Provider> <trigger label> arrives…`, `Add them to <Provider> <object>`),
   app chip from provider display name/icon (already threaded to the builder),
   value chips from `summaryFieldsByType`; a required field with no value renders
   the amber **blank** chip with the field's plain-language label.
3. **Fork block:** emitted at each `native:if_then_condition` / `native:router`
   node. Header = condition summary (existing router-routes/if-then config →
   readable text; the "Edit condition" chip builder is the existing
   `router-routes` / if-then field renderers re-hosted). Lanes = returnable labels
   in vocabulary order (`returnableBranchLabels`), each lane = the subtree reached
   through edges with that label. Unlabeled outgoing edges of a branching node
   render one "Always →" row (mock: "Both paths →" when it is the reconvergence).
4. **Rejoin:** the unique node (if any) where all non-terminal lanes reconverge;
   rendered once after the lanes ("Then, for everyone →"). Detection = lowest
   common reachable node across lane frontiers; if none exists, lanes simply run
   to their ends (each may be terminal).
5. **Terminal:** a lane frontier with no outgoing edges renders the terminal chip
   ("Ends here — nothing else runs for <lane> leads.").
6. **Nesting:** recursion of rule 3 inside a lane, capped (depth >3 ⇒ Tier B card).
7. **Sections (v1):** derived only — consecutive top-level runs between forks can
   be visually grouped, but **no section titles are stored** until the
   presentation-metadata slice (§7/CS-4). Collapsed summaries are computed
   (provider chain / "N paths" / lane names), matching the Document v2 mock.
8. **Guided Stops / Finish Setup:** blanks = `missingRequiredFields` per node in
   document order; queue count = the same number the header pill shows. "Turn on"
   enablement remains exactly `blockingIssueCount === 0` + saved + server gates —
   the Document adds no second readiness definition.
9. **Whole-workflow map:** the same `DocumentModel` rendered as the tree sheet
   (sections → lanes → steps with readiness dots); tap = scroll + open stop.
10. **Loops:** none in v1 (no primitive). A cycle in the graph ⇒ Tier C.

### 6.2 Document → graph (commands over existing actions)

| Document intent | Store call (all existing) | Notes |
|---|---|---|
| Edit a value (Guided Stop save) | `configSlice.updateField` → `commitNodeConfigDraft` → `graphSlice.updateNodeConfig` | identical to inspector; branch-edge reconciliation included |
| Add step at end / between steps | `addActionAfterFromMeta` / `insertActionAtEdge` | position via `computeNonOverlappingPosition`; existing nodes never move |
| Add trigger | `addTriggerFromMeta` | existing recovery/reconnect semantics |
| Add branch | `addActionFromMeta`(if_then/router) + `connectNodes({label})` per lane | locked for Free via `lockedActionKeys`; server gates enforce |
| Edit condition / routes | same config commit path | `reconcileBranchEdgesForNode` drops stale lanes with visible warning |
| Delete / duplicate step | `removeNode` / `deleteNodeAndRewire`; duplicate = `addActionFromMeta` + config copy | duplicate is new UI over existing primitives |
| Move step | v1: only adjacent-linear reorder (compose `deleteNodeAndRewire` + insert) | arbitrary DAG moves deferred — high-risk edge rewiring |
| Undo/redo | shared `past/future` history | already store-level, so it spans both views |
| Ask React | existing rail request/preview/apply | Document renders the preview as ghost sentences (same additive-only rules); Apply = same `applyPreview` |

Every command lands in `pendingNodes/pendingEdges`, marks dirty via the normal
mechanism, saves through the one `PATCH` route, and is therefore subject to zod
parse, plan gate, and (at activate) readiness — **no Document-only write path**.

### 6.3 Round-trip invariant

For any definition `D`: `commands(projection(D)) = identity` when no edit is made,
and for each supported edit `e`, applying `e` in the Document and the equivalent
gesture in the Visual Builder must produce **structurally identical definitions**
(same nodes/edges/config/labels; positions may differ only for nodes the edit
itself created). This is the core parity test class (§11).

## 7. Presentation metadata (manual sections) — recommendation

Requirement: manually added Document sections must persist as **non-executable
presentation metadata, not engine nodes**, and not as a separate prose document.

Today there is **nowhere to put them** (§2.1: zod strips unknown fields; export
sanitizer whitelists). Options considered in §8; **recommendation**: extend the
canonical definition with one optional, versioned, bounded block —

```ts
// contracts/workflowDefinition.ts (future slice CS-4, sketch only)
presentation: z.object({
  version: z.literal(1),
  sections: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1).max(80),
    nodeIds: z.array(z.string().min(1)).max(200),   // explicit membership
    collapsed: z.boolean().optional(),
  })).max(50),
}).optional()
```

- Engine ignores it by construction (it never reads beyond nodes/edges — §2.5); no
  engine change, no migration (`draft_definition` is jsonb).
- Precedent: `position` and `displayName` are already display-only fields inside
  the definition — this stays "one workflow", unlike a sidecar column.
- Deliberate updates required (that's a feature, per the sanitizer's own comment):
  export/template sanitizer must **whitelist** it (public templates: recommend
  stripping section titles? No — titles are user content like `displayName`;
  sanitize length, keep), checkpoint/revision snapshots inherit it automatically.
- Stale refs (deleted nodes) are pruned at projection time and on save (soft
  validation, never a save blocker).
- Until CS-4 ships, manual sections simply don't persist (v1 renders derived
  grouping only). This keeps the first slices schema-free.

## 8. Alternatives considered

| Decision | Options | Verdict |
|---|---|---|
| Where Document state lives | **(a) shared graphSlice projection** · (b) own store synced bidirectionally · (c) separate document schema in DB | **(a).** (b) reintroduces the sync problem the one-store design already solves and doubles race-guard complexity; (c) violates the prime rule (two workflow types) and every reuse constraint. |
| Mount point | **(a) view toggle inside WorkflowBuilder** · (b) separate route `/workflows/[id]/doc` · (c) new `BuilderTab` | **(a)** (header-level Visual/Document toggle). (b) duplicates page-level data plumbing and makes switching a navigation (loses in-memory dirty state — unacceptable given no nav guard). (c) is close, but tabs currently live *inside* `WorkflowCanvas`; the Document replaces the canvas region, it isn't a canvas child. Hoisting is a small refactor either way. |
| Guided Stop editor | **(a) re-host SchemaForm/field renderers** · (b) new lightweight per-field controls | **(a).** (b) is exactly the forbidden parallel config UI; the React-Agent rail already proved single-field re-hosting works (`BuilderNodeSetupCard`). |
| Sections storage | **(a) `presentation` block in definition** · (b) new jsonb column · (c) synthetic "section" nodes · (d) localStorage | **(a)** (§7). (b) splits the definition across columns (checkpoints/revisions/templates/AI would all need to learn it). (c) puts fake nodes in the engine's graph — hard violation. (d) loses sections across devices/users. |
| Sentence generation | **(a) deterministic templates from metadata** · (b) LLM-generated prose | **(a).** (b) is non-deterministic, costs credits, breaks the "projection is pure" testing story; React can still be asked *about* the workflow via the existing rail. |
| Loops in v1 | **(a) defer (Tier C)** · (b) fake it via composition · (c) build engine loop primitive first | **(a).** (b) misrepresents semantics; (c) is a large engine/product arc that must not block the Document (§13 decision for Marcus). |
| Builder preference | **(a) localStorage now, optional column later** · (b) user_profiles column now · (c) workflow-level DB field | **(a)** (§9). No migration needed for v1; (c) confuses "how I like to edit" with workflow data and invites team-member fights over a shared row. |

## 9. Builder preference & switching

- **v1 (no migration):** `chainreact:builder:viewMode` = `"visual" | "document"`
  (device-level default, the `useLeftAgentRail` localStorage pattern) plus
  `chainreact:builder:viewMode:<workflowId>` override (remember where you were per
  workflow). Session/device-scoped, SSR-guarded, never workflow data.
- **Later (optional, telemetry-justified):** one additive `user_profiles` column
  (`preferred_builder`) following the notification-preferences precedent, exposed
  via the existing `/api/account/profile` surface. **Not** required for launch; do
  not add a migration in the first slices.
- **Default surface** while flagged: existing users land on Visual; the
  empty-state "Blank document" entry (Creation Layer mock) can default new
  workflows to Document once the flag is on. Final default = product decision §13.
- Unsaved changes across switching: none to handle (shared store). The pre-existing
  absence of a browser navigation guard is unchanged by this project (worth its own
  tiny slice someday; noted, not scope-crept).

## 10. Unsupported structures, risks, rollback

**Unsupported-structure behavior (locked rule):** the Document must **never
silently rewrite** a graph it cannot fully represent. Tier C regions (§5) render as
a read-only complex-structure card ("This part is easier on the canvas — Open in
Visual Builder"), all other regions stay editable, and every command the Document
does offer routes through the same store actions, so it cannot corrupt what it
doesn't touch. Projection failures (thrown/timeout) fall back to the Visual Builder
with the toggle disabled + reason tooltip — never a blank screen.

**Top risks**

1. **Projection ambiguity on arbitrary DAGs** (cross-lane edges, fan-out
   parallelism, rejoin detection). Mitigation: tier classifier with exhaustive
   fixture tests *before* any editing ships on those shapes; per-region fallback.
2. **Loop mock vs. no runtime primitive** — the design shows loops; the engine has
   none. Shipping a loop *block* requires an engine/product arc (new native node,
   bounded iteration, billing semantics). Risk is expectation mismatch; mitigated
   by explicitly deferring (menu shows no Loop entry in v1).
3. **Sentence quality = metadata quality.** P0/P1 copy gaps (plain-language
   tracker) read worse in prose than in a form. Mitigation: sentence templates
   lean on summary fields (already curated); R2+ copy batches continue
   independently.
4. **`WorkflowBuilder.tsx` orchestrator growth** (already at a documented eslint
   max-lines exception). Mitigation: the Document mounts through one hook + one
   component; new logic lives under `document/`.
5. **Two surfaces, one validation vocabulary** — drift risk if Document invents
   its own "ready" language. Mitigation: it may only render
   `collectBuilderValidationIssues` output; a structure test locks that import.
6. **Guided Stop re-hosting subtleties** (dependsOn cascades, visibleWhen, async
   options with deps) — mitigated by reusing `SchemaForm` itself rather than
   re-implementing per-field stops; single-field stops are a *filtered* SchemaForm
   (`fields=[one]` with deps resolved from the node draft), not a new renderer.

**Rollback strategy:** every slice is behind `ENABLE_DOCUMENT_BUILDER` (default
OFF). The flag gates only the toggle + Document mount; no schema, route, or store
behavior changes until CS-4 (presentation block), which is itself additive-optional
and ignored by every reader when absent. Rollback = unset the flag; a workflow
edited in the Document remains a perfectly normal workflow (that is the point).

## 11. Tests required before exposure

- **Projection unit (pure):** fixtures for linear / if-then both-lanes / router
  3-way / nested / terminal / rejoin / stale-branch / cross-lane (Tier B) / cycle
  (Tier C) / unknown-type / empty — snapshot the `DocumentModel`; property test:
  projection never throws, classifies every node exactly once.
- **Command parity (the core class):** for each supported edit, apply via Document
  command and via the equivalent existing slice call; assert **deep-equal
  definitions** (modulo new-node ids/positions, which must still satisfy
  non-overlap + schema). Includes: value edit, add tail step, insert between, add
  if/else with both lanes wired, condition edit that drops a lane
  (reconciliation warning surfaced), delete with rewire.
- **Round-trip fidelity:** `projection → no-op → definition` is byte-identical;
  save payload from a Document session equals the payload the Visual Builder
  would send for the same state (`UpdateWorkflowRequestSchema` parse equality).
- **Store-sync integration (RTL):** edit in Document → canvas adapters output
  reflects it without save; edit on canvas (drag connect, config commit) →
  Document re-projects; undo spans both; dirty pill + Save shared; switch
  preserves positions byte-for-byte.
- **Validation/readiness parity:** header pill count identical in both views for
  the same draft; Finish Setup queue length === missing-required count; "Turn on"
  disabled states identical; structure test: `document/` imports validation only
  from `collectBuilderValidationIssues` / `core/workflows/*` (no parallel rules).
- **Entitlement:** Free account — Document add-menu Branch entry locked with the
  same upgrade callout; direct command blocked by the existing server 403 on save
  (reuse BRANCH-ENT-1 e2e fixtures).
- **Execution parity (e2e, Playwright):** build the same if/else workflow once per
  builder (same configs), save, activate, run TRUE and FALSE inputs through the
  real engine — identical step statuses incl. `skipped`, identical run history;
  plus: open an existing production-shaped workflow in Document, edit one value,
  save, verify the Visual Builder and a run both see it.
- **Degradation:** cycle fixture renders complex-card + keeps rest editable;
  projection exception ⇒ Visual fallback, toggle disabled, no crash.
- **Flag:** OFF ⇒ zero DOM/behavior diff vs. today (snapshot the builder header).
- **No-leak/regression:** existing suites (builder 1600+, engine, readiness,
  BRANCH-ENT) stay green; `workflowGuidanceUiSafety` extended to any Document
  component that renders agent content.

## 12. Implementation slices

| Slice | Contents | Depends on | Acceptance |
|---|---|---|---|
| **CS-1 — Projection + read-only Document (flagged)** | `document/projection.ts` + tier classifier + `DocumentView` (sentences, value chips, blank chips, one if/else fork block, terminal/rejoin rows, derived grouping); header Visual/Document toggle behind `ENABLE_DOCUMENT_BUILDER`; localStorage view pref | — | Open real workflows in both views; switch freely; canvas untouched; projection unit fixtures green; flag OFF = no diff |
| **CS-2 — First edits (the user-specified vertical slice)** | Guided Stop v1: click a blank/set chip → anchored single-field SchemaForm editor with variable picker + async options; step-level "Configure step" opens the existing inspector drawer; add step at tail + between (existing pickers); Save via existing header; add one if/else via picker with lanes wired | CS-1 | The full loop: open existing workflow in both builders → switch → edit one value → add one step → render if/else → save through `PATCH` → run: **identical execution semantics** (e2e above); command-parity + round-trip tests green |
| **CS-3 — Finish Setup queue + whole-workflow map** | Setup banner + "Finish setup (N left)" queue over document-ordered blanks (Skip/Save & next); map sheet (tree w/ readiness dots, tap-to-jump); focus-mode dimming | CS-2 | Queue count === validation count; Turn on parity; map matches projection |
| **CS-4 — Manual sections (schema extension)** | `presentation` block (§7): contract + sanitizer whitelist + prune-on-save; add/rename/collapse/wrap-in-section UI; collapsed summaries | CS-1 (independent of 2/3) | Sections survive save/reload/checkpoint/template-replace; engine/readiness output byte-identical with and without the block; export sanitizer test |
| **CS-5 — Branch authoring depth** | Condition chip-builder re-host (if-then + router-routes renderers); lane add/remove with `connectNodes(label)`/reconciliation warnings; nested fork rendering to depth 3; lane-context Guided Stops ("Switch lane") | CS-2 | BRANCH-ENT parity suite in Document; reconciliation warnings match canvas |
| **CS-6 — Creation layer & agent re-host** | Empty-state ("Draft it with React" / start manually) honoring existing agent entry; insertion + menu (Step/Branch/Section/Ask React — **no Loop**); ghost-sentence rendering of agent previews; multi-select toolbar (Duplicate/Delete; Move deferred unless linear) | CS-2, CS-4 | Agent preview/apply parity (additive-only, checkpoint, change history); ghost never mutates store until Apply |
| **CS-7 — Polish & exposure decision** | Adjacent-linear move; keyboard model; a11y pass; telemetry on view usage; default-surface decision + (optional) `user_profiles.preferred_builder` migration if Marcus wants cross-device | CS-1..6 | Full test matrix (§11) green; go/no-go on flag default |

Slice CS-2 is the **smallest real vertical slice** Marcus specified, kept honest by
CS-1 splitting out the pure projection so CS-2's diff is edits-only.

### Exact files expected to change in CS-1 (+CS-2 marked ✚)

New — `features/workflow-builder/document/`:
`projection.ts`, `projectionTiers.ts`, `DocumentView.tsx`, `DocumentSentence.tsx`,
`DocumentForkBlock.tsx`, `documentViewPref.ts` (localStorage), `index.ts`;
✚ `GuidedStopEditor.tsx`, `documentCommands.ts`, `DocumentAddMenu.tsx`.

Modified:
- [features/workflow-builder/WorkflowBuilder.tsx](../../../features/workflow-builder/WorkflowBuilder.tsx) — `builderView` state + conditional mount (keep the delta tiny; logic in `document/`)
- [features/workflow-builder/layout/BuilderHeader.tsx](../../../features/workflow-builder/layout/BuilderHeader.tsx) — Visual/Document toggle (flag-gated prop)
- [app/workflows/[id]/page.tsx](../../../app/workflows/%5Bid%5D/page.tsx) — resolve `ENABLE_DOCUMENT_BUILDER` → prop (existing pattern)
- New flag module `services/workflows/documentBuilderFlags.ts` (or `lib/` per structure lint)
- ✚ possibly `features/workflow-builder/panels/AddNodePanel.tsx` (anchor-source prop only)

Tests: new `tests/unit/features/workflow-builder/document/*` (projection fixtures,
✚ command parity, ✚ round-trip), one `WorkflowBuilder` integration spec (toggle +
sync), ✚ one Playwright spec (dual-builder execution parity). No API, schema,
migration, or engine files change in CS-1/CS-2.

## 13. Product decisions Marcus still needs to make

1. **Loops** — the Document v2 mock shows a loop block; the engine has no loop
   primitive. Build a native bounded-loop node as its own arc (engine + billing +
   entitlement questions), or drop loops from the Document scope for now?
   *Recommendation: defer; ship Document v1 without Loop in any menu.*
2. **Default surface** once the flag is on — Visual default for everyone, Document
   default for new/blank workflows, or per-user choice only?
   *Recommendation: Visual default; Document opt-in via toggle + "Blank document"
   entry; revisit with usage telemetry.*
3. **Section titles in public templates** — keep user-authored section titles on
   export (like `displayName`) or strip? *Recommendation: keep, length-capped,
   same sanitization class as displayName.*
4. **Is Document Builder itself plan-gated?** (Free vs Pro.) Nothing technical
   forces a gate. *Recommendation: free — it's an editing surface; branching inside
   it stays Pro via existing gates.*
5. **Guided-Stop question copy source** — field `label`/`description` metadata
   as-is, or invest in a per-field "question form" copy pass (ties into
   plain-language R2+)? *Recommendation: metadata as-is for v1.*
6. **Cross-device preference** — is the optional `user_profiles.preferred_builder`
   column (small migration) wanted at CS-7, or is device-local enough?
7. **Nesting depth cap** for editable forks (recommended 3) and whether Tier B
   cross-lane shapes should *ever* become Document-editable.

## 14. Acceptance criteria

**This planning slice:** doc exists at
`docs/slices/phase-5/dual-builder-document-visual-plan.md`, grounded in cited real
files + the imported design project; no source/test/migration/UI change; docs-only
local commit; nothing pushed.

**The implementation (before flag-on for anyone):** every §11 class green; the
§6.3 round-trip invariant holds; a workflow built in either surface is
indistinguishable to `saveDraftDefinition`, readiness, entitlement gates, the
engine, and run history; flag OFF is a no-op.

## 15. Hard boundaries (this slice did NOT)

No code, tests, schema, or migrations. No flag added. No push, PR, deploy, or
`db:push`. No design-project files modified. The only repo change is this document.

## 16. Recommended next step

**CS-1** — pure projection + read-only Document behind `ENABLE_DOCUMENT_BUILDER`,
with the projection fixture suite. It is small, riskless (flag OFF default,
read-only), and forces the tier classifier — the one genuinely novel algorithmic
piece — to exist and be tested before any edit path depends on it.
