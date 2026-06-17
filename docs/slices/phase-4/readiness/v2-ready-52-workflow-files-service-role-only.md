# V2-READY-52 — `workflow_files` Service-Role-Only

**Type:** Security hardening (migration only — the grant was unused). **No product behavior change.**
**Date:** 2026-06-16
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Closes:** the MEDIUM-severity gap #3 from the [V2-READY-49 grant audit](./v2-ready-49-sensitive-table-grant-audit.md).
**Mirrors:** integrations (47B/47D) + trigger_resources (50).

---

## What changed

`public.workflow_files` had an `authenticated` SELECT grant + account-member RLS, so a member could
`supabase.from('workflow_files').select('*')` **directly via PostgREST** and read `storage_path`
(the `<userId>/<workflowId>/<runId>/<nodeId>/<filename>` bucket hierarchy) + `file_name` (possible
PII) across the account, bypassing any DTO.

**The grant was fully unused** (verified before applying): every function in
[`repositories/workflowFiles.ts`](../../../repositories/workflowFiles.ts) already uses the
service-role client (no `createClient` import), and there is **no `from("workflow_files")` call
anywhere outside that repo**. There was **no authenticated WRITE grant** (writes were always
service-role). So this slice is a clean revoke with **no repository/route/service code change**.

**Migration `20260630000000_revoke_authenticated_workflow_files_select.sql`:**
```sql
REVOKE SELECT ON public.workflow_files FROM authenticated;
```
`service_role` unchanged (sole reader/writer); `anon` unchanged (never granted); no RLS policy
altered; no file-output contract / retention / cleanup-cron / storage behavior touched.

## Exact grants after migration

`authenticated` → **none** · `service_role` → SELECT, INSERT, UPDATE, DELETE · `anon` → none.

> **Deploy note:** applied to the **V2 dev DB only** (`qcepijemjlkssfkvzlio`) — not pushed, not in
> prod. A production deploy must apply `20260630000000`.

## App read/write path

Unchanged — already service-role for everything: insert (engine staging), getById /
getByStoragePath / listForRun (reads), the signed-download flow, and the
retention/cleanup cron (`listExpired` / `deleteExpired`). The future user-facing file-read path
(not built yet) must be service-role + an explicit workflow/account gate + a safe DTO / signed-URL
flow — it must not re-grant `authenticated` SELECT.

## Tests / verification

- **Gated RLS DB proof** ([`workflow-runs-account-rls.test.ts`](../../../tests/integration/security/workflow-runs-account-rls.test.ts)):
  member + non-member direct SELECT → `42501`; service-role read intact (7/7 vs dev DB after db:push).
- **Regression guard** ([`no-authenticated-integration-grants.test.ts`](../../../tests/structure/no-authenticated-integration-grants.test.ts)):
  the service-role-only table SET now covers `integrations` + `trigger_resources` + `workflow_files`;
  a future re-GRANT of any fails loudly.
- `migration lint` · `typecheck` · `lint` 0 errors · full services unit suite (incl. file-output
  staging / signed-url / cleanup-cron) green.

## What did NOT change

No repository/route/service code, no RLS policy, no file-output contract, no retention/cleanup
behavior, no storage behavior, no other table, no AI/MCP/billing behavior, no new provider. Nothing
pushed.

## Grant-audit arc status (from V2-READY-49)

- ✅ **50** — `trigger_resources` service-role-only.
- ✅ **52** — `workflow_files` service-role-only (this).
- ⏳ **51** — `workflow_runs` payload lockdown: NOT started — needs a separate product decision on
  member-visible run detail (`trigger_event` / `steps` redaction).
