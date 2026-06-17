# 4.AI-REPAIR-COVERAGE-2 — Next deterministic repair category Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-17
**Branch:** `v2-main`

**Source of truth (verified current state — files read for this plan):**
[contracts/workflowDefinition.ts](../../../../contracts/workflowDefinition.ts) (`WorkflowEdge` = `{id, from, to, label?}` lines 57-69; `WorkflowDefinitionSchema.superRefine` lines 85-156 — rejects self-loop / unknown-endpoint / **duplicate `(from,to,label??"")`** / dup-node-id / multi-trigger) ·
[services/execution/branching.ts](../../../../services/execution/branching.ts) (`selectActivatedEdges` — label-aware traversal; unlabeled edges always activate, labeled require `branchTaken === label`) ·
[core/workflows/executionReadiness.ts](../../../../core/workflows/executionReadiness.ts) (`findGraphIssues` — `no_trigger` / `multiple_triggers` / `stale_edge` / `unreachable_node`; lines 66-134) ·
[core/workflows/selfLoopEdges.ts](../../../../core/workflows/selfLoopEdges.ts) (`findSelfLoopEdges` — `from === to`) ·
[services/ai/repair/repairStrategies.ts](../../../../services/ai/repair/repairStrategies.ts) (`buildEdgeRepairOutcome` lines 263-276, `buildSelfLoopEdgeRepairOutcome` lines 284-296 — both `removeEdge`-only) ·
[services/ai/repair/deterministicRepairPreview.ts](../../../../services/ai/repair/deterministicRepairPreview.ts) (`previewRepairOps` helper; `runDanglingEdgeRepairPreview` / `runSelfLoopEdgeRepairPreview`) ·
[app/api/workflows/[id]/ai/repair/preview/route.ts](../../../../app/api/workflows/[id]/ai/repair/preview/route.ts) (deterministic branches `repairDanglingEdges` / `repairSelfLoopEdges` run BEFORE the credit gate / model) ·
[app/api/workflows/[id]/ai/repair/apply/route.ts](../../../../app/api/workflows/[id]/ai/repair/apply/route.ts) (draft-only apply; re-validates; no run/activate) ·
[services/workflows/patch/types.ts](../../../../services/workflows/patch/types.ts) (`PatchOperation` union, lines 38-61) ·
[services/workflows/patch/applySafety.ts](../../../../services/workflows/patch/applySafety.ts) (`APPLY_ELIGIBLE_OPERATION_KINDS` includes `removeEdge`; `assessApplyReadiness`) ·
[services/workflows/patch/validateWorkflowPatch.ts](../../../../services/workflows/patch/validateWorkflowPatch.ts) (candidate **re-parsed** through `WorkflowDefinitionSchema`, line 190) ·
[services/diagnostics/workflowReadiness.ts](../../../../services/diagnostics/workflowReadiness.ts) (`def = draftOverride ?? workflow.draftDefinition`, ~line 230) ·
[services/ai/diagnostics/draftOverride.ts](../../../../services/ai/diagnostics/draftOverride.ts) (`parseDraftOverride` — STRICT `WorkflowDefinitionSchema.safeParse`) ·
[services/ai/diagnostics/diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts) (`SELF_LOOP_EDGE` finding + `overallReady` gate) ·
[features/workflow-builder/ai/attentionFindings.ts](../../../../features/workflow-builder/ai/attentionFindings.ts) (finding-code → card mapping) ·
[features/workflow-builder/state/graphSlice.ts](../../../../features/workflow-builder/state/graphSlice.ts) (`connectNodes` rejects self-loops + duplicate unlabeled edges, lines 601-633) ·
[repositories/workflows.ts](../../../../repositories/workflows.ts) (read path: `draftDefinition: (row.draft_definition ?? {}) as WorkflowDefinition`, line 104 — **bare cast, no re-parse on read**) ·
[lib/api/ai/diagnostics.ts](../../../../lib/api/ai/diagnostics.ts) (`previewWorkflowRepair(..., danglingEdgeRepair?, selfLoopEdgeRepair?)`, lines 398-425) ·
[features/workflow-builder/panels/useBuilderDiagnosisActions.ts](../../../../features/workflow-builder/panels/useBuilderDiagnosisActions.ts) + [_BuilderAiPanelDiagnosisMessages.ts](../../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosisMessages.ts) (the `runFreeRepairPreview` seam from `AI-REPAIR-HANDLER-CLEANUP-1` `03491bc3d`).

---

## 1. Context

This continues the deterministic, model-free repair arc that made workflow problems
**actionable from "Check workflow"**: variable-reference repair (AI-REPAIR-3A→3L, LIVE
in prod `589036fb0`), dangling-edge cleanup (AI-REPAIR-4A/4B, local `a5fb994d1`/`3a146901f`),
and self-loop edge cleanup (AI-REPAIR-COVERAGE-1, local `882519ba0`). A follow-up refactor
(`AI-REPAIR-HANDLER-CLEANUP-1`, `03491bc3d`) extracted a `runFreeRepairPreview` seam so the
**next** category is a thin handler, not a copy-paste.

This plan picks the **next** category. The task named **duplicate-edge cleanup** as the
candidate to investigate first, with an explicit warning that branch/edge labels may make
two edges with the same endpoints semantically distinct. Per the planning skill, this doc
implements nothing — it grounds the decision in the real graph model and recommends one
category for Marcus to approve.

Parent arc / precedents:
[ai-repair-3-apply-arc-closeout.md](./ai-repair-3-apply-arc-closeout.md) ·
[ai-repair-4-dangling-edge-closeout.md](./ai-repair-4-dangling-edge-closeout.md) ·
[ai-repair-coverage-1-self-loop-closeout.md](./ai-repair-coverage-1-self-loop-closeout.md).

## 2. Current codebase findings (verified)

### 2.1 The edge model — labels ARE semantically load-bearing
`WorkflowEdge = { id, from, to, label? }` (`contracts/workflowDefinition.ts:57-69`). The
engine's traversal is label-aware (`services/execution/branching.ts`,
`selectActivatedEdges`): an **unlabeled** edge always activates; a **labeled** edge activates
only when the source handler returns `branchTaken === label`. **So two edges with the same
`(from,to)` but different `label` are distinct branches** (e.g. a router/condition fanning
"yes"/"no" to the same downstream step). There is no separate `sourceHandle`/`targetHandle`/
`path`/`kind` field — **`label` is the only branch discriminator.**

### 2.2 The schema already forbids redundant edges — keyed on `(from, to, label ?? "")`
`WorkflowDefinitionSchema.superRefine` (`contracts/workflowDefinition.ts:125-140`) rejects a
second edge whose `${from}->${to}::${label ?? ""}` key was already seen. It also rejects
self-loops (`from===to`, line 104-110), edges to unknown nodes (line 111-123), duplicate
node ids, and >1 trigger. **The schema's dedup key IS the precise "safe duplicate"
definition** — same source, same target, same label (or both unlabeled). Same `(from,to)`
with **different** labels is explicitly allowed (verified by
`tests/unit/contracts/workflowDefinition.test.ts:248-279`: "allows two edges between the same
from/to under different labels", "…one labeled + one unlabeled…", "…router fan-out…").

### 2.3 How schema-invalid edges still reach Check (the key mechanism)
The diagnosis reads the SAVED definition with a **bare cast, no re-parse**:
`repositories/workflows.ts:104` → `draftDefinition: (row.draft_definition ?? {}) as
WorkflowDefinition`, consumed by `workflowReadiness.ts` as `def = draftOverride ??
workflow.draftDefinition`. The saved JSONB is **trusted on read** — `findGraphIssues` /
`findSelfLoopEdges` run on it, but `WorkflowDefinitionSchema.superRefine` does **not**. This
is exactly why self-loop and dangling-edge repairs exist and fire: those states are rejected
on strict write but can sit in stored data and Check is deliberately **stricter than runtime**
(the "Check stricter than runtime" precedent, AI-REPAIR-COVERAGE-1). A client-supplied
`draftDefinition` override is the opposite — `parseDraftOverride` STRICT-parses and a bad
override returns 400 (`services/ai/diagnostics/draftOverride.ts`).

### 2.4 Write paths cannot INTRODUCE a redundant duplicate
Every write strict-parses through the superRefined schema: PATCH save
(`UpdateWorkflowRequestSchema.draftDefinition = WorkflowDefinitionSchema`,
`contracts/workflow.ts:319`), AI-apply (`validateWorkflowPatch.ts:190` re-parses the
candidate, so an `addEdge` creating a duplicate is rejected), template instantiation, and
the builder (`graphSlice.connectNodes` rejects duplicate unlabeled edges). **A redundant
duplicate can only originate from legacy / un-revalidated stored JSONB** — the same narrow
provenance as a stored self-loop or dangling edge.

### 2.5 The repair pipeline a new category mirrors
- **Detect (Check-only):** a pure `core/workflows/*` finder → surfaced by
  `workflowReadiness.ts` → `diagnoseWorkflowForAgent.ts` emits a finding code + gates
  `overallReady` false. The shared runtime/activation validator (`findGraphIssues`) is left
  untouched (Check stricter than runtime).
- **Preview (free):** `deterministicRepairPreview.ts` builds a `removeEdge` patch via a
  `repairStrategies.ts` builder and runs it through the existing `previewRepairOps` →
  `validateWorkflowPatch` + `assessApplyReadiness`. **No LLM, no credit, no telemetry**;
  fail-closed (null) if anything else is invalid. The preview route branches on an explicit
  boolean flag **before** the credit gate / model.
- **Apply (draft-only):** the existing `/ai/repair/apply` route — `removeEdge` is
  apply-eligible (`applySafety.ts`), persists the draft, re-validates, never
  runs/activates/registers triggers or mutates creds.
- **UI:** an `attentionFindings.ts` card + a thin handler through the new
  `runFreeRepairPreview` seam.

`removeEdge` deletes **by edge `id`** (`applyPatchToDefinition.ts` `findIndex(e => e.id ===
op.edgeId)`), so removal is unambiguous even when two edges share endpoints.

## 3. Product / model decision

The unit of an "edge" is `(from, to, label)`, not `(from, to)`. Any repair that touches
edges MUST key on the full triple. The only deterministic, unambiguous, `removeEdge`-only
edge problem left after self-loop + dangling is a **truly-redundant duplicate**: edges that
collide on `(from, to, label ?? "")`. This is explicitly **NOT** "two edges between the same
two steps" (that is legitimate branch fan-out and must be preserved).

## 4. Recommended approach

**Recommended category: Narrow duplicate-edge cleanup — Apply-capable (`removeEdge`-only).**

**Exact safe definition.** Group edges by the key `${from}->${to}::${label ?? ""}`. A group
with **>1 member** is a redundancy. **Keep the first edge in source order; `removeEdge` every
later member of that group.** Never group on `(from, to)` alone — different labels are
different branches and are left untouched. Both-unlabeled and identical-label collisions are
the only things removed.

**Why it is behavior-safe.** In `selectActivatedEdges`, two edges that share `(from,to,label)`
both resolve to the same target under the same branch decision (`activated.push(edge.to)`
twice for the same `to`). Removing all-but-one leaves identical reachability and identical
branch matching — the redundant copy was at best a no-op and at worst a double-activation;
removal is a strict improvement or a true no-op. The post-removal candidate is exactly what
`WorkflowDefinitionSchema` would accept (it removes precisely the rows the schema's dedup
rejects), so `validateWorkflowPatch` passes.

**Shape (mirrors AI-REPAIR-COVERAGE-1 one-for-one):**
- `core/workflows/duplicateEdges.ts` → `findDuplicateEdges(edges)` returning the redundant
  edge ids (the to-remove set), keyed on the full triple, source-order-stable.
- `repairStrategies.ts` → `buildDuplicateEdgeRepairOutcome(graph)` → `removeEdge` ops for the
  to-remove set (null when none).
- `deterministicRepairPreview.ts` → `runDuplicateEdgeRepairPreview(...)` via `previewRepairOps`.
- preview route branch on `repairDuplicateEdges === true`, before the gate/model.
- `diagnoseWorkflowForAgent.ts` → `DUPLICATE_EDGE` finding (safe labels), gates `overallReady`.
- `attentionFindings.ts` `duplicateEdgeCards()` + a `handlePreviewDuplicateEdgeFix` handler
  built on `runFreeRepairPreview`; `previewWorkflowRepair(..., duplicateEdgeRepair?: boolean)`.

**Honesty caveat (stated for the implementation slice, not hidden):** like a stored self-loop,
a redundant duplicate can only come from legacy/un-revalidated JSONB (§2.4) — it cannot be
freshly created through any current strict write path. Real-world occurrence is therefore
**likely rare and unverified**; this is defense-in-depth + Check-stricter-than-runtime, the
same rationale Marcus already accepted for self-loop. If we want to avoid shipping a
near-dead category, the strong guidance-only alternative in §5 (unreachable node) covers a
state that demonstrably occurs.

## 5. Alternatives considered

| Category | Detected today? | Fix op | Apply-capable? | Verdict |
|---|---|---|---|---|
| **Narrow duplicate-edge** (key `from,to,label??""`) | No (new finder) | `removeEdge` | **Yes** | **Recommended** — only safe apply-capable edge case left; precise key preserves branches |
| Broad duplicate-edge (key `from,to`) | — | `removeEdge` | No | **Rejected** — destroys legitimate branch fan-out (§2.1/2.2) |
| Unreachable / orphan action | Yes (`unreachable_node`, no-button card) | none safe | **No → guidance-only** | **Strong runner-up** — demonstrably occurs; but the fix (add which edge? / delete node) needs user intent; `removeNode` is apply-BLOCKED, `addEdge` target is ambiguous |
| Multiple triggers | Yes (`multiple_triggers`) | `removeNode` | No | Guidance-only at best; `removeNode` apply-blocked + ambiguous which trigger |
| Stale static-option (clear-if-optional) | No | `updateNodeConfig` | technically yes | **Deferred** — config clearing has real product risk (drops a value the user chose); needs its own contract review |
| Invalid branch/router path | partial (runtime `INVALID_BRANCH` only) | — | No | Deferred — `branchTaken` is a runtime handler value; static detection is unreliable |

Why the recommendation over the runner-up: the arc's through-line is **deterministic,
unambiguous, `removeEdge`-only, validated-preview Apply**. Narrow duplicate-edge is the last
edge case that fits that mold exactly and directly answers the task's primary candidate.
Unreachable-node is valuable but is fundamentally **guidance-only** (no safe deterministic
patch), so it belongs to a separate "actionable guidance card" track, not this apply track.

## 6. Security / data model / no-leak

- **No schema/DB/RLS/migration/flag change.** Pure detection + `removeEdge` over the
  account-owned draft, through the existing apply-safety engine.
- **No-leak:** the finding and cards expose **safe step labels only** (resolved display
  names) — never raw node ids, edge ids, DB ids, the `label` string itself if it could carry
  user text (render the endpoint step names, not the branch label verbatim unless confirmed
  label values are non-sensitive), config values, provider errors, secrets, or tokens. Mirror
  the `selfLoopEdgeCards` no-leak tests.
- **No model-generated patch, no Hermes, no Q&A.** Deterministic builder only; route branch
  runs before the credit gate / model client.
- **Apply trust re-derived server-side:** re-authorize + re-validate against the fresh draft;
  `removeEdge`-only; draft-only persist; never run/activate/deactivate/register triggers,
  never touch credentials/integrations/provider accounts.

## 7. API / service / UI expectations (described, not built)

- Client: add `duplicateEdgeRepair?: boolean` (7th arg) to `previewWorkflowRepair`, setting
  `requestBody.repairDuplicateEdges = true` — symmetric with `repairDanglingEdges` /
  `repairSelfLoopEdges`.
- Route: a `repairDuplicateEdges === true` branch returning the validated preview, or
  `{ ok:false, code:"NO_SAFE_PATCH" }` when the finder yields nothing — before the gate/model.
- UI: a "Needs attention" duplicate-edge card with one "Preview fix" button via
  `runFreeRepairPreview`; Apply remains a separate click on the resulting validated preview.
  Count-aware copy (singular/plural) like dangling-edge 4B. No new control the backend can't honor.

## 8. Tests required (for the implementation slice)

- `findDuplicateEdges`: groups on the full triple; flags both-unlabeled and identical-label
  collisions; **does NOT flag same-`(from,to)`-different-`label`**; source-order-stable
  keep-first; empty when none.
- `buildDuplicateEdgeRepairOutcome`: `removeEdge`-only ops for the to-remove set; null when none.
- readiness: `DUPLICATE_EDGE` Check-only — present in diagnosis, **`findGraphIssues`/runtime
  unchanged** (Check stricter than runtime).
- `diagnoseWorkflowForAgent`: emits the finding, gates `overallReady` false, no-leak payload.
- card no-leak: no raw node/edge/DB ids (and no sensitive label text) in rendered copy.
- preview route: `repairDuplicateEdges` branch is free (no gate/model) and fail-closed.
- a branch-preservation regression: a router with "yes"/"no" edges to the same target is
  **never** flagged or altered.

## 9. Implementation slice breakdown (when approved)

- **CS-1** — `core/workflows/duplicateEdges.ts` finder + unit tests (incl. branch-preservation).
- **CS-2** — strategy + deterministic preview + route branch + client flag (free path).
- **CS-3** — `DUPLICATE_EDGE` finding + `overallReady` gate + readiness Check-only test.
- **CS-4** — `duplicateEdgeCards` + `handlePreviewDuplicateEdgeFix` (via `runFreeRepairPreview`)
  + card no-leak tests + count-aware copy.

No feature flag (consistent with the prior three deterministic categories — they are 0-credit,
draft-only, fail-closed). All local, no push.

## 10. Risks / open questions

1. **Does a redundant duplicate ever occur in real data?** Unverified; provenance is
   legacy/un-revalidated JSONB only (§2.4). *Recommendation:* proceed as defense-in-depth
   parity with self-loop, OR, if Marcus prefers shipping only demonstrably-occurring states,
   pick the unreachable-node **guidance-only** card instead.
2. **Is the `label` string safe to render?** It is user/router-authored. *Recommendation:*
   render endpoint **step labels**, not the raw branch label, unless we confirm labels are
   constrained, non-sensitive enum-like values.
3. **Keep-first vs keep-which?** Keep first in source order (deterministic, matches how the
   schema's dedup "first wins"). No user choice needed (all members are identical).

## 11. Acceptance criteria

- **This planning slice:** the doc exists at the path below, every "current state" claim is
  tied to a file read (§2 / Source-of-truth block), no source/tests/migrations/UI changed,
  nothing pushed.
- **The implementation must later:** preserve variable-reference / dangling-edge / self-loop
  behavior; keep deterministic preview/apply no-LLM/no-credit/no-telemetry; draft-only Apply;
  never flag/alter legitimate branch fan-out; no raw-id/secret leak; Check stricter than
  runtime (runtime validator untouched).

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, RLS, UI, feature flags, or runtime/execution behavior.
No model patch, no Hermes, no Q&A, no DB migration, no activation/trigger/credential mutation.
Docs-only. Nothing pushed.

## 13. Recommended next step

Get Marcus's pick between **(A) narrow duplicate-edge cleanup (apply-capable, recommended)**
and **(B) unreachable-node guidance card (guidance-only, demonstrably-occurring)**. On
approval of (A), start **CS-1** (`findDuplicateEdges` + branch-preservation tests).
