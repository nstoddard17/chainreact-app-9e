# V2-READY-50 — `trigger_resources` Service-Role-Only

**Type:** Security hardening (migration + read/write-path move). **No product behavior change.**
**Date:** 2026-06-16
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Closes:** the HIGH-severity gap #1 from the [V2-READY-49 grant audit](./v2-ready-49-sensitive-table-grant-audit.md).
**Mirrors:** the integrations arc (47B/47D/47E).

---

## What changed

`public.trigger_resources` had a broad `authenticated` SELECT/INSERT/UPDATE/DELETE grant +
account-member RLS, so a regular member could `supabase.from('trigger_resources').insert/update/
delete/select` **directly via PostgREST**, bypassing the server-side trigger lifecycle
(integration-health preconditions, snapshot init, provider webhook (un)registration, the
account-freeze gate) and reading provider account ids + external resource ids across the account.
The INSERT/UPDATE/DELETE RLS policies also lacked the `accounts.deletion_status` gate SELECT had.

1. **Migration `20260629000000_revoke_authenticated_trigger_resources.sql`:**
   ```sql
   REVOKE SELECT, INSERT, UPDATE, DELETE ON public.trigger_resources FROM authenticated;
   ```
   `service_role` unchanged (sole reader/writer); `anon` unchanged (never granted); no RLS policy
   altered; no lifecycle rule re-encoded in SQL.

2. **Read/write-path move — `repositories/triggerResources.ts`:** the three functions that used the
   authenticated SSR client now use `getServiceRoleClient` — `upsert`, `deleteByWorkflow`,
   `listByWorkflow` (the dispatch/polling/renewal/webhook-receive functions were already
   service-role). The unused `createClient` import was removed.

3. **Authorization preserved upstream (no SQL duplication, no new gate added):** trigger resources
   are written **only** by the trigger lifecycle (`services/triggers/lifecycle.ts`) and the
   scheduled/polling crons. Membership + freeze are already enforced before the lifecycle reaches the
   repo:
   - workflow-transition routes gate **membership** — `app/api/workflows/[id]/{activate,pause,
     resume,disable,reactivate,restore,…}/route.ts` call `requireWorkflowAccountMember`;
   - `LifecycleOrchestrator` gates **freeze** — `assertAccountOperational(wf.accountId)` runs before
     `tryRegisterTrigger`;
   - the crons run service-level (no user session) and operate on rows they resolve themselves.

   So moving the repo to service-role removes the direct-PostgREST bypass without changing any
   lifecycle behavior (activate registers, deactivate/disable/delete unregisters, pause/resume drift
   logic, template-replace/trigger-edit, trash/restore, and dispatch/polling/scheduled/webhook
   lookups are all untouched — they already went through this repo). Bonus: the scheduled-trigger
   cron's `upsert` (a no-session context) is now correct via service-role instead of relying on the
   authenticated client.

## Exact grants after migration

`authenticated` → **none** · `service_role` → SELECT, INSERT, UPDATE, DELETE · `anon` → none.

> **Deploy note:** applied to the **V2 dev DB only** (`qcepijemjlkssfkvzlio`) — not pushed, not in
> prod. A production deploy must apply `20260629000000`.

## Tests / verification

- **Gated RLS DB proof** ([`tests/integration/security/workflow-runs-account-rls.test.ts`](../../../tests/integration/security/workflow-runs-account-rls.test.ts)):
  member + non-member direct SELECT → `42501`; member direct INSERT/UPDATE/DELETE → `42501` (row
  survives, unchanged); service-role read intact.
- **Repo unit test** ([`tests/unit/repositories/triggerResources.test.ts`](../../../tests/unit/repositories/triggerResources.test.ts)):
  `upsert`/`deleteByWorkflow`/`listByWorkflow` now exercise the service-role client.
- **Regression guard** ([`tests/structure/no-authenticated-integration-grants.test.ts`](../../../tests/structure/no-authenticated-integration-grants.test.ts)):
  generalized from V2-READY-47E to a service-role-only table SET — now asserts net-zero authenticated
  grants on **both** `integrations` and `trigger_resources`; a future re-GRANT of either fails loudly.
- `migration lint` · `typecheck` · `lint` · lifecycle/trigger/dispatch unit suites.

## What did NOT change

No RLS policy, no lifecycle/provider-trigger semantics, no other table, no AI/MCP/billing behavior,
no new provider. Workflow-run-detail visibility (V2-READY-49 gap #2, `workflow_runs`) is **not** in
this slice — it needs a separate product decision (V2-READY-51). Nothing pushed.

## Remaining grant-audit follow-ups (from V2-READY-49)

- **V2-READY-51** — `workflow_runs` payload lockdown (HIGH; needs product decision on member-visible
  run detail + redaction).
- **V2-READY-52** — `workflow_files` SELECT revoke (MEDIUM; grant unused → clean).
