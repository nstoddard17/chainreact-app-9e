# V2-READY-51 — `workflow_runs` Payload Lockdown

**Type:** Security hardening (migration + read-path move to service-role + DTO tightening).
**Date:** 2026-06-16
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Closes:** the last (HIGH) gap #2 from the [V2-READY-49 grant audit](./v2-ready-49-sensitive-table-grant-audit.md) — the final major V2-READY-49 follow-up.
**Mirrors:** integrations (47B/47D) + trigger_resources (50) + workflow_files (52).
**Product decision (Marcus):** **Option C** — run detail exposes per-step OUTPUT only to the run's **own author** viewing their **test** run; real runs + co-members get status-only steps.

---

## What changed

`public.workflow_runs` had an `authenticated` SELECT grant + account-member RLS, so a member could
`supabase.from('workflow_runs').select('trigger_event, steps, fatal_error')` **directly via
PostgREST** and read raw trigger payloads, per-step output blobs, and raw fatal errors for **every
run in their account(s)** — including team-workflow runs they didn't create — bypassing every
sanitized DTO. Those columns can carry resolved secrets / PII / provider payloads.

Unlike `trigger_resources`/`workflow_files`, the `workflow_runs` SELECT grant was **in active use**:
three UI readers read through the SSR-cookie (RLS) client. So this slice **revokes the grant AND
moves all three readers to service-role behind explicit authorization**, then tightens the run-detail
DTO per the Option C product decision.

### 1. Migration `20260701000000_revoke_authenticated_workflow_runs_select.sql`
```sql
REVOKE SELECT ON public.workflow_runs FROM authenticated;
```
`service_role` unchanged (sole reader/writer; no authenticated WRITE grant ever existed — the engine
writes via service_role). `anon` unchanged (never granted). No RLS policy altered. No engine /
billing / notification / retention behavior touched. **Applied to the V2 dev DB only
(`qcepijemjlkssfkvzlio`) — not pushed, not in prod. A production deploy must apply it.**

### 2. Read paths moved to service-role + explicit authorization
`repositories/workflowRuns.ts` — `getById`, `listByWorkflow`, `listByAccountForDisplay` now use
`getServiceRoleClient` (the SSR-cookie reads would `42501` after the revoke). They are **NON-authorizing**
(they bypass RLS); every route gates first:

| Read path | New authorization |
|---|---|
| `GET /api/workflows/[id]/runs/[runId]` (detail) | fetch run (service-role) → cross-validate `record.workflowId === id` → `requireWorkflowAccountMember(caller, record.accountId)`. Missing run / id-mismatch / non-member all → **404** (no existence leak). |
| `GET /api/workflows/[id]/runs` (list) | `loadWorkflowForMember(id, caller)` → missing / soft-deleted / non-member all → **404** before any run read. |
| `GET /api/runs` + `/runs` page | account is the **caller's own**, resolved server-side (`ensurePersonalAccount` / `resolveActiveAccount`, which already reject a non-member account); the `eq('account_id', …)` predicate scopes the read. No client-supplied id. |

### 3. Run-detail DTO tightened (Option C) — `contracts/workflow.ts` + `toWorkflowRunDetail`
`WorkflowRunDetailSchema` now extends the summary with **`steps[]` only**. It **drops raw
`triggerEvent` and raw `fatalError`**; the humanized `errorClassification` (from the summary) is the
user-facing failure surface. Each step always carries `nodeId` + `status` + a **sanitized** `error`
(V2-READY-2 humanizer). Per-step **`output`** is included **only when** `record.isTest === true` **and**
`record.triggeredByUserId === callerUserId` — i.e. the run's own author viewing their test run (when
shown, it's still SEC-7 sensitive-field-redacted). A real (non-test) run, or any other member
(incl. owner/admin), receives status-only steps; raw outputs stay server-internal.

`RunResultsPanel` lost its raw `FatalErrorBlock` (the humanized `ClassifiedErrorBlock` already covers
failures). `revision_id` remains internal — never mapped onto any record (unchanged; pinned by an
existing `workflowRuns.test.ts` test).

## Exact grants after migration
`authenticated` → **none** · `service_role` → SELECT, INSERT, UPDATE, DELETE · `anon` → none.

## Fields exposed vs redacted (run detail)
- **Exposed:** run id, workflow id, status, `triggerNodeId`, started/finished, `errorClassification`
  (humanized), per-step `nodeId`/`status`/sanitized `error`. Per-step `output` **only** for the
  author's own test run (SEC-7-redacted).
- **Redacted / omitted:** raw `triggerEvent`, raw `fatalError`, per-step `output` for real runs /
  co-members, `revision_id` (never mapped), all billing columns.

## Visibility / product behavior — preserved
Runs page + run-history list (`RunListItem` / `WorkflowRunSummary`) were already payload-free —
unchanged. Builder run-list still loads. Builder test-run output preview still works **for the
author's own test run** (the variable-picker "latest value" preview reads the same author-test
output). Real-run / co-member detail now shows status + humanized error only (intended). Active-revision
`revision_id` still persists internally; workflow stats unchanged (separate `workflow_run_stats`
view path, untouched). Diagnostics unchanged (already service-role + gate + membership + sanitized DTO).

## Tests / verification
- **Gated RLS DB proof** ([`workflow-runs-account-rls.test.ts`](../../../tests/integration/security/workflow-runs-account-rls.test.ts)):
  member + non-member direct SELECT → `42501`; service-role read intact — **7/7 PASS vs dev DB after db:push.**
- **Route authz + sanitization** ([`run-routes-authz.test.ts`](../../../tests/unit/app/api/workflows/run-routes-authz.test.ts), new):
  non-member → 404 (no leak); missing run / id-mismatch → 404; author-test → output present + no
  triggerEvent/fatalError; co-member / real run → output omitted (10/10).
- **DTO gating** ([`_shared.test.ts`](../../../tests/unit/app/api/workflows/_shared.test.ts)): Option C
  output gate + payload omission + SEC-7 redaction (now in the author-test context) — 60/60.
- **Regression guard** ([`no-authenticated-integration-grants.test.ts`](../../../tests/structure/no-authenticated-integration-grants.test.ts)):
  the service-role-only SET now covers `integrations` + `trigger_resources` + `workflow_files` +
  `workflow_runs`; a future re-GRANT of any fails loudly (9/9).
- `typecheck` 0 · `lint` 0 errors (pre-existing `_shared.ts` max-lines warning, file already > 400) ·
  `lint:migrations` OK. All affected unit/integration suites green (repo readers, runs route, typed
  client, RunResultsPanel, latestRunValues, runSlice, useUpstreamVariables, latest-run-preview,
  variable-picker, diagnostics run-failure).

## What did NOT change
No RLS policy, no engine / billing / notification / retention behavior, no AI/MCP behavior, no new
provider. `service_role` + `anon` grants unchanged. Diagnostics path untouched. `revision_id` stays
internal. CONN-SHARE untouched. Nothing pushed / deployed.

## Grant-audit arc status (from V2-READY-49) — **COMPLETE**
- ✅ **50** — `trigger_resources` service-role-only.
- ✅ **52** — `workflow_files` service-role-only.
- ✅ **51** — `workflow_runs` payload lockdown (this). **Final major V2-READY-49 follow-up closed.**
