# V2-READY-38 — Retention / purge cron reliability audit

**Status:** Audit complete. Decision: **all three destructive purge crons remain
flag-gated and UNSCHEDULED.** No `vercel.json` entry added. A tripwire test
(`tests/unit/app/api/cron/purge-crons-unscheduled.guard.test.ts`) enforces that
they stay unscheduled until the deliberate re-enable checklist below is met.

This contrasts with V2-READY-37, which DID schedule `cleanup-workflow-files` — a
non-destructive janitorial reconciler. The routes here permanently **delete or
anonymize** user/account/workflow/billing data, so scheduling is a production +
legal/ops decision, not an engineering one.

## Routes audited

| Route | Service | Flag (default OFF) | Affected data |
|---|---|---|---|
| `/api/cron/purge-pending-deletions` | `services/accounts/accountPurge.ts` → `purgeDuePendingAccounts` | `ENABLE_ACCOUNT_PURGE_CRON` | integrations, workflow_runs, workflows, account_billing, account, `auth.users` (last) |
| `/api/cron/purge-trashed-workflows` | `services/workflowFolders/trashPurge.ts` → `purgeDueTrashedItems` | `ENABLE_WORKFLOW_TRASH_PURGE_CRON` | trashed workflows + folders (billing ledgers survive, `workflow_id` nulled) |
| `/api/cron/purge-anonymized-ledgers` | `services/accounts/ledgerPurge.ts` → `purgeExpiredAnonymizedLedgers` | `ENABLE_LEDGER_PURGE_CRON` | already-anonymized rows in `task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons` |

All three share the same hardened route shape: `requireCronAuth` → flag check
(`{ok:true, enabled:false}` no-op when OFF) → service → **counts-only** response
→ fail-safe 500. service-role only; the route is the cron-auth-protected public
surface.

## Safety result per route — all SAFE

| Property | account-purge | trash-purge | ledger-purge |
|---|---|---|---|
| Only eligible/expired selected | ✅ `deletion_status='pending_deletion' AND purge_after<=now` | ✅ `deleted_at IS NOT NULL AND purge_after<=now` | ✅ `anonymized_at IS NOT NULL AND ledger_purge_after<=now` |
| Grace window respected | ✅ 30-day grace (`accountDeletion.ts`) | ✅ 7-day restore window (`trashService.ts`) | ✅ 90-day post-anonymization (`accountPurge.ts`) |
| Non-expired/active never touched | ✅ eligibility guard refuses in-grace / non-pending | ✅ `deleted_at IS NOT NULL` filter | ✅ live rows have `anonymized_at = NULL` → never selected |
| RESTRICT-safe delete order | ✅ anonymize → integrations → runs → workflows → billing → account → auth.users | ✅ workflows before folders; folders children-before-parents | n/a (single-table deletes) |
| Last-owner / transfer bypass | ✅ none — account-scoped, only purges grace-elapsed `pending_deletion` | n/a | n/a |
| Billing/audit retention preserved | ✅ ledgers anonymized + retained 90d before hard delete | ✅ ledgers survive with `workflow_id` nulled (no anonymization) | ✅ deletes only after the 90d retention elapses |
| Partial-failure safe | ✅ per-account try/catch, `failed++`, batch continues, idempotent | ✅ error → 500, next tick retries (delete-where-present) | ✅ error → 500, next tick retries |
| Counts-only / no-leak | ✅ `{scanned,purged,recovered,skipped,failed}` | ✅ `{scanned,workflowsPurged,foldersPurged}` | ✅ `{taskUsageEvents,aiCostEvents,billingShadowComparisons,total}` |

A live, un-anonymized ledger row can **never** be hard-deleted by the ledger
purge (it requires `anonymized_at IS NOT NULL`), so billing-audit data is not at
risk. Account purge anonymizes ledgers **before** deleting the account, creating
the separate 90-day retention sweep — billing history outlives the account.

## Existing test coverage

Each route has a route test (secret-required 401/500, flag-OFF no-op + service
not called, flag-ON delegates, GET+POST, error 500, counts-only keys). Each
service has unit tests (eligibility guards, delete ordering, partial-failure
isolation, idempotency) and opt-in integration `*.dev.test.ts` tests against a
real DB proving the SELECT predicates (expired caught / in-window missed),
RESTRICT ordering, ledger survival, and the retention window. Coverage is
sufficient to prove safety; remaining gaps are isolation-level only (the SQL
predicates are mocked at the unit layer but proven at the integration layer).

## Schedule recommendation per route — DO NOT SCHEDULE (defer)

Even though the code is safe and the flags default OFF (so a `vercel.json` entry
would be a no-op until the flag is enabled), these are **destructive** jobs whose
activation is a deliberate production + legal/ops decision. Pre-wiring the
schedule is deliberately avoided so that "the schedule exists" is never decoupled
from "the flag is turned on with sign-off."

Reasons to defer (any one is sufficient):
- **Pre-launch / pre-revenue, no real users** — there is nothing to purge yet,
  and the account-deletion flow (Phase D) that produces `pending_deletion`
  accounts + anonymized ledgers is not the live, exercised path.
- **Legal/compliance retention sign-off** — the 30-day grace, 7-day trash, and
  90-day ledger windows are engineering defaults; the ledger window in
  particular is a data-retention/compliance choice that should be confirmed
  before automated hard-deletes run on real customer billing data.
- **Production ops decision** — enabling destructive automation needs a
  monitoring + rollback posture (alerting on `failed` counts, dry-run
  verification on real data) decided at enable-time.

## Re-enable checklist (when one of these is ready to schedule)

For a given route, do ALL of the following together, in one reviewed change:
1. Confirm the upstream flow is live and exercised (account-deletion request +
   cancel for account/ledger purge; workflow trash + restore for trash purge).
2. Get explicit sign-off on the retention window (legal/compliance for the
   ledger window; product for grace/restore windows).
3. Add the `vercel.json` cron entry (suggest a **daily** off-peak cadence — these
   are low-volume reconcilers; sub-daily adds no value).
4. Set the corresponding `ENABLE_*_CRON` env var to `true` in production.
5. Remove the route's path from the tripwire test
   (`purge-crons-unscheduled.guard.test.ts`) and add a normal schedule-guard for
   it (mirroring `sweep-stale-runs` / `cleanup-workflow-files`).
6. Add an alert on the cron's `failed` count > 0.

## Confirmation

- No code, retention-window, flag, or schema change in this slice.
- No `vercel.json` change. No `db:push` / migration. No push / deploy.
- No AI/MCP/billing behavior change.
