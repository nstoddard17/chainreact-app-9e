# Guided setup on the holographic preview — audit + design (HERMES-AGENT-RAIL-PRODUCT-LABEL-AND-GUIDED-PREVIEW-DESIGN)

> **Design only.** This slice ships one tiny behavior change (chat label "Hermes:" → "React:",
> header "connected · Hermes" → "connected") and this document. No guided-setup code is implemented
> here. It records the audit + the recommended first implementation slice.

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
