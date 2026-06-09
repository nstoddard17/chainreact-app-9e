# Active-edit stale-trigger audit + disable-on-trigger-change decision

**Type:** Audit + decision record. **Date:** 2026-06-08. **Status:** implemented — a save
that changes the trigger of an **active** workflow now deactivates it.

> Companion to [template-replace-lifecycle-audit.md](./template-replace-lifecycle-audit.md):
> that doc covered template replace; this covers the SAME stale-trigger class for **normal
> manual edits + save**. No new state, no feature flag, no publish/active-revision here.

---

## 1. Verified runtime findings

| Concern | Reality | Evidence |
|---|---|---|
| Builder save | `graphSlice.save()` → `updateWorkflow(id, { draftDefinition })` → `PATCH /api/workflows/[id]` → `workflowsRepo.updateDraftDefinition`. **No (un)register, no precondition re-check.** | `app/api/workflows/[id]/route.ts`, `graphSlice.ts:571` |
| Runtime reads draft live | Execution loads `workflow.draftDefinition`; missing `triggerNodeId` → fatal `TRIGGER_NODE_NOT_FOUND`. | `services/execution/engine.ts:146-160` |
| Registration | At **activation** only, keyed `(workflowId, provider, eventType, nodeId, config)`; unregister only on disable/delete. | `services/triggers/lifecycle.ts:50,96,110-153` |
| Dispatch | Looks up `trigger_resources` by `(provider,eventType)`, gates `state==='active'`, enqueues the **stored nodeId**, and the per-trigger filter reads **`resource.config`** (frozen at activation). | `services/triggers/dispatch.ts:82,98,115,159` |
| Builder edit semantics | `updateNodeConfig` keeps the node id, mutates config in place; there is no change-trigger-in-place — changing provider/type = remove + `addTrigger` (new id); rename/position keep the id. | `graphSlice.ts:327,410,438,453` |
| Snapshot / warn | `active_revision_id` unused (deferred); no warn-on-active-edit, no pause-before-edit. | — |

## 2. Safe vs unsafe edits (while ACTIVE)

| Edit | Result | Verdict |
|---|---|---|
| Action add/remove/config, **rename**, layout/position, edges | `trigger_resources` unchanged; new actions execute live | ✅ Safe (keep live) |
| Trigger **config / resource / filter** (same node id) | `trigger_resources.config` frozen at activation → dispatch filter fires on OLD criteria | ⚠️ Unsafe (silent drift) |
| Trigger **provider / type** change, or delete + re-add (new node id) | Old row dispatches old node id → `TRIGGER_NODE_NOT_FOUND`; new trigger unregistered → never fires; old provider sub not torn down | ❌ Unsafe (crash + dead trigger) |

## 3. Why active trigger edits require deactivation
Same root cause as template replace: registrations are frozen at activation and keyed by node
id/config, while the runtime reads the draft live. A trigger edit desynchronizes the two with
no self-healing path on save. Deactivating routes recovery through the existing
**Reactivate → Resume** flow, where `resume` re-runs activation preconditions and
**re-registers triggers off the current draft** — the only path that re-syncs cleanly.

## 4. Decision (implemented)
There is ONE authoritative save path —
[services/workflows/saveDraftDefinition.ts](../../../services/workflows/saveDraftDefinition.ts)
`saveDraftDefinition({ previousState, previousDefinition, nextDefinition, write })` — used by
**both** the manual `PATCH /api/workflows/[id]` save **and** AI-apply
([services/ai/apply/applyWorkflowPatch.ts](../../../services/ai/apply/applyWorkflowPatch.ts)).
It:
1. Runs the caller's `write` strategy (PATCH → `updateDraftDefinition`; AI-apply →
   `updateDraftDefinitionIfRevisionMatches`). A `null` result (AI-apply's optimistic guard
   didn't match) means the write did NOT land → nothing is deactivated.
2. If the workflow **was `active`** AND `activatableTriggerChanged(prev, next)` is true,
   deactivates via `createLifecycleOrchestrator().disable({ reason: "manual_admin", context:
   "Trigger changed — reconnect and reactivate." })`. Teardown of stale `trigger_resources` +
   provider subscriptions runs inside disable.
3. Non-trigger edits (action/label/layout/edge) and **manual-trigger** edits leave the
   workflow active and update live.
4. `draft / paused / disabled / eligible_to_resume` are never deactivated.

`triggerChanged` ([core/workflows/triggerChange.ts](../../../core/workflows/triggerChange.ts))
is pure + order-independent: it compares trigger nodes by `(id, provider, type, stable(config))`,
ignoring position + displayName, and takes an `isActivatable` predicate.
`activatableTriggerChanged` (in the save service) supplies that predicate via
`getTriggerMeta(...).activation !== "manual"` (see §4a). The route returns the (now disabled)
`WorkflowDetail`; the builder's save handler calls `router.refresh()` when the returned state
differs from the header's lifecycle state, surfacing the existing **disabled banner** +
**Reactivate** action.

## 4a. Manual triggers are NOT activatable (correction)
A trigger's `TriggerMeta.activation` ∈ {`webhook`, `polling`, `manual`, `scheduled`}. Only the
native **`manual.run`** trigger is `activation: "manual"`: it is `requiresIntegration: false`,
has empty config, registers **no** `trigger_resources` row that dispatch uses, and is fired
**only** by `POST /api/workflows/[id]/run-now` (allowed in `active | paused | draft`, bypassing
`dispatchTriggerEvent`). So a manual-run workflow does not need activation to run, and changing
its manual trigger leaves **no** stale registration. Therefore `activatableTriggerChanged`
**excludes manual triggers** — editing/adding/removing a `manual.run` trigger on an active
workflow does NOT deactivate it. (Unknown meta → treated as activatable, fail-safe.)

Cross-category cases (active workflow), all handled by the activatable symmetric-difference:
- **external → manual.run:** the old external trigger is removed from the activatable set →
  deactivate, tearing down the orphaned external registration. The workflow lands `disabled`;
  the user recovers via Reactivate → Resume (Resume re-registers off the new draft = an inert
  manual row, preconditions pass because manual `requiresIntegration: false`, → `active`, and
  run-now works). **Caveat (§6):** this makes a now-manual workflow briefly require a
  reactivate; landing it directly in a runnable state needs an `active → draft` transition the
  state machine doesn't have today — deferred (no new state/transition added here).
- **manual.run → external:** a new external trigger appears in the activatable set →
  deactivate, so the new trigger is NOT silently left unregistered — the user must Resume,
  which registers it (and runs preconditions). Matches "require activation; don't silently
  activate."
- **manual.run → manual.run:** activatable set unchanged → stays active (live edit).

### Why auto-refresh of `trigger_resources.config` was rejected (for now)
A same-node trigger-config edit *could* be handled by just rewriting `trigger_resources.config`
instead of disabling. Rejected because trigger config is not uniformly a DB-only dispatch
filter — for some providers it encodes **subscription inputs** (resource ids, webhook
parameters). Safely refreshing those becomes **provider-specific lifecycle logic** (re-subscribe
vs. rewrite-row), exactly the per-provider branching we want to avoid. The uniform rule
"active + trigger changed → deactivate, let Resume re-register" is simpler and correct for all
providers.

## 5. Preserved invariants (what did NOT change)
- Save authz/error contract unchanged: invalid definition → 400 (before any write/disable);
  non-member/missing/deleted → `WORKFLOW_NOT_FOUND` 404; deactivation only after those gates.
- No id leak — `toWorkflowDetail` omits `accountId` / `createdByUserId`.
- No new workflow state, no feature flag, no auto re-register, no publish/active-revision.
- Disable reuses the existing orchestrator (no inline teardown).

## 6. Residual risk / follow-ups
- **AI-apply now covered.** ✅ Both the manual PATCH save and `applyWorkflowPatch` route their
  draft write through `saveDraftDefinition`, so an AI-applied activatable-trigger change on an
  active workflow deactivates identically (and a write-time STALE_PATCH never deactivates).
- **external → manual.run lands `disabled`, not directly runnable.** A now-manual workflow is
  runnable via run-now in `active | paused | draft` but NOT `disabled`, so after the cleanup
  deactivation the user must Reactivate → Resume to run it. Avoiding that "reactivate a manual
  workflow" step would require an `active → draft` (or equivalent) teardown transition the
  state machine doesn't have. Deferred as a deliberate policy decision (no new state added).
- If `disable()` throws (rare optimistic-concurrency conflict), the draft is already written but
  state stays active — pre-fix broken state, not made worse; the error surfaces to the caller.
- **Registration hygiene (minor):** activating a manual-only workflow upserts an inert
  `trigger_resources` row for the `manual.run` node (no activation hook, never dispatched).
  Harmless; a future cleanup could skip the upsert for `activation: "manual"` triggers.
- **Long-term:** adopt the deferred **publish / active-revision** model — execution + dispatch
  read an immutable active revision promoted on activate/publish, while `draftDefinition` is
  freely editable and never affects the running workflow until publish (which atomically
  re-registers). That removes the entire stale-trigger class and the need for edit-time
  deactivation. Bigger slice; the durable answer.
