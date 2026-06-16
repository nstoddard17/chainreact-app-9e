# V2-READY-40 — Trigger resource lifecycle cleanup audit

**Type:** Audit + threat note (security/no-leak skill). **Date:** 2026-06-15.
**Status:** Audit complete. **Result:** No code change. System is well-guarded against
every stale-trigger risk in scope **except one reachable composition**
(`active → pause → edit-trigger → resume`) that needs a product decision before any
fix — see §4 (FINDING-1) and §7.
**Baseline:** HEAD `4c113d5dc` (V2-READY-39), branch `v2-main`.

> Goal: verify workflow trigger resources are created, updated, disabled, and cleaned
> up correctly across workflow lifecycle changes — that disabled/deleted/trashed/modified
> workflows cannot leave stale trigger registrations that still fire.
>
> Companion to
> [active-edit-stale-trigger-audit.md](../workflows/active-edit-stale-trigger-audit.md)
> (active-edit teardown) and
> [template-replace-lifecycle-audit.md](../workflows/template-replace-lifecycle-audit.md).
> This audit verifies the END-TO-END lifecycle, not a single edit path.

---

## 0. Method / honesty note

Every claim below was verified by reading the source directly (not only agent summary):
`services/triggers/dispatch.ts`, `services/triggers/lifecycle.ts`,
`services/workflows/lifecycleOrchestrator.ts`, `services/workflows/saveDraftDefinition.ts`,
`core/workflows/triggerChange.ts`, `services/cron/runPollingTriggers.ts`,
`services/cron/runScheduledTriggers.ts`, `repositories/triggerResources.ts`,
`repositories/workflows.ts` (`getStateForDispatch` / `getDispatchInfo`),
`app/api/workflows/[id]/route.ts`, and the existing test suites for each.
The `trigger_resources` unique index was confirmed in the migration
(`supabase/migrations/20260507000000_trigger_resources_and_dedup.sql:43-44`).

---

## 1. Trigger resource model (storage map)

| Layer | Where | Key fields | Notes |
|---|---|---|---|
| **Trigger registration** | `trigger_resources` (`…20260507000000…`) | `workflow_id`, `user_id`, `provider`, `event_type`, `node_id`, `config jsonb`, `account_id` (provider scope), `expires_at` | **No status column** — row exists = registered; deleted = unregistered. UNIQUE `(workflow_id, node_id)`. RLS per-user; dispatcher/cron read via service-role. |
| **Polling cursor / snapshot** | `trigger_resources.config` (e.g. `snapshot.historyId`, `polling.lastPolledAt`, `pollingEnabled`) | — | Advanced in place by polling cron `updateConfig`. |
| **Schedule next-fire** | `trigger_resources.config.nextFireAt` + `cronExpression` (provider `native`, event `schedule.fired`) | — | Advanced in place by scheduled cron via `upsert`. |
| **Provider subscription / watch** | `trigger_resources.config` (`type: "subscription-watch"`, `webhookId`, `expiresAt`, …) + `expires_at` column | — | Renewal cron reads `listByConfigContains`. |
| **Webhook dedupe** | `webhook_event_dedup` (same migration) | UNIQUE `(provider, event_id)`, `expires_at` (7d) | First-write-wins; service-role only; **not** tied to a workflow → survives independent of resource lifecycle. |
| **HubSpot shared subs** | `hubspot_app_subscriptions` + `hubspot_subscription_refs` | ref-counted; CASCADE on workflow | Last ref removed → app subscription DELETEd. |

Core modules: `services/triggers/lifecycle.ts` (register/unregister), `…/dispatch.ts`
(webhook fan-out), `…/activationRegistry.ts` / `deactivationRegistry.ts` /
`pollingRegistry.ts`, `services/workflows/lifecycleOrchestrator.ts` (sole `workflows.state`
mutator), `services/cron/run{Polling,Scheduled}Triggers.ts`.

---

## 2. Lifecycle map (verified)

| Event | State change | Effect on trigger resources | Path |
|---|---|---|---|
| **Activate** | draft → active | **CREATE** — `registerWorkflowTriggers` upserts one row/activatable node, runs native/provider activation hooks (snapshot/nextFireAt). Register runs BEFORE persist; persist failure rolls back via `safeUnregister`. | `lifecycleOrchestrator.activate` → `lifecycle.ts:66` |
| **Pause** | active → paused | **RETAINED** (intentional). Dispatcher drops events while paused. | `lifecycleOrchestrator.pause` |
| **Resume (from paused)** | paused → active | **NONE** — no re-register (registration retained from before pause). | `lifecycleOrchestrator.resume:154` |
| **Resume (from eligible_to_resume)** | eligible → active | **RE-CREATE** off current draft. | `lifecycleOrchestrator.resume:156` |
| **Trigger changed while ACTIVE** | active → disabled | **TEARDOWN** — `saveDraftDefinition` detects activatable-trigger change → `disable()` → deactivation hooks + `deleteByWorkflow`. User recovers via Reactivate → Resume. | `saveDraftDefinition.ts:80` |
| **Template replacement** | (same as active edit) | **TEARDOWN** — routes through `saveDraftDefinition`. | `saveDraftDefinition.ts` |
| **Manual disable / integration disconnect (last active)** | →disabled | **TEARDOWN** | `lifecycleOrchestrator.disable` ; `integrations/disconnect` |
| **Move to trash** | any → deleted | **TEARDOWN** — `delete()` → `safeUnregister` (deactivation hooks + delete rows). | `lifecycleOrchestrator.delete:223` |
| **Restore from trash** | deleted → draft | **NONE** — restored inactive; user must re-activate (locked decision). No auto-fire. | `lifecycleOrchestrator.restore:234` |
| **Permanent purge (7d cron)** | deleted → hard-deleted | **DB CASCADE** on `workflow_id` (rows already removed at trash time). | `trashPurge.ts` |
| **Account frozen / pending deletion** | — | New activation BLOCKED (`assertAccountOperational`); existing firing dropped per-event (see §3). | `accountFreeze.ts` |
| **Provider reconnect** | disabled → eligible_to_resume (async) | **NONE** at reconnect; re-register deferred to explicit Resume. | health cascade |

---

## 3. Firing guards (verified) — can a stale resource fire?

Every firing path resolves the **live** `workflows.state` and drops anything
`!== "active"`; trashed = `state:"deleted"`, hard-purged = `null` (and `listForDispatch`
uses an INNER join on `workflows`, so a vanished workflow row yields no candidates).

| Risk | Guarded? | Evidence |
|---|---|---|
| Old node id fires after node removed (active edit) | ✅ | `saveDraftDefinition` deactivates → rows deleted; dispatch state-gate backstops in-flight window. `dispatch.ts:99` |
| Old provider subscription dispatches after disable | ✅ | rows deleted on disable; dispatch `listForDispatch`+state gate; deactivation hook cancels sub (best-effort). |
| Polling cursor advances for inactive workflow | ✅ | state gate in **pre-filter** before `runOne` → `poll` (cursor untouched). `runPollingTriggers.ts:95-101` |
| Polling cursor advances for frozen account | ✅ | freeze gate before handler runs → cursor untouched, resumes cleanly on un-freeze. `runPollingTriggers.ts:108-111` |
| Schedule `nextFireAt` advances for inactive workflow | ✅ | state gate before `eligible.push`; cursor advance only in `fireOne`. `runScheduledTriggers.ts:87-91` |
| Schedule `nextFireAt` advances for frozen account | ⚠️ intentional | `fireOne` advances `nextFireAt` AFTER `dispatchTriggerEvent` (which drops on freeze). Consistent with NPD-N13 no-catch-up + V2-READY-34 "no replay on un-freeze". Not a bug. |
| Duplicate `trigger_resources` on repeated activation | ✅ | UNIQUE `(workflow_id, node_id)` + `upsert onConflict`. |
| Webhook dedup bypass → stale exec | ✅ | dedup fail-open, but state gate fail-closed; Q4 session-side-effects backstop. |
| Deleted/trashed workflow receives provider webhook | ✅ | `state:"deleted"` → dropped; rows already deleted at trash → no match. |
| Webhook delivered after provider-side unsubscribe failed | ✅ | row deleted regardless of hook failure → `listForDispatch` no match → silent drop. Orphaned provider sub wastes provider resources only; cannot fire our workflow; expires via renewal absence. |

These behaviors are already covered by existing tests (no new tests added — see §6).

---

## 4. Stale-resource risk FOUND

### FINDING-1 (Medium) — `active → pause → edit trigger → resume` leaves a stale registration that fires after resume

**Reachable path.** `PATCH /api/workflows/[id]` permits editing `draftDefinition` of any
non-`deleted` workflow, including `paused` (`route.ts` `loadOrNotFound` only blocks
`deleted`). `saveDraftDefinition` only deactivates when **`previousState === "active"`**
(`saveDraftDefinition.ts:80`) — for `paused` it writes the new draft and tears nothing down
(explicitly tested: `saveDraftDefinition.test.ts:120-127`). `lifecycleOrchestrator.resume`
**only re-registers from `eligible_to_resume`**, not from `paused`
(`lifecycleOrchestrator.ts:154-157`).

**Consequence.** After `active → pause → (edit trigger config or swap trigger node) →
resume`, the workflow is `active` again but `trigger_resources` is **frozen at the
pre-pause activation**:
- Trigger **config** edit (same node id): the dispatcher's per-trigger filter reads the
  **old** `resource.config` (`dispatch.ts:139`) → fires on stale criteria; new
  subscription inputs never registered provider-side. **Silent wrong behavior.**
- Trigger **node id / provider / type** change: dispatcher enqueues the **old** `nodeId`
  (`dispatch.ts:185`) → execution hits `TRIGGER_NODE_NOT_FOUND`; the new trigger is never
  registered. **Broken trigger.**

This is the **same stale-trigger class** that the active-edit audit closed, but the
`paused` branch slips through. The existing audit consciously decided "paused/disabled/
draft/eligible_to_resume are never deactivated" (rationale: *not actively dispatching*) —
correct **while paused**, but it does not account for **resume-from-paused not
re-registering**. No existing test composes the full pause→edit→resume sequence.

**Why this is STOP-and-report (not fixed here).** Any fix changes user-visible
lifecycle/deactivation behavior and needs a product decision:
- **Option A** — extend `saveDraftDefinition` to also deactivate on
  `paused` + activatable-trigger-change (paused → disabled visibly; contradicts the
  currently-tested behavior at `saveDraftDefinition.test.ts:120-127`).
- **Option B** — make `resume` re-register when the draft's activatable trigger drifted
  from the registered `trigger_resources` since pause (changes resume semantics; needs a
  draft-vs-registration diff).
- **Option C** — the deferred publish/active-revision model (active-edit audit §6
  "long-term"), which removes the entire stale-trigger class and is the durable answer.

**Recommendation:** Option B is the most surgical and preserves the "pause keeps it live"
UX; Option C is the durable fix. Either is its own slice. Decision needed before
implementing or writing an assertion test (a test now would bless one behavior
prematurely).

### Secondary observation (out of strict scope) — multi-account same-provider disconnect

`disableProviderDependentWorkflows` only cascades when the disconnected integration is the
**last active** row for that provider (`services/integrations/disconnect.ts`). With two
integrations of the same provider (e.g. two Slack workspaces), disconnecting the one a
trigger actually depends on leaves the workflow `active` with its registration intact. This
is a credential-resolution / account-model concern (Team Credential Policy arc), not a
stale **trigger-registration** bug, and the "last active" heuristic is intentional. Noted
for the account-model track, not actioned here.

---

## 5. No-leak / observability review

- Frozen-account dispatch drop logs **no** account id / provider payload
  (`dispatch.ts:125-133`; asserted at `dispatch.test.ts:245-259`).
- Trigger deactivation failures log provider/eventType/nodeId + error message only — **no
  tokens / provider payloads / emails** (`lifecycle.ts:159-168`).
- `TRIGGER_REGISTRATION_FAILED` surfaces a generic message; account ids are not leaked to
  the client (`toWorkflowDetail` omits `accountId` / `createdByUserId`).
- Scheduled-cron warns (`malformed_config`, `no_future_fire`) carry workflowId/nodeId only.

No leak found in the trigger lifecycle paths.

---

## 6. Tests / checks

- **No new tests added.** Existing coverage already proves every cleanup behavior in §2–§3:
  `dispatch.test.ts` (state drop incl. `deleted`/`null`, frozen drop + no-leak, per-row
  filter), `runPollingTriggers.test.ts` (inactive skip, frozen skip → cursor untouched),
  `runScheduledTriggers.test.ts` (inactive skip, no cursor advance on null next-fire),
  `lifecycle.test.ts` (register/unregister, deactivation-before-delete, error-swallow +
  still-delete), `saveDraftDefinition.test.ts` (active trigger-change → disable; paused →
  no disable), `triggerResources.test.ts` (upsert idempotency),
  `trashService`/`trashPurge`/`disconnect` suites.
- FINDING-1 is **not** covered by any existing test (the composition is untested) and is
  intentionally left without a new assertion pending the product decision.
- No source, schema, migration, or behavior changed by this audit.

## 7. What did NOT change / invariants preserved

- No `workflows.state` machine change, no new lifecycle state, no feature flag flip.
- No webhook response semantics change.
- No AI / MCP / billing behavior touched.
- No DB migration / `db:push`.
- The active-edit deactivation contract and "restore never auto-activates" decision are
  unchanged.

## 8. Recommended next track

1. **Product decision on FINDING-1** (Option A / B / C above), then a small slice to
   implement + a composition test (`active → pause → edit → resume` must not fire the stale
   registration).
2. (Lower priority) revisit multi-account same-provider disconnect under the account-model
   track.
