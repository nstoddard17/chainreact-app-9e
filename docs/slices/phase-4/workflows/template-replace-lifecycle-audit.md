# Template-replace lifecycle audit + disable-on-active decision

**Type:** Audit + decision record for the in-builder "Replace current workflow with a
template" action (CS-XT-IN-BUILDER). **Date:** 2026-06-08. **Status:** decision
implemented — replacing an **active** workflow now deactivates it as part of the replace.

> Scope note: this documents *why* replace-on-active deactivates. It does **not** introduce
> a new workflow state, feature flag, graph merge, or auto re-registration.

---

## 1. Current runtime findings (verified against code)

| Concern | Reality | Evidence |
|---|---|---|
| Trigger/webhook registration timing | **Only at activation** (and resume *from `eligible_to_resume`*). Reads trigger nodes from `draftDefinition`, upserts `trigger_resources` keyed by `(workflowId, provider, eventType, nodeId)`. | `services/triggers/lifecycle.ts:47-107`, `services/workflows/lifecycleOrchestrator.ts:110-173` |
| Save / replace side effects | **None.** `PATCH /workflows/[id]` and `replaceWorkflowWithTemplate` call `workflowsRepo.updateDraftDefinition` only — no orchestrator, no (un)register, no precondition re-check. | `app/api/workflows/[id]/route.ts:83-88` |
| Draft vs active runtime | **No active/published snapshot.** `active_revision_id` is unused (versioning deferred). Execution loads `workflow.draftDefinition` directly. | `services/execution/engine.ts:146` |
| Inbound webhook dispatch | Finds `trigger_resources` for `(provider, eventType)` → gates `state === "active"` → `enqueueRun({ triggerNodeId: resource.nodeId })` using the **stored** node id. | `services/triggers/dispatch.ts:82-163` |
| Run with stale node id | Engine looks up the stored `triggerNodeId` in the **current** `draftDefinition`; absent → fatal `TRIGGER_NODE_NOT_FOUND`. | `services/execution/engine.ts:147-160` |
| Re-validation on edit | **None.** An active workflow stays active with an invalid/placeholder draft; `__REDACTED__` / missing config passes schema (config is opaque) and fails only at run time. | replace = plain `updateDraftDefinition` |
| Unregister timing | Only on **disable / delete** (best-effort): reads `trigger_resources`, runs provider deactivation hooks, deletes rows. | `services/triggers/lifecycle.ts:110-153` |
| Re-register transitions | **activate** (from draft) and **resume from `eligible_to_resume`** only. `pause`→`resume` does **not** re-register. | `lifecycleOrchestrator.ts:119,154` |

### The bug (replacing an ACTIVE workflow, pre-fix)
Template node ids always differ from the old graph's, so after a replace:
1. The **new** trigger is unregistered → its events match no `trigger_resources` row → silently dropped (looks active, never fires).
2. The **old** `trigger_resources` row is stale but still dispatches (state is still `active`) → `enqueueRun` with the old node id → engine returns `TRIGGER_NODE_NOT_FOUND` → every run fails.
3. Provider-side subscriptions for the old trigger are never torn down (unregister only runs on disable/delete).

Net: an active workflow becomes **silently broken** and stays that way until a full
**disable → activate** cycle (the only path that re-registers off the new draft).

---

## 2. Why copy-only was unsafe
Because runtime executes `draftDefinition` **live** (no published snapshot), warning copy
alone cannot make the running behavior correct. A user heeding "reconnect and test" still
has stale `trigger_resources` dispatching failing runs, and `pause`→`resume` does **not**
re-register — so even a careful user can't recover without `disable → activate`. The state
on screen ("active") lies about what the workflow does.

---

## 3. Decision: deactivate on active-replace
When `replaceWorkflowWithTemplate` targets a workflow whose state is **`active`**, after
writing the new `draftDefinition` it calls the existing
`createLifecycleOrchestrator().disable({ reason: "manual_admin", context: "Definition
replaced from a template — reconnect and reactivate." })`. Disable:
- tears down the stale `trigger_resources` rows **and** runs provider deactivation hooks
  (cleans external subscriptions);
- flips the state to `disabled` so the dispatcher (`state === "active"` gate) drops any
  in-flight provider deliveries;
- leaves the **new** draft in place, so the user's reconnect → **reactivate** re-registers
  triggers off the new graph via the normal activation path.

Only `active` workflows are deactivated. `draft / paused / disabled / eligible_to_resume`
are left untouched — none is actively dispatching against the replaced graph (`paused`
retains registration but the dispatcher drops it; the others aren't active).

The route returns the updated (now `disabled`) `WorkflowDetail`; the modal calls
`router.refresh()` so the builder's server-rendered lifecycle state (header pill /
activate controls) reflects `disabled`.

### Rejected alternatives
- **Pause instead of disable** — insufficient: pause **retains** the stale registration and
  `resume` from paused does **not** re-register, so it stays broken. (Also explicitly out of
  scope per the product owner.)
- **Auto re-register on replace** — fragile: `registerWorkflowTriggers` *throws* when the
  new trigger's provider isn't connected or config is `__REDACTED__` (the normal post-
  template state), forcing a messy decision about the already-written definition.
- **Copy-only** — see §2; doesn't stop broken active runs.
- **New `needs_review` state** — avoided; reuses the existing `disabled` state + the
  `manual_admin` reason with a human `disabledContext`. No schema/enum change.

---

## 4. Preserved invariants (what did NOT change)
- Access/error behavior unchanged: missing/deleted workflow **and** non-member →
  `workflow_not_found`; inaccessible template → `template_not_found`; invalid graph →
  `invalid_template`. Deactivation only runs **after** all those gates pass.
- Account / id / name preserved; the **template row is never mutated**; no usage event.
- No id leak — `toWorkflowDetail` omits `accountId` / `createdByUserId`; `disabledReason`
  is not in the detail DTO.
- No new workflow state, no feature flag, no graph merge, no auto re-register, no billing.

---

## 5. Residual risk
- If `disable()` itself fails (e.g. a rare optimistic-concurrency conflict from a concurrent
  state change), the definition is already replaced but the state stays `active`. This is the
  pre-fix broken state and is not made worse; the error surfaces to the caller. A future
  hardening could wrap the replace+disable in a single transactional path, but that needs the
  lifecycle layer to expose a combined mutator and is out of scope here.
- Verification was static (dispatch → enqueue → engine trace + unit tests); not exercised
  end-to-end against a live provider subscription.
