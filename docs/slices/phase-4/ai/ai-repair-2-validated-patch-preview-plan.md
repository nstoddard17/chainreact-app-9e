# 4.AI-REPAIR-2 — Validated Patch Preview Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-14
**Branch:** `v2-main`

**Source of truth (verified current state — files read for this plan):**
[services/workflows/patch/types.ts](../../../../services/workflows/patch/types.ts) (`WorkflowPatch`, `PatchOperation` union, `PatchValidationResult`) ·
[services/workflows/patch/validateWorkflowPatch.ts](../../../../services/workflows/patch/validateWorkflowPatch.ts) (deterministic validator — apply→structure→registry/config→variables→risk recompute→cost) ·
[services/ai/preview/previewWorkflowPatch.ts](../../../../services/ai/preview/previewWorkflowPatch.ts) + [preview/types.ts](../../../../services/ai/preview/types.ts) (the EXISTING no-leak, label-based "what would change" view — `previewWorkflowPatchForAI` / `PatchPreviewResult`) ·
[services/ai/patch/materializeAiPatchNodeIds.ts](../../../../services/ai/patch/materializeAiPatchNodeIds.ts) + [patch/normalizeAiPatchNodeKeys.ts](../../../../services/ai/patch/normalizeAiPatchNodeKeys.ts) (model node-key → system-id materialization) ·
[services/ai/repair/suggestWorkflowRepair.ts](../../../../services/ai/repair/suggestWorkflowRepair.ts) + [repair/repairStrategies.ts](../../../../services/ai/repair/repairStrategies.ts) (AI-7 deterministic strategy→patch→preview for FAILED RUNS — the closest existing sibling) ·
[services/ai/repair/planWorkflowRepair.ts](../../../../services/ai/repair/planWorkflowRepair.ts) (AI-REPAIR-1b — proposal-ONLY model service this builds on; its own doc names AI-REPAIR-2 as "the next slice on top of the existing validateWorkflowPatch engine") ·
[app/api/workflows/[id]/ai/repair/plan/route.ts](../../../../app/api/workflows/[id]/ai/repair/plan/route.ts) (AI-REPAIR-1b route control flow to mirror) ·
[services/ai/diagnostics/diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts) + [diagnostics/buildDiagnosisExplainContext.ts](../../../../services/ai/diagnostics/buildDiagnosisExplainContext.ts) + [diagnostics/draftOverride.ts](../../../../services/ai/diagnostics/draftOverride.ts) (safe diagnosis DTO + allow-list projector + current-draft snapshot) ·
[services/ai/planner/workflowPlanTool.ts](../../../../services/ai/planner/workflowPlanTool.ts) (the forced structured-output tool pattern; `proposedPatch` lenient at the tool, strict downstream) ·
[core/billing/aiCreditPolicy.ts](../../../../core/billing/aiCreditPolicy.ts) (`workflow_repair: 4` already mapped) ·
[services/billing/aiCreditGate.ts](../../../../services/billing/aiCreditGate.ts) + [billing/billingFeatureFlags.ts](../../../../services/billing/billingFeatureFlags.ts) (`ENABLE_AI_CREDIT_ENFORCEMENT`, default OFF) ·
[lib/api/ai/diagnostics.ts](../../../../lib/api/ai/diagnostics.ts) (the AI-REPAIR-CLEANUP-1 client module that holds `planWorkflowRepair` + repair types).

---

## 1. Context

AI-REPAIR-1 (commits `69ccecb32` / `edc139934` / `399d13e87`) shipped a metered,
**proposal-only** repair plan: "Suggest a fix" returns plain-language
recommendations (`RepairProposal`) for a diagnosed workflow — no patch, no apply.
The follow-up AI-DIAG-FIX-1 (`92ea2968d`) made Check/Explain/Suggest diagnose the
**current unsaved builder draft** and render **node labels, not ids**. The Builder
AI client + panel were then split in a no-behavior-change refactor
(`8a408c64b`, AI-REPAIR-CLEANUP-1). AI credit enforcement is **OFF**; Hermes / MCP
internal path / apply are deferred. Closeout:
[ai-repair-1-safe-repair-proposal-closeout.md](./ai-repair-1-safe-repair-proposal-closeout.md).

AI-REPAIR-1's own plan (§Q7, R-3) explicitly reserved this slice: the model →
`WorkflowPatch` contract, the preview UI, and the apply path. AI-REPAIR-2 is the
next rung: **the AI proposes structured changes; the server validates them through
the existing patch engine and shows what would change — and applies nothing.**

Parent arc: [ai-repair-1-safe-repair-proposal-plan.md](./ai-repair-1-safe-repair-proposal-plan.md),
[ai-architecture-react-agent-plan.md](../ai-architecture-react-agent-plan.md) (§6, the WorkflowPatch system).

---

## 2. Current codebase findings (verified)

Every claim below traces to a file read for this plan. **The headline finding:
the validated-patch-preview pipeline is already built and battle-tested** — it is
the engine behind the live `planWorkflow` flow. AI-REPAIR-2 is mostly a thin
LLM-patch-generation layer over it.

**(a) The deterministic validator already does everything the product boundary asks.**
`validateWorkflowPatch(patch, currentDefinition, { currentRevision? })`
([validateWorkflowPatch.ts:144](../../../../services/workflows/patch/validateWorkflowPatch.ts#L144))
is pure (no model, no DB write, no mutation). Pipeline: Zod envelope parse →
optimistic-concurrency (`baseRevision`) → atomic apply onto a clone → structural
validation → registry grounding + FieldMeta config validation → variable-reference
checks → branch-label warnings → **deterministic risk/confirmation recompute
(`classifyPatchRisk` — overrides any model-proposed risk)** → COST-2 task estimate.
Returns `PatchValidationResult` with `candidateDefinition`, `errors[]`,
`warnings[]`, authoritative `riskLevel`/`requiresConfirmation`, `riskReasons[]`,
`taskCostEstimate`, `affectedNodeIds[]`, `previewSummary`. **No-leak by construction**
— every message is built from ids, field KEY names, and registry metadata, never
resolved config VALUES (file header).

**(b) The user-facing preview renderer already exists and is no-leak + label-based.**
`previewWorkflowPatchForAI({ userId, workflowId, patch })`
([previewWorkflowPatch.ts:226](../../../../services/ai/preview/previewWorkflowPatch.ts#L226))
loads the current def (ownership + NOT_FOUND via `getWorkflowGraphForAI`, config
secret-redacted) → `normalizeAiPatchNodeKeys` → `validateWorkflowPatch` → humanizes
errors (`humanizePatchError`, no raw `provider:type`) → builds before/after
explanations → **value-free per-operation change descriptions that already use node
DISPLAY LABELS** (`resolveNodeDisplayNameFromRegistry`, e.g. `Adds "Gmail — Send
Email"`, `Updates configuration for "<label>" (fields: subject, body)`) → scrubs
secret-shaped keys. Result `PatchPreviewResult` ([preview/types.ts:52](../../../../services/ai/preview/types.ts#L52))
carries `validation{ok,errors,warnings}`, `changes[]` (label-bearing), `riskLevel`,
`requiresConfirmation`, `riskReasons`, `taskCostEstimate`, `beforeSummary`,
`afterSummary`, `candidateSummary`, `userFacingSummaryText`, `canApplyLater`,
`blockedReason`. **This is exactly the AI-REPAIR-2 preview payload** — it needs no
new rendering logic.

**(c) Model node-key → system-id materialization is solved.**
`materializeAiPatchNodeIds(patch, currentDef, { nodeIdGen?, edgeIdGen? })`
([materializeAiPatchNodeIds.ts:116](../../../../services/ai/patch/materializeAiPatchNodeIds.ts#L116))
assigns fresh system ids to AI-created nodes/edges, rewrites all references
(edges, `nodeId`, `{{patchLocalId.path}}` tokens), strips AI-set `displayName`,
and **rejects an invented reference to a non-existent node** (`UNKNOWN_NODE` —
"no silent map to the only Slack node"). Existing canvas nodes keep their stable
ids. The preview validates with patch-local ids intact (errors read back the ids
the model reasoned about); system-id materialization runs only at the apply
persistence boundary. `normalizeAiPatchNodeKeys` additionally fixes a
self-qualified `type` key (`gmail:new_email` → real registry key) before validation.

**(d) A deterministic, MODEL-FREE repair→patch→preview already exists for failed runs.**
`suggestWorkflowRepairForAI({ userId, workflowId, workflowRunId })`
([suggestWorkflowRepair.ts:61](../../../../services/ai/repair/suggestWorkflowRepair.ts#L61))
classifies a failed run into one category (disconnected / unknown-node / billing /
missing-field / variable-repair / downstream-ref / edge-repair / missing-trigger),
builds a `WorkflowPatch` from `repairStrategies.ts`, runs it through
`previewWorkflowPatchForAI`, and downgrades to `noSafeRepair` when the preview
rejects it. **No model call, no credit.** It is run-scoped (needs a `workflowRunId`)
and is the AI-13 client surface (`requestWorkflowRepair`). This is the strongest
existing template — and a real alternative/complement to an LLM patch (see §5).

**(e) AI-REPAIR-1b is proposal-only and names this slice as its successor.**
`planWorkflowRepair` ([planWorkflowRepair.ts:17](../../../../services/ai/repair/planWorkflowRepair.ts#L17))
"is a PROPOSAL ONLY — it produces NO patch, NO `WorkflowPatch` … leaves the next
slice (AI-REPAIR-2) on top of the existing `validateWorkflowPatch` engine." Its
route ([repair/plan/route.ts](../../../../app/api/workflows/[id]/ai/repair/plan/route.ts))
is the control-flow template: `requireUser` → `loadWorkflowForMember` (no-leak 404)
→ re-derive DTO server-side → access-wall short-circuit (no gate/model) →
OpenAI-configured check **before** charging → `aiCreditGate` **before** the model →
model → fail-open `ai_cost_events` recording → typed response with the documented
status map.

**(f) The forced structured-output tool pattern is established.**
`workflowPlanTool.ts` declares `propose_workflow_plan` with a JSON Schema that is
**intentionally lenient** about `proposedPatch` (`object | null`, no recursive op
enumeration) because `WorkflowPatchSchema` + the parser are the strict downstream
gate ([workflowPlanTool.ts:30-44](../../../../services/ai/planner/workflowPlanTool.ts#L30)).
AI-REPAIR-2's model service mirrors this: a forced `propose_workflow_repair_patch`
tool, lenient at the tool boundary, strict at `WorkflowPatchSchema` /
`validateWorkflowPatch`.

**(g) Credits + flag: no migration, no policy change.**
`workflow_repair: 4` is already mapped ([aiCreditPolicy.ts:59](../../../../core/billing/aiCreditPolicy.ts#L59)).
The gate is a no-op while `ENABLE_AI_CREDIT_ENFORCEMENT !== "true"` (today's prod
state) ([aiCreditGate.ts](../../../../services/billing/aiCreditGate.ts),
[billingFeatureFlags.ts:104](../../../../services/billing/billingFeatureFlags.ts#L104)).

**(h) The diagnosis context + draft snapshot are available server-side.**
`diagnoseWorkflowForAgent({ subjectUserId, workflowId, draftOverride? })` returns
the safe DTO (findings carry INTERNAL `nodeIds` + safe `nodeLabels`); the optional
`draftOverride` (validated `WorkflowDefinition` via `parseDraftOverride`) is the
current unsaved canvas. The client already forwards `currentDraft` to diagnose /
explain / repair (AI-DIAG-FIX-1). The full draft definition (incl. node ids +
config) is on the server for re-derivation — it is **not** sent to the model by
AI-REPAIR-1 (the projector strips ids); AI-REPAIR-2 changes that calculus (§Q6).

---

## 3. Product / model decision

**What it IS:** a metered, **preview-only** validated repair. Given the
server-re-derived diagnosis + current draft, an LLM proposes a `WorkflowPatch`
(structured operations). The server **materializes node ids → validates via the
existing `validateWorkflowPatch` / `previewWorkflowPatchForAI`** → returns a no-leak,
label-based "what would change" preview: the operations in plain language, the
recomputed (authoritative) risk, errors/warnings, affected nodes (by label), cost,
and a before/after summary. The UI renders it. **Nothing is applied, saved, or run.**

**What it is deliberately NOT (this slice):** no Apply button (not even disabled),
no auto-apply, no `applyWorkflowPatchForAI` import on the new path, no DB write, no
graph mutation, no run trigger, no save, no Hermes, no MCP internal path, no memory
write, no autonomous loop, no new migration, no flag flip.

**Relation to the existing surfaces:**
- *Explain (1 credit)* describes the diagnosis. *Suggest a fix / repair plan (AI-REPAIR-1, 4 credits)* recommends changes in prose. *Preview fix (AI-REPAIR-2)* shows the **validated, structured** changes that would resolve them. Each is one rung more actionable; all preview-only.
- The validated preview is **the same `PatchPreviewResult`** the live planner produces — so a future apply slice (AI-REPAIR-3) reuses the proven `applyWorkflowPatchForAI` path behind a passing preview, exactly as `planWorkflow → apply` does today.

Anchored to the V2 account-scoped model: the cost owner is the **workflow-owning
account** resolved server-side (`loadWorkflowForMember`), never client-supplied;
the no-leak walls and ownership are inherited wholesale from the diagnosis +
preview services.

---

## 4. Recommended approach (answers Q1–Q14)

**Q1 — Action label:** **"Preview fix"** (button text). It promises a *validated
preview*, not an application, and reads as the natural next step after "Suggest a
fix". Supporting caption: *"AI proposes specific changes and shows what would
change. Nothing is applied, saved, or run."* (Internal feature key stays
`workflow_repair`.) Rejected: "Show proposed changes" (verbose, doesn't signal the
validation), "Fix it"/"Apply fix" (imply mutation — forbidden this slice).

**Q2 — Where it appears:** on the **repair-proposal bubble** (the `repair_proposal`
message produced by AI-REPAIR-1's "Suggest a fix"), as a follow-on action *"Preview
these changes"*. Rationale: the proposal already names the recommended changes in
prose; previewing turns *that* into validated structured operations — a clean
narrative (diagnose → suggest → preview). It also keeps the diagnosis bubble
uncluttered (Explain + Suggest already live there). **Acceptable alternative:** also
expose it on the diagnosis bubble next to Suggest for users who want to skip the
prose step — but recommend **proposal-bubble first** (one entry point) and revisit
only if users want a direct path. Never auto-triggered; explicit click only.
Per-proposal "already previewed" state blocks a repeat charge (mirrors
`suggestedDiagnosisIds`).

**Q3 — Route:** **`POST /api/workflows/[id]/ai/repair/preview`** (recommended). Noun
sibling of `…/ai/repair/plan`; leaves `…/ai/repair/apply` for AI-REPAIR-3. Rejected:
`…/ai/repair/patch` (reads like it mutates), `…/ai/preview` (collides conceptually
with the planner's preview).

**Q4 — Service ownership:** **new `services/ai/repair/previewWorkflowRepair.ts`** —
`previewWorkflowRepair({ dto, draftDefinition, modelClient, tier })`. It owns ONLY:
build safe model context → force the `propose_workflow_repair_patch` tool → Zod-parse
the model's patch envelope → assemble a `WorkflowPatch` → hand off to the EXISTING
`previewWorkflowPatchForAI` (which owns materialize/validate/render). It has **no
account/billing concept**. The **route** owns auth, `loadWorkflowForMember`,
server-side DTO + draft re-derivation, the access wall, the OpenAI-configured check,
`aiCreditGate`, and `ai_cost_events` recording — identical ordering to the AI-REPAIR-1b
route. **Hard reuse:** `validateWorkflowPatch`, `previewWorkflowPatchForAI`,
`materializeAiPatchNodeIds`, `normalizeAiPatchNodeKeys` are reused **verbatim** — no
fork.

**Q5 — Inputs reused:** **all three, each for a distinct job.**
- *Diagnosis DTO* (`diagnoseWorkflowForAgent`, re-derived server-side): tells the model WHAT to fix (findings, codes, missing fields/scopes, node labels). Projected through `buildDiagnosisExplainContext` (no-leak) for the model.
- *Repair proposal* (AI-REPAIR-1's `RepairProposal`, OPTIONAL): when the user clicks "Preview these changes" on a proposal bubble, the client MAY pass the proposal's `summary`/`recommendedActions` as additional steering context so the preview aligns with what the prose promised. **Not authoritative** — the server still re-derives the diagnosis; the proposal is a hint, never trusted for authz or correctness.
- *Current draft snapshot* (`draftDefinition`, validated via `parseDraftOverride`): the graph the patch is computed against — so the preview reflects the unsaved canvas the user sees (consistent with AI-DIAG-FIX-1). `baseRevision` is taken from the **saved** workflow's `updatedAt` (preview/validate already source this from `getWorkflowGraphForAI`), so a later apply's optimistic-concurrency check is honest.

**Q6 — Safe model context, incl. node ids:** the model is sent (i) the no-leak
diagnosis projection (`buildDiagnosisExplainContext`) and (ii) a **minimal node
inventory with OPAQUE node ids + safe labels** (`{ id, kind, provider, type,
displayName? }` per node + `{ id, from, to }` per edge) — the exact shape the live
planner already sends (`CurrentGraphSnapshot`). **Node ids ARE needed and ARE sent**
to the model here, and this is safe + consistent:
- To target existing broken nodes (`updateNodeConfig` / `removeNode` /
  `repairVariableReference` / `addEdge` endpoints), the patch must reference real
  node ids — `materializeAiPatchNodeIds` keeps existing-canvas ids and **rejects
  invented ones**, so the model cannot "guess" a target.
- Node ids are **opaque, non-secret** strings already crossing the model boundary
  in the planner; AI-REPAIR-1's "no ids" stance was about *user-facing TEXT*, which
  this slice still honors (the preview renders LABELS via `previewWorkflowPatchForAI`).
- **Forbidden in the model context (unchanged):** tokens, credentials, integration
  rows, providerAccountId / account labels, connectedByUserId, **resolved config
  VALUES**, run payloads, PII. The node inventory carries ids + provider/type +
  user displayName only — no config values. (If we want extra caution, the inventory
  can omit config entirely and let the model propose `updateNodeConfig` with the
  fields the diagnosis flagged as missing — recommended.)

**Q7 — Output schema:** **a `WorkflowPatch` via a forced structured tool**, not a
new narrow op language. Reuse the proven contract: lenient tool schema
(`propose_workflow_repair_patch`, mirroring `workflowPlanTool`'s `object|null`
leniency) + **strict downstream `WorkflowPatchSchema` + `validateWorkflowPatch`**.
The model's envelope `riskLevel`/`requiresConfirmation` are **advisory and
discarded** — the validator recomputes them. **Steering (system prompt), not schema
restriction:** prompt the model toward minimal, repair-shaped operations
(`updateNodeConfig`, `repairVariableReference`, `addNode`+`addEdge` for a missing
step, `replaceTrigger`); discourage `removeNode` unless a finding requires it. The
validator + risk recompute are the safety net regardless of which ops the model
emits, so we do NOT need a narrower union (which would diverge from the apply path
and add a second schema to maintain).

**Q8 — Validation flow (reuse, do not rebuild):**
1. Model emits a candidate patch envelope (operations with patch-local/real ids).
2. `previewWorkflowPatchForAI({ userId, workflowId, patch })` runs the whole chain:
   `normalizeAiPatchNodeKeys` → `validateWorkflowPatch` (atomic apply → structure →
   registry/config → variable refs → **risk recompute** → cost) → humanized,
   secret-scrubbed errors/warnings → before/after explanations → **label-based
   `changes[]`** → `affectedNodeIds`, `riskLevel`, `requiresConfirmation`,
   `riskReasons`, `taskCostEstimate`, `blockedReason`, `canApplyLater`.
3. The route returns the `PatchPreviewResult` (proposal-side fields only — see Q9).
   `canApplyLater` is surfaced as **metadata only**; it enables NO apply control in
   this slice. A model patch that fails validation returns `ok:false` with the
   humanized `blockedReason` — the UI shows "couldn't build a safe fix," never an
   applyable artifact (mirrors `suggestWorkflowRepair`'s `noSafeRepair` downgrade).

**Q9 — UI preview design (labels, not JSON):** a new `repair_preview` message bubble
(or an expansion of the `repair_proposal` bubble) rendering, from `PatchPreviewResult`:
- a one-line `userFacingSummaryText`;
- the ordered **`changes[]`** as human sentences (already label-based: *Adds "Gmail —
  Send Email"*, *Updates configuration for "Slack — Send Message" (fields: channel)*,
  *Repairs variable reference in field "to" of "Send Email"*);
- the **AI-recomputed risk** chip (`riskLevel` + `requiresConfirmation`) labeled as
  the *validated* risk (this one IS authoritative — unlike AI-REPAIR-1's advisory
  estimate — because it comes from `validateWorkflowPatch`, not the model);
- a compact before/after (`beforeSummary` / `afterSummary` / `candidateSummary`),
  task-cost estimate, and any warnings;
- on `ok:false`: the humanized `blockedReason` + the validation errors as friendly
  copy (no raw codes/JSON);
- an **immutable "This is a preview only — your workflow wasn't changed, saved, or
  run." notice**;
- **NO Apply button** (not even disabled). Raw `affectedNodeIds` (opaque ids) are
  NOT rendered; the label-bearing `changes[]` are the user surface.

**Q10 — Previewable vs not-previewable:**
- *Previewable:* `access === "OK"` AND the diagnosis has real issues AND the model
  returns a patch that **passes** `validateWorkflowPatch` → render the full preview.
- *Previewable-but-blocked:* model returns a patch that **fails** validation
  (`UNKNOWN_NODE`, `MISSING_REQUIRED_FIELD` with no safe value, `PATCH_CONFLICT`,
  invalid edge, etc.) → render `ok:false` with `blockedReason` + friendly errors;
  no apply artifact. This is a legitimate, common outcome — surface it honestly.
- *Not previewable (no model call / safe short-circuit):* access walls
  (`NOT_FOUND`/`NO_ACCESS`) → safe DTO, no gate/model; clean/ready diagnoses (nothing
  to fix) → the entry affordance is hidden (reuse `canExplainDiagnosis`);
  OpenAI-not-configured → 503 before charge; credits exhausted (flag ON) → 402.
- *Out of scope for the model patch (route to prose, not a patch):* findings that
  inherently need a **user action outside the builder** — reconnect an integration,
  grant a scope, upgrade plan, supply a secret value. A patch can't fix these; the
  preview should defer to AI-REPAIR-1's recommendation copy (or the diagnosis
  `nextSteps`) rather than emit a doomed patch. The deterministic strategies in
  `repairStrategies.ts` already make exactly this distinction — see §5/§10 R-2.

**Q11 — Credit feature:** reuse **`workflow_repair` (4 credits)** — no policy /
migration change (finding (g)). The route gates with `aiCreditGate({ accountId,
feature: "workflow_repair", plannedTier: "fast" })` before the model and records an
`ai_cost_events` model-call event (fail-open), billed to the workflow-owning
account. `ENABLE_AI_CREDIT_ENFORCEMENT` stays **OFF** — gate is a no-op, recording
still writes the 4-credit charge (consistent with Explain + AI-REPAIR-1). Note both
"Suggest a fix" and "Preview fix" are 4 credits today; if double-charging the same
repair feels heavy once enforcement is on, a follow-up can make Preview free when it
immediately follows a Suggest on the same diagnosis (R-5) — out of scope now.

**Q12 — Hermes?** **No.** This is a single request → single structured model call →
deterministic validation → response, identical in shape to Explain / AI-REPAIR-1.
No multi-step loop, no tool orchestration, no memory. The deterministic
validate→preview is plain server code, not an agent loop. **Do not introduce
Hermes.**

**Q13 — Test plan:** see §8.

**Q14 — Implementation split:** see §9.

---

## 5. Alternatives considered

**Patch source**

| Option | Verdict | Why |
|---|---|---|
| LLM emits `WorkflowPatch`, server validates via `validateWorkflowPatch`/`previewWorkflowPatchForAI` | **Chosen** | Matches the product framing ("AI proposes structured changes"); reuses the entire proven preview engine; natural successor to AI-REPAIR-1; the validator is the safety net. |
| Deterministic diagnosis→patch strategies (extend `repairStrategies.ts` to be diagnosis-scoped, no model) | **Strong complement (deferred / R-2)** | Free, no credit, no model risk, already exists for failed runs — but run-scoped today and limited to known categories. Recommend as a **fast-path optimization** in a later slice: try deterministic first, fall back to the LLM. Not the headline this slice. |
| Hybrid: deterministic where a strategy matches the finding, LLM for the rest | Deferred | Best end state, but bigger than one slice. Land the LLM path first (this slice), add the deterministic fast-path as AI-REPAIR-2b. |

**Output contract**

| Option | Verdict | Why |
|---|---|---|
| Full `WorkflowPatch` (lenient tool + strict `WorkflowPatchSchema`/validator) | **Chosen** | Same contract the apply path consumes; risk recomputed deterministically; no second schema to maintain. |
| New narrow "repair operation" union | Rejected | Diverges from the apply path; duplicates validation surface; the validator already gates all ops. |
| Plan + advisory patch (AI-REPAIR-1 already did the prose) | N/A | AI-REPAIR-1 is the prose; this slice is the validated structured step. |

**Entry point**

| Option | Verdict | Why |
|---|---|---|
| "Preview fix" on the repair-proposal bubble | **Chosen** | Clean diagnose→suggest→preview narrative; keeps the diagnosis bubble uncluttered. |
| Also/instead on the diagnosis bubble | Accepted as optional | A direct path for users who skip prose; revisit if requested. |

**Credit feature** — reuse `workflow_repair` (4): **Chosen** (already mapped, zero
migration). New key: rejected (unnecessary).

---

## 6. Security / data model

- **No new DB objects, no migration, no `db:push`.** Credits reuse the existing
  `account_billing` counters + `deduct_ai_credits_if_available` (already applied) and
  the `ai_cost_events` recorder. The plan proves no migration is required — none is added.
- **No-leak inherited wholesale:** the model sees only `buildDiagnosisExplainContext(dto)`
  + an opaque-id/label node inventory (NO config values). The preview renderer
  (`previewWorkflowPatchForAI`) is already no-leak: secret-shaped config keys scrubbed,
  errors humanized (no raw `provider:type`), config VALUES never echoed. The response
  carries the `PatchPreviewResult` (label-based `changes[]`, ids only as opaque
  `affectedNodeIds` which the UI does not render).
- **Authz wall:** `loadWorkflowForMember` → workflow-owning account membership;
  non-member / missing / cross-account → no-leak 404 **before** any gate or model
  call. Access-wall DTO short-circuits with no model call (mirrors AI-REPAIR-1b).
- **Draft snapshot is read-only:** validated by `parseDraftOverride` (strict
  `WorkflowDefinitionSchema`); used only to compute the candidate; **never persisted**.
  A malformed draft → 400, never silently used.
- **Fail-closed billing, fail-open telemetry:** gate before the model; gate error →
  `AI_GATE_ERROR` 503 (no model); OpenAI-not-configured → 503 before charge; recorder
  fail-open.
- **Apply boundary is hard:** the new route/service import **NO** `applyWorkflowPatchForAI`
  / no DB write / no run trigger. The patch never reaches persistence. (An import-boundary
  test enforces this — §8.)
- **Shared-project caution (unchanged):** dev/preview/prod share one Supabase project,
  so the recorder writes live `ai_cost_events` even from dev (existing behavior). Tests
  mock model + recorder.

---

## 7. API / service / UI expectations (described, not built)

- **Route** `POST /api/workflows/[id]/ai/repair/preview`: byte-for-byte the
  AI-REPAIR-1b control flow, swapping the service call to `previewWorkflowRepair` and
  the response body to the `PatchPreviewResult` (proposal-side fields). Same status map
  (401/400/404/402/403/503/500), same `workflow_repair` gate + recording. Accepts the
  optional `draftDefinition` (and optional `proposalContext` hint).
- **Service** `services/ai/repair/previewWorkflowRepair.ts`: builds the safe context,
  forces `propose_workflow_repair_patch`, Zod-parses the envelope, assembles a
  `WorkflowPatch` (with `baseRevision` = saved `updatedAt`), and delegates to
  `previewWorkflowPatchForAI`. Discriminated result `ok` (with `PatchPreviewResult`) /
  `MODEL_FAILED` / `PARSE_FAILED`. No account/billing concept.
- **Client** `lib/api/ai/diagnostics.ts` (or a sibling `repair.ts` module): add
  `previewWorkflowRepair(workflowId, draftDefinition?, proposalContext?)` returning a
  discriminated `ok` preview / typed `{ok:false, code}` (reuse `AI_CREDITS_EXHAUSTED_MESSAGE`,
  `MODEL_FAILED`, etc.). Add the `PatchPreviewResult` client view types (client-owned,
  no `@/services/**` import — mirror the existing AI client type convention).
- **UI:** a `repair_preview` message kind + a `RepairPreviewBody` presentational
  component (sibling to the proposal body), a "Preview fix" button on the gated
  proposal bubble, the immutable "preview only" notice, per-proposal previewed-state.
  **No Apply control.** Wire through the already-split `useBuilderDiagnosisActions`
  hook (add `previewing` / `previewedProposalIds` + a `handlePreviewFix` handler, same
  shape as `handleSuggestFix`).

---

## 8. Tests required (Q13)

**Service (`previewWorkflowRepair`):**
- No-leak: the model prompt contains ONLY `buildDiagnosisExplainContext(dto)` + the
  opaque-id/label node inventory — assert no token / config VALUE / account label /
  resolved field value; node ids are opaque non-secret strings (allowed).
- Emits a `WorkflowPatch` and delegates to `previewWorkflowPatchForAI` (mock it; assert
  the patch shape + that the service does NOT call `validateWorkflowPatch` itself
  beyond the preview seam, and never imports apply).
- Model returns malformed/oversized envelope → `PARSE_FAILED` (no throw).
- Model failure → `MODEL_FAILED` (safe result).
- Advisory model `riskLevel` is ignored — the returned risk equals the validator's
  recompute (feed a patch whose model-claimed risk differs from the deterministic one).
- A model patch referencing an invented node id → preview `ok:false` with `UNKNOWN_NODE`
  humanized, no applyable artifact (exercises materialize rejection).

**Route (`/ai/repair/preview`):**
- Re-derives diagnosis + draft server-side (ignores any client-posted DTO).
- Non-member / missing / cross-account → **404 before** gate/model.
- Access wall (`NOT_FOUND`/`NO_ACCESS`) → safe DTO, **no** gate/model.
- Malformed `draftDefinition` → 400 (`parseDraftOverride`).
- OpenAI not configured → 503 **before** charging.
- Gate before model; denial → 402 `AI_CREDITS_EXHAUSTED` (flag ON); frozen → 403;
  gate error → 503.
- Records `ai_cost_events` `feature: "workflow_repair"` (4), billed to the
  workflow-owning account; fail-open.
- Response carries preview fields only; **no apply/save/run**; never claims anything
  was changed.
- **Import-boundary test:** route + service import **no** `applyWorkflowPatchForAI`,
  no repositories write path, no run trigger, **no Hermes**, no `scripts/mcp` path.

**UI (`useBuilderDiagnosisActions` + `RepairPreviewBody`):**
- "Preview fix" shows only on a repair-proposal bubble (or gated diagnosis) with real
  issues; hidden on clean/ready + access walls.
- Explicit click only; calls `previewWorkflowRepair(...)` once; per-proposal previewed
  state blocks re-charge.
- Renders label-based `changes[]`, validated risk chip, before/after, warnings, and
  the immutable "preview only" notice; renders `blockedReason` safely on `ok:false`.
- No-leak: bubble renders no raw node ids / codes / JSON / model metadata.
- Asserts the graph store is **untouched** (no mutation/save/run) across the flow.

---

## 9. Implementation slice breakdown (Q14)

- **AI-REPAIR-2a — this doc (planning only).** No code. ← *this slice*
- **AI-REPAIR-2b — service + route + client + tests, NO UI.**
  `services/ai/repair/previewWorkflowRepair.ts`, the `propose_workflow_repair_patch`
  tool, `app/api/workflows/[id]/ai/repair/preview/route.ts`, the `lib/api/ai`
  client + `PatchPreviewResult` client types, and all service/route tests above.
  Shippable + testable with zero user-visible surface (route inert until 2c wires a
  button). **No flag** (no UI entry yet). Reuses `validateWorkflowPatch` /
  `previewWorkflowPatchForAI` / materialization verbatim and `workflow_repair`
  credits; enforcement stays OFF.
- **AI-REPAIR-2c — Builder UI.** `repair_preview` message kind + `RepairPreviewBody`,
  the gated "Preview fix" button, wiring in `useBuilderDiagnosisActions` +
  `BuilderAiPanel` message list, immutable preview-only notice, previewed-state. UI
  tests above.

Later (separate slices): **AI-REPAIR-2b-fastpath** — deterministic diagnosis-scoped
strategies (extend `repairStrategies.ts`) tried before the LLM (free, no credit);
**AI-REPAIR-3** — a gated **apply** behind a passing preview, reusing the proven
`applyWorkflowPatchForAI` + confirmation/risk-ack path (requires explicit approval;
introduces the first Apply control).

---

## 10. Risks / open questions

- **R-1 (node ids to the model):** AI-REPAIR-2 sends opaque node ids to the model
  (needed to target existing nodes), reversing AI-REPAIR-1's "no ids" input stance.
  This is safe (ids are non-secret; the planner already does it) and user-facing
  output still uses labels. **Recommendation: send ids in the inventory; keep config
  VALUES out; render labels.** If we want to be even stricter, omit config from the
  inventory and let the model fill only diagnosis-flagged missing fields.
- **R-2 (LLM vs deterministic):** much of what "Check workflow" finds (missing field,
  disconnected integration, missing/downstream variable, missing trigger, broken edge)
  already has a **deterministic** strategy in `repairStrategies.ts`. An LLM patch for
  these is more expensive and less reliable than reusing the strategy engine.
  **Recommendation:** ship the LLM path first (matches the ask + AI-REPAIR-1 arc), then
  add a deterministic fast-path (AI-REPAIR-2b-fastpath) that handles known categories
  free and falls back to the LLM. Findings that need a user action outside the builder
  (reconnect / scope / upgrade / secret) must NOT produce a patch — defer to prose.
- **R-3 (validated risk vs advisory risk):** unlike AI-REPAIR-1's advisory estimate,
  AI-REPAIR-2's risk comes from `validateWorkflowPatch` and IS authoritative. The UI
  must label it as the *validated* risk and must NOT let it enable any apply (none
  exists). **Recommendation: render as validated risk; never act on it this slice.**
- **R-4 (baseRevision / stale draft):** the preview validates the patch against the
  current draft but `baseRevision` is the saved `updatedAt`; if the user keeps editing
  after previewing, a future apply correctly hits `PATCH_CONFLICT` and must re-preview.
  **Recommendation: surface "preview reflects the current canvas; re-preview after
  edits" copy; the apply slice owns the conflict UX.**
- **R-5 (two 4-credit buttons):** Suggest (4) + Preview (4) on related bubbles. Once
  enforcement is ON this could feel heavy. **Recommendation: ship at 4/4; consider a
  follow-up that makes Preview free when it immediately follows Suggest on the same
  diagnosis.**
- **R-6 (ledger writes from shared project):** preview records to live `ai_cost_events`
  even in dev (existing behavior). **Mitigation: mocked model + recorder in tests.**

---

## 11. Acceptance criteria

**This planning slice (AI-REPAIR-2a):**
- This doc exists under `docs/slices/phase-4/`, grounded in real files (citations above).
- No source / tests / migrations / UI / schema changed. Nothing pushed; docs-only local commit.

**The implementation must later meet (2b/2c):**
- Route mirrors the AI-REPAIR-1b ordering: authz → re-derive (diagnosis + draft) →
  access-wall → configured → gate → model → preview → record → response; 404-before-model;
  gate-before-model.
- The model emits a `WorkflowPatch`; the server validates via the EXISTING
  `validateWorkflowPatch` / `previewWorkflowPatchForAI` (no fork); risk is the
  deterministic recompute; the model's advisory risk is discarded.
- Response is a no-leak `PatchPreviewResult` (label-based `changes[]`, no config values,
  no rendered raw ids/JSON); `ok:false` carries a humanized `blockedReason`.
- Credits via existing `workflow_repair` (4), billed to the workflow-owning account;
  enforcement OFF; no migration.
- UI shows "Preview fix" only on a real-issue proposal/diagnosis (reuse
  `canExplainDiagnosis`); **no Apply control**; immutable "preview only" notice.
- No graph mutation, no save, no run, no apply import, no MCP path, no Hermes, no memory write.

---

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, or UI were written. No route/service/client
added. No DB push, no migration, no flag enablement, no env change, no Hermes, no
MCP path, no Apply button, no graph mutation, no workflow save, no run trigger, no
auto-fix, no deploy, no feature branch, no PR. Apply/mutation explicitly out of
scope. The only artifact is this planning doc.

---

## 13. Recommended next step

**AI-REPAIR-2b** — implement `services/ai/repair/previewWorkflowRepair.ts` + the
`propose_workflow_repair_patch` tool + `POST /api/workflows/[id]/ai/repair/preview` +
the `lib/api/ai` client + `PatchPreviewResult` client types, with the full
service/route test suite (§8). Reuse `validateWorkflowPatch` /
`previewWorkflowPatchForAI` / `materializeAiPatchNodeIds` verbatim. No UI, no flag,
reuse `workflow_repair` credits, enforcement OFF, no Apply. Ship to `v2-main` after
checks once approved.
