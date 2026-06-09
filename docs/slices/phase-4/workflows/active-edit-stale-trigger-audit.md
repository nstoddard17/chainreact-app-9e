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
On `PATCH /api/workflows/[id]`, when `draftDefinition` is supplied:
1. Write the new draft (`updateDraftDefinition`).
2. If the workflow **was `active`** AND `triggerChanged(prev, next)` is true, deactivate via
   the existing `createLifecycleOrchestrator().disable({ reason: "manual_admin", context:
   "Trigger changed — reconnect and reactivate." })`. Teardown of stale `trigger_resources` +
   provider subscriptions runs inside disable.
3. Non-trigger edits (action/label/layout/edge) leave the workflow active and update live.
4. `draft / paused / disabled / eligible_to_resume` are never deactivated (not actively
   dispatching against the new graph).

`triggerChanged` ([core/workflows/triggerChange.ts](../../../core/workflows/triggerChange.ts))
is pure + order-independent: it compares the set of trigger nodes by
`(id, provider, type, stable(config))`, ignoring position + displayName. The route returns the
(now disabled) `WorkflowDetail`; the builder's save handler calls `router.refresh()` when the
returned state differs from the header's lifecycle state, surfacing the existing
**disabled banner** + **Reactivate** action.

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
- **AI-apply path not covered.** `services/ai/apply/applyWorkflowPatch.ts` writes the draft via
  `updateDraftDefinitionIfRevisionMatches` (a separate revision-guarded repo call that bypasses
  the PATCH route). A trigger change applied through the AI agent on an active workflow carries
  the **same stale-trigger risk** and is NOT deactivated by this slice. Recommended follow-up:
  route AI-apply's draft write through a shared "save draft + deactivate-on-trigger-change"
  service so both entry paths share the rule.
- If `disable()` throws (rare optimistic-concurrency conflict), the draft is already written but
  state stays active — pre-fix broken state, not made worse; the error surfaces to the caller.
- **Long-term:** adopt the deferred **publish / active-revision** model — execution + dispatch
  read an immutable active revision promoted on activate/publish, while `draftDefinition` is
  freely editable and never affects the running workflow until publish (which atomically
  re-registers). That removes the entire stale-trigger class and the need for edit-time
  deactivation. Bigger slice; the durable answer.
