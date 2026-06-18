# V2-READY-53 — `security_invoker` View Dependency Audit

**Type:** Security audit + regression guard (test-only — **no source/schema/migration change**).
**Date:** 2026-06-17
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Follows:** the hotfix `e1ad28d82` (V2-READY-51 follow-up — `workflow_run_stats` read moved to service-role).

---

## Executive summary (go / no-go)

The hotfix `e1ad28d82` exposed a bug **class**: a `security_invoker=true` view over a
service-role-only base table, read via the authenticated client, throws `42501` once the base
table's `authenticated` SELECT is revoked. This audit checked whether any **other** view (or
function) hits that class.

**Result: the class has exactly ONE instance, and it is already fixed.** `workflow_run_stats`
is the **only public view** in the prod schema, and the only `security_invoker` view over a
locked base table (`workflow_runs`). Its single app reader (`repositories/workflowRunStats.ts`)
already uses service-role (the hotfix). **No new gaps, no migration, no view rewrite, no
`security_definer` change.** A CI-runnable structure guard was added to prevent regression.

---

## 1. View dependency map (prod `qcepijemjlkssfkvzlio`, read-only introspection)

| View | kind | `security_invoker` | base table | `authenticated` view SELECT | `authenticated` base SELECT | App read path |
|---|---|---|---|---|---|---|
| **`workflow_run_stats`** | view | **true** | `workflow_runs` (locked, V2-READY-51) | **true** | **false** | **service-role** (`repositories/workflowRunStats.ts` → `getStatsForAccount`, caller-resolved-account gate) — fixed by `e1ad28d82` |

- **`workflow_run_stats` is the ONLY public view** (`pg_class.relkind in ('v','m')` → 1 row).
  No materialized views. So the audit surface for this class is exhausted by one row.
- The view's `anon` SELECT grant is `true`, but `anon` also lacks `workflow_runs` SELECT, so
  an `anon` read of the view is likewise `42501` — no anon path reads it, and it cannot leak
  (defense-in-depth note, not a gap).

## 2. The DANGER check (auth-readable view over a base table auth cannot read)

The introspection query (security_invoker view, `auth_view_select=true` AND
`auth_base_select=false`) returns **exactly one row**: `workflow_run_stats → workflow_runs`.
That read path is already service-role. **No other view qualifies.**

## 3. Straggler check — direct authenticated reads of locked tables

Beyond views, confirmed (grep) that **no** repository or server component reads a locked base
table (`workflow_runs` / `integrations` / `trigger_resources` / `workflow_files`) via the
authenticated `@/utils/supabase/server` `createClient`. Every locked-table repo
(`integrations.ts`, `triggerResources.ts`, `workflowFiles.ts`, `workflowRuns.ts`,
`workflowRunsLifecycle.ts`, `workflowRunsDiagnostics.ts`, `accountPurge.ts`) is service-role-only.
`workflow_run_stats` is read **only** by `workflowRunStats.ts` (service-role).

## 4. `security_definer` functions (separate class — reviewed, not a gap)

16 `security_definer` functions exist (`deduct_tasks_if_available`, `reserve_tasks_if_available`,
`reconcile_task_reservation`, `release_*`, `is_account_member`, `get_account_member_identities`,
`handle_new_user`, `transfer_account_ownership`, `apply_business_up/downgrade`,
`deduct_ai_credits_if_available`, `increment_api_key_rate_limits`, `find_user_id_by_email`,
`workflows/workflow_folders_enforce_*`). These are **intentionally** definer — they run with the
owner's privileges, so they have **no privilege-mismatch 42501 risk** (the opposite of the
security_invoker-view problem); they are the correct pattern for privileged billing/membership
RPCs invoked via `rpc()`. Out of scope for this 42501-class audit; their data-exposure surface
is governed by their own guards (not changed here).

## 5. Fix / change in this slice

- **No source, schema, migration, or grant change** — the only instance was already fixed by
  the hotfix; the audit found nothing else to move.
- **Added a static regression guard**
  [`tests/structure/no-authenticated-security-invoker-view-reads.test.ts`](../../../../tests/structure/no-authenticated-security-invoker-view-reads.test.ts):
  every reader of a listed sensitive view (`SENSITIVE_VIEWS = ['workflow_run_stats']`) must use
  `getServiceRoleClient` and must NOT import the authenticated `@/utils/supabase/server` client.
  Non-vacuous (asserts the known reader is found). CI-runnable counterpart to the gated DB proof.

## 6. Tests / verification

- New structure guard: **2/2 pass**. Static grant guard (`no-authenticated-integration-grants`):
  **9/9**. `typecheck` 0 · `lint` 0 errors.
- Gated DB lockdown proofs vs prod (`ALLOW_DB_INTEGRATION_TESTS=true`): **12/12** —
  authenticated direct SELECT on `workflow_runs` AND on the `workflow_run_stats` view both
  `42501`; service-role reads the view (safe aggregates only); account scoping intact.

## 7. What did NOT change

No source, no schema, no migration, no `db:push`, no grant, no view definition, no
`security_definer` flip, no re-grant of any locked table, no AI/MCP/billing behavior, no new
provider, no builder-smoke work. DTO allow-lists preserved. Test-only. Nothing pushed/deployed.

## 8. Stop-and-report triggers — none hit

No view required a product-visibility decision; no migration/view rewrite was needed; no
`security_definer` option was necessary; no authenticated route depends on raw sensitive view
data (the one view's read is service-role + exposes only safe aggregates).
