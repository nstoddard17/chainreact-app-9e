# Guided setup on the holographic preview — audit + design (HERMES-AGENT-RAIL-PRODUCT-LABEL-AND-GUIDED-PREVIEW-DESIGN)

> **Design + Phase 1–4 status.** The audit/design below is unchanged. **Phase 1
> (HERMES-AGENT-GUIDED-PREVIEW-SETUP-1) is IMPLEMENTED**; **Phase 2
> (HERMES-AGENT-HOLOGRAPHIC-PREVIEW-NODE-UX) REDIRECTED the canvas surface to visual-only**; **Phase 3
> (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX) RE-HOMED the setup controls into the React rail**; **Phase
> 4 (HERMES-AGENT-GUIDED-PREVIEW-SETUP-ASYNC-OPTIONS-AND-DASHBOARD-CLEANUP) added async optionsSource
> dropdowns to the rail card + removed the dashboard "Build with me" card** — see the status boxes.

## Phase 4 status — IMPLEMENTED (ASYNC OPTIONS IN THE RAIL + DASHBOARD CLEANUP)

Two changes:

**1. Dashboard "Build with me" card removed.** `app/workflows/page.tsx` no longer mounts
`WorkflowGuidancePanel` (and drops the `isHermesAgentEnabled` import). `/workflows` is the workflow
list/metrics/filters/folders+trash/Create surface only — NOT an AI composer. The single AI build
surface is the builder's left React Agent rail (`BuilderGuidanceRail`). `WorkflowGuidancePanel` is NOT
deleted — the builder rail still renders it (conversational mode). Locked by a `workflowGuidanceUiSafety`
scan asserting the dashboard page references neither `WorkflowGuidancePanel` nor `isHermesAgentEnabled`
while the rail still does.

**2. Async optionsSource single-select dropdowns in the rail setup card.** Provider fields like Slack
`channel` are now pickable in the rail BEFORE Apply, loaded through the EXISTING authenticated resolver:
- `previewSetupFields` adds a `select-async` type. `toPreviewSetupField` now SUPPORTS a `select`/
  `combobox` field with an `optionsSource` (single-select only — `multiple` still deferred), carrying
  `optionsSource` + normalized `dependsOn`. `recipient`-class async fields (Slack channel) are allowed;
  `secret`/`connection` still excluded. Non-async `dependsOn` cascades stay deferred.
- `BuilderPreviewSetupCard` renders a `select-async` field via `PreviewAsyncSelectControl`, which calls
  `useOptionsSource` → `fetchOptionsSource` → `GET /api/options/[source]` (the SAME hook/route normal
  builder config uses — authenticated, account-scoped, credential-sharing-policy aware). The card is
  threaded the builder `workflowId` for resolver provenance; no `nodeId` (no accepted node pre-Apply,
  so the route uses the workflow-context credential policy — account-shared providers like Slack are
  visible to members, personal providers stay creator-pinned). NO token/secret/credential-id in the
  client request.
- States: loading (disabled "Loading…"), ready (populated select), empty (disabled "No options
  available"), error/disconnected/reauth (safe message + Try again; raw provider detail never shown),
  owner-gated/owner-must-connect (safe message, finish after Apply), and dependsOn-unresolved (disabled
  "Choose X first", no fetch). When a `dependsOn` parent is filled in previewConfig, its value is passed
  to the resolver as `deps`.
- Selecting an option updates `previewConfig` only (no dirty/save/graph mutation/Hermes). Apply seeds
  the picked value through the existing `previewConfig → planToBuilderPatch → sanitizeSeedConfig` path
  (`select-async` keeps any non-empty string — a provider RESOURCE id, not a token; unknown/secret keys
  still dropped). Auto-open-first-incomplete after Apply unchanged.

**Principle preserved:** Hermes/React owns planning/shape; ChainReact deterministic metadata + the
authenticated options resolver own setup-field collection. Opening or picking a dropdown never calls
Hermes and never sends the selected value to a model/prompt/audit text.

**Canvas unchanged:** holographic nodes stay visual-only (no inputs/selects/textareas; short "Needs
setup · N" badge).

**Still deferred:** multi-select async (`multiple`), non-async `dependsOn` cascades as local controls,
and moving setup onto a per-node selection.

---

## Phase 3 status — IMPLEMENTED (GUIDED SETUP IN THE RAIL)

The guided setup controls now live in the **React chat rail**, tied to the latest shown preview, while
the canvas stays visual-only. This realizes the mental model's three-surface split end to end:
holographic canvas node = proposed shape · rail = setup controls/questions · config drawer = accepted
nodes after Apply.

Shipped (local, not pushed):
- New `features/workflow-builder/panels/BuilderPreviewSetupCard.tsx` — a presentational "Finish these
  details before applying:" card. Renders the supported local controls (text / textarea / number /
  boolean / static-select) for each preview node's missing fields, a compact **"Choose after Apply"**
  line for deferred fields (async `optionsSource`, unresolved `dependsOn`), and an **"Apply to draft"**
  button wired to the existing explicit Apply. No store, no fetch, no model call.
- `BuilderGuidanceRail` renders the card pinned below the chat panel when a preview is shown
  (`previewForSetup` = `previewOverlay?.preview`, owned by `WorkflowBuilder`). The rail still delegates
  ALL request logic to `WorkflowGuidancePanel` (no new network path) — locked by
  `workflowGuidanceUiSafety` + `builder-ai-rail-no-old-endpoint`.
- `WorkflowBuilder` re-introduced `handlePreviewConfigChange` and threads `previewConfig` +
  `setupFieldsByType` + `handleApplyPreview` to the rail. `previewConfig` stays ephemeral
  (previewId → field → value): never `configSlice` / draft / DB, never dirty; cleared on new preview,
  Discard, and workflow switch/unmount; seeded into the new draft nodes ONLY on explicit Apply (via
  `planToBuilderPatch` + `sanitizeSeedConfig`). Auto-open-first-incomplete after Apply unchanged.
- The holographic **canvas** nodes are unchanged from Phase 2 — visual-only cards, short "Needs setup ·
  N" badge, no inputs/selects/textareas.

**Recipient-field handling (new this slice):** `previewSetupFields.toPreviewSetupField` now ALLOWS
`recipient`-class fields when they render as a supported LOCAL control (e.g. a typed "to"). Rationale:
a recipient is a deterministic, user-entered "where to send" value — it is seeded into draft config on
Apply and is **NEVER sent to Hermes / a model / a prompt / audit text** (`previewConfig` is never part
of any guidance request; the change handler only updates local state). `secret` / `connection` fields
stay excluded entirely; a recipient field that is ALSO async (`combobox` + `optionsSource`, e.g. Slack
`channel`) stays deferred ("Choose after Apply").

**Deferred (unchanged):** async `optionsSource` dropdowns (real provider resolvers via
`/api/options/[source]`) are NOT added in this slice — they show the deferred state. They are the next
candidate: render the resolver-backed picker in the rail card for safe single-select sources.

---

## Phase 2 status — IMPLEMENTED (HOLOGRAPHIC PREVIEW NODE UX)

**Product direction correction (supersedes Phase 1's on-canvas controls):** the canvas is for
*visualizing* the proposal, not for collecting config. The three surfaces of the mental model are now
cleanly separated:

| Surface | Role |
|---------|------|
| **Holographic/shimmering canvas node** | A PROPOSED node, not accepted yet — VISUAL ONLY. |
| **React chat rail** | Where guided setup controls / questions live (re-home is a follow-up slice). |
| **Config drawer / menu** | Normal setup for ACCEPTED draft nodes, after explicit Apply. |
| **Solid draft node** | Accepted into the local draft (after Apply). |
| **Saved / Activated** | Only after explicit Save / Activate. |

Shipped (local, not pushed):
- `BuilderPreviewOverlay` no longer renders ANY setup controls on the canvas. The "Set up these steps"
  section + native inputs/selects/textareas (Phase 1) are removed. Each proposed step now renders as a
  card that **mirrors the real node card** (`WorkflowNodeCard`): 3px status rail, provider avatar
  (icon via `providerIcons`, deterministic initials fallback), kind chip, humanized title
  (`send_message` → "Send Message"), the `provider:type` mono capability subtitle, and the provider
  label. Reuse vs mirror: the real card is a React-Flow node (needs `Handle` + `useBuilderNodeActions`
  context), so it is **mirrored** (same layout/classes/tokens), not imported.
- Holographic/proposed treatment: glassy translucent surface (`color-mix(... 80%, transparent)` +
  `backdrop-blur`), shimmer (`builder-preview-node-ghost animate-pulse`), dashed glowing accent border,
  a subtle per-node **"Preview"** badge (`preview-node-badge`) + the global "Suggested" badge.
- A still-incomplete proposed node shows only a SHORT status badge — **"Needs setup · N"**
  (`preview-node-needs-setup`), the field COUNT, never a field-name list. No long "Still needs: …"
  text on the canvas (that detail belongs in the rail / drawer).
- Apply/Discard + dashed preview edges unchanged; the overlay stays presentational (no store, no fetch,
  no model call — locked by `workflowGuidanceUiSafety`).
- **PreviewConfig + seeding plumbing PRESERVED.** `WorkflowBuilder.previewConfig` ephemeral state, the
  clear-on-new-preview/discard/switch lifecycle, and the `planToBuilderPatch({ previewConfig,
  setupFieldsByType })` Apply-time seeding (sanitized via `sanitizeSeedConfig`) all remain wired for the
  rail re-home. With no canvas control to populate `previewConfig` today, Apply seeds EMPTY config
  (original additive behavior). The pure seeding/sanitize contract stays unit-tested in
  `previewSetupFields.test.ts` + `planToBuilderPatch.test.ts`.
- Auto-open-first-incomplete after Apply unchanged (fires when required fields remain missing).

**"Being updated" indication:** patches are additive-only today (add / append / insert-between). Added
nodes are holographic; existing nodes the insert lands between stay SOLID (the overlay is a separate
clean layer and never mutates the real graph). A subtle highlight on an existing node that a future
UPDATE-EXISTING patch would change is deferred until update-semantics exist.

**Deferred to a follow-up slice:** re-home the setup controls (text/number/static-select AND async
`optionsSource` dropdowns like Slack channel) into the React chat rail, populating the preserved
`previewConfig` map from there. Recipient-class async fields (e.g. Slack `channel`,
`sensitivity: "recipient"`) and their treatment in the rail are an open product+safety decision (the
`recipient` class is an apply-safety / AI-auto-write guard, distinct from cross-member privacy).

---

> **Phase 1 (below) is superseded on the CANVAS by Phase 2** — the on-canvas controls it shipped were
> removed; its pure seeding/sanitize core (`previewSetupFields.ts`, `planToBuilderPatch` seeding) is
> retained for the rail re-home.

## Phase 1 status — IMPLEMENTED

Shipped (local, not pushed):
- `core/workflows/previewSetupFields.ts` — `buildPreviewSetupFields` (metadata → supported fields:
  text/textarea/number/boolean/static-select; excludes secret/connection/recipient `sensitivity`,
  async `optionsSource`, `dependsOn`, `multiple`, dynamic select, unsupported renderer types) +
  `sanitizeSeedConfig` (keep only supported keys, type-coerce, drop empties/unknown/secret).
- `BuilderPatchNode.config?` + `ResolvedPatchNode.config?` + placement uses it + `graphSlice`
  `applyAdditivePatch` carries it → new nodes can start with seeded config instead of empty.
- `planToBuilderPatch(plan, { previewConfig, setupFieldsByType })` seeds per-node config, keyed by the
  `preview-step-${i+1}` previewId (index over ALL steps; aligns across skipped logic steps), sanitized.
- `BuilderPreviewOverlay` renders a **"Set up these steps"** section on the holographic preview:
  native controls for supported missing fields (`data-testid=preview-setup-${previewId}-${name}`);
  unsupported/async missing fields show **"Needs setup after Apply"** (no fake control).
- `WorkflowBuilder` owns ephemeral `previewConfig` (previewId → field → value): preview-only, never
  configSlice/draft/DB, never dirty. Cleared on new preview (`handleShowPreview`), Discard, and
  workflow switch/unmount. Seeded into the new nodes' config ONLY on explicit Apply. Threaded from
  `app/workflows/[id]/page.tsx` via `setupFieldsByType` (built from the discovery registry).

**Placement chosen:** on the holographic preview overlay (an allowed option from the design below),
NOT the literal chat rail — Apply + the ghost nodes + the appliable preview all live in
`WorkflowBuilder`/the overlay, so colocating there avoids fragile cross-component state and previewId
collisions across previews. The "Show on canvas" gesture brings the holographic nodes (and now their
setup controls) onto the canvas.

**Deferred to slice 2+:** async `optionsSource` dropdowns (e.g. Slack channel resolver via
`GET /api/options/[source]`); optionally moving controls onto a per-node selection.

**Guarantees verified by tests:** no Hermes/model call when filling controls; no auto-save/activate/
run/auto-apply; preview-only until Apply (graph not dirtied, `updateWorkflow` not called); unknown/
secret keys never seeded; new preview + Discard clear `previewConfig`; auto-open still fires for
remaining missing fields and is skipped when guided setup completes all required fields.

---

> **Original design (unchanged).** The audit + recommended slice that this Phase 1 implements.

## Product label decision (shipped this slice)

- Chat transcript assistant speaker is now **"React:"** (was "Hermes:"). The composer a11y label is
  "Message React" (was "Message Hermes"). The rail header status is **"connected"** (was
  "connected · Hermes"); the panel title stays "React Agent".
- Rationale: Hermes is internal infrastructure (the runtime/gateway). It must not appear in
  user-facing chat content or status. Architecture/gateway names stay internal (code/comments only).
- Mental model to preserve in UX going forward: **holographic/shimmering node = proposed by React,
  not yet accepted** → **solid draft node = accepted (local draft, dirty)** → **saved = explicit
  Save** → **activated = explicit Activate**.

## Audit — what already exists (grounded in code)

### 1. Holographic / shimmering preview layer
- [`features/workflow-builder/canvas/BuilderPreviewOverlay.tsx`](../../../features/workflow-builder/canvas/BuilderPreviewOverlay.tsx)
  renders the proposal as a **separate ghost layer**, NOT real React Flow nodes. Testids/classes:
  `builder-preview-overlay`, `builder-preview-node` (`builder-preview-node-ghost animate-pulse`),
  `builder-preview-edge` (`builder-preview-edge-dashed animate-pulse`), `builder-preview-badge`,
  `builder-preview-overlay-notice`, `builder-preview-apply`, `builder-preview-discard`.
- State lives in `WorkflowBuilder` (`previewOverlay: { plan: WorkflowPlan; preview: DraftPreview }`),
  plain `useState` — never merged into `pendingNodes` / `draftDefinition`, never dirty, never saved.
  Discard clears it; "Apply preview" calls `planToBuilderPatch(plan)` →
  `graphSlice.applyAdditivePatch` (additive, empty config) then auto-opens the first incomplete node.

### 2. Where missing required fields are already known (deterministically, no model call)
- `DraftPreviewNode` already carries `provider`, `type`, and `missingInputs?: string[]` (field KEY
  names) — [`contracts/workflowPlanPreview.ts`](../../../contracts/workflowPlanPreview.ts), produced
  by [`planToDraftPreview`](../../../services/ai-guidance/preview/planToDraftPreview.ts). The preview
  panel already shows "Still needs: …" from this.
- Post-apply hints reuse the same signal:
  [`appliedConfigHints.ts`](../../../features/workflow-builder/utils/appliedConfigHints.ts)
  (`buildAppliedConfigHints` / `firstIncompleteAppliedNodeId`) over `requiredFieldsByType`
  (`{ [provider:type]: { displayName, requiredFields: [{ name, label }] } }` from
  [`core/workflows/requiredFields`](../../../core/workflows/requiredFields)).
- **Gap for native controls:** `requiredFieldsByType` has names+labels only — NOT the field *type*
  or *option-source*. The richer per-field metadata needed to render real controls is
  `ActionMeta.fields: FieldMeta[]` ([`contracts/actionMeta`](../../../contracts/actionMeta.ts)):
  `name`, `label`, type, `optionsSource`, `dependsOn`, `multiple`, `required`.

### 3. The deterministic config-collection machinery (reuse target — no Hermes)
- [`config-modal/SchemaForm.tsx`](../../../features/workflow-builder/config-modal/SchemaForm.tsx)
  renders one control per `FieldMeta` via the field renderer registry
  ([`fields/_registry.ts`](../../../features/workflow-builder/config-modal/fields/_registry.ts):
  Select / Combobox / Number / StringArray / KeyValue / String). It takes `fields`, `values`,
  `errors` — pure, value-driven.
- Dropdown options resolve through **`GET /api/options/[source]`**
  ([route](../../../app/api/options/[source]/route.ts)) — authenticated via `requireUser`,
  caller's-account scoped, dependency-aware (`dependsOn`). This is the safe pattern to reuse for
  preview controls (e.g. `slack:channels`).
- The real config drawer ([`panels/NodeInspectorPanel.tsx`](../../../features/workflow-builder/panels/NodeInspectorPanel.tsx))
  is driven by `configSlice.activeNodeId`, which references a **real graph node** — so it cannot open
  a preview-only node today (preview nodes have `preview-*` ids, not graph ids).

## Gap

The proposal is read-only text + a ghost layer. Users must Apply first (mutating the draft) and only
then configure via the drawer. There is no way to fill known fields (Slack channel, etc.) **while the
proposal is still holographic**, and the "missing fields" are plain text, not native controls.

## Design — guided setup on the holographic preview

**Principle: do not call Hermes to collect config.** Hermes owns planning/shape; ChainReact owns
config collection via `FieldMeta` + `/api/options/[source]`. Picking a dropdown value never calls
Hermes and never re-plans.

### Where the controls render (options)
- **A. In the rail, a "Set up these steps" section under the preview** (before Apply). Lowest risk:
  no canvas/drawer wiring; reuses `SchemaForm` against each preview node's `FieldMeta`.
- **B. Attached to the selected holographic node** (click ghost node → preview-config popover/drawer).
  Best UX, most wiring: needs preview-node selection state + a preview-aware drawer mode.
- **C. The existing config drawer in a "preview/proposed" mode.** Reuses the drawer UI but needs a
  preview-config store distinct from `configSlice` and a clear "Proposed — not yet applied" banner.

### State model (all options)
- Add a **preview-config overlay** keyed by `previewId` (e.g. `previewConfig: Record<previewId,
  Record<fieldName, value>>`) held in the SAME ephemeral `WorkflowBuilder` preview state — **never**
  `configSlice`, never `pendingNodes`/`draftDefinition`, never dirty, never saved.
- Filling a control updates `previewConfig` deterministically (no Hermes). The overlay re-renders;
  "Still needs" recomputes from `missingInputs` minus filled keys.
- **Apply** then seeds the new nodes' config from `previewConfig`: extend `planToBuilderPatch` to take
  an optional `previewConfig` map and emit nodes with those values instead of empty config. Apply
  stays explicit, additive, local-draft-only; step 9 (auto-open first incomplete) still applies for
  anything left blank.

### Metadata mapping (no model call)
- For each preview node `provider:type`, look up `ActionMeta.fields` (already loaded server-side for
  the builder; thread it to the preview like `requiredFieldsByType` is). Render only the
  `required`/`missingInputs` subset via `SchemaForm`. Options via `/api/options/[source]`.

### Security / safety (carry forward existing guarantees)
- Option fetches use the existing authenticated, account-scoped `/api/options/[source]` — same
  no-cross-member-private-connection guarantees as normal config.
- Selected values live only in the ephemeral preview overlay until Apply. **Never** send selected
  config values / secrets / tokens / provider-account-ids to Hermes; picking a value triggers no
  gateway call.

## Recommended first implementation slice (smallest safe step)

**HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — rail "Set up these steps" (Option A), text/number first.**
1. Thread `ActionMeta.fields` (or a slim `fieldsByType`) to the preview, parallel to
   `requiredFieldsByType`.
2. In the preview section (rail), render `SchemaForm` for each preview node's required+missing fields,
   bound to a new ephemeral `previewConfig` map in `WorkflowBuilder` state. Start with deterministic,
   no-resolver field types (text / number / static select); defer async `optionsSource` dropdowns
   (Slack channels etc.) to slice 2 so the first slice needs no new network path.
3. Extend `planToBuilderPatch` with optional `previewConfig` so Apply seeds the collected values; keep
   empty-config behavior when absent. Auto-open-first-incomplete unchanged.
4. Tests: preview controls render from metadata; filling updates the ephemeral map only (no dirty, no
   `updateWorkflow`, no Hermes call); Apply seeds config; discard clears preview-config; no secrets.

Slice 2 adds async `optionsSource` dropdowns via `/api/options/[source]`; slice 3 (optional) moves the
controls onto the selected holographic node (Option B).

## Out of scope / constraints (this design + the future slices)
- No durable memory, no auto-save/activate/run, no auto-apply, no legacy endpoints, no direct
  OpenAI/Nous, no gateway token/URL in client code. Hermes is used only for planning/shape, never for
  config collection.
