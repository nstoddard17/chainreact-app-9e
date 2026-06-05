# 4.SECURITY-RPC-EXECUTE-AUDIT — Supabase RPC Execute Privilege Audit

**Type:** Audit / docs only. No source, migration, or behavior change.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`

**Source of truth:**
- All migrations under [supabase/migrations](../../../supabase/migrations) (static grant analysis).
- **Live dev DB** — `has_function_privilege(role, oid, 'EXECUTE')` queried directly over
  `POSTGRES_URL_NON_POOLING` for `anon` / `authenticated` / `service_role` on every function in
  schema `public` (the authoritative ground truth; default privileges can diverge from migration text).
- Trigger to this audit: TL-1 `transfer_account_ownership` was found executable by `authenticated`
  (fix migration [20260605000000](../../../supabase/migrations/20260605000000_transfer_rpc_service_role_only.sql)).

> **Headline: no critical exposure remains.** Every service-role-only RPC is locked
> (`anon`/`authenticated` cannot EXECUTE). The `transfer_account_ownership` bug was the only real
> exposure and it is fixed (verified live). One **LOW** least-privilege hygiene item remains
> (`get_account_member_identities` is reachable by `anon`, but self-gates and denies). No broad fix
> is applied in this audit; a tiny optional follow-up + a regression guard are recommended.

---

## 1. Root cause recap (the bug class)

This Supabase project runs `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
anon, authenticated, service_role`. So **every new `public` function is granted EXECUTE to `anon` +
`authenticated` at creation time**, as explicit per-role grants. `REVOKE ALL ... FROM PUBLIC` does
**not** remove those per-role grants — only a `REVOKE ... FROM anon, authenticated` does. A
SECURITY DEFINER RPC that trusts its arguments (no internal `auth.uid()` check) and is left
`authenticated`-executable is therefore a privilege-escalation hole, because the Data API lets any
signed-in user call it directly, bypassing the route's gate. That is exactly what happened to
`transfer_account_ownership`.

**The correct pattern (used by every billing RPC):**
`REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM public, anon, authenticated;` then
`GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO service_role;`

---

## 2. Live inventory (authoritative — `public` schema, dev DB)

16 functions exist live. `EXECUTE` columns are the **live** `has_function_privilege` result
(`Y` = can execute, `.` = cannot). Migration-only artifacts that were later dropped (the `_v2`
billing functions, `backfill_account_billing`, the `*_compat_set_account` cutover triggers) are
**not present** in the live DB and are out of scope — the live state is what matters.

### 2a. Service-role-only RPCs — all LOCKED ✓

| Function | anon | authd | svc | SECDEF | Intended | Status |
|---|:--:|:--:|:--:|:--:|---|---|
| `deduct_tasks_if_available(uuid,int)` | . | . | Y | Y | service-role | ✅ locked |
| `reserve_tasks_if_available(uuid,int,uuid,timestamptz)` | . | . | Y | Y | service-role | ✅ locked |
| `reconcile_task_reservation(uuid,uuid,int)` | . | . | Y | Y | service-role | ✅ locked |
| `release_task_reservation(uuid,uuid)` | . | . | Y | Y | service-role | ✅ locked |
| `release_expired_reservations(timestamptz)` | . | . | Y | Y | service-role | ✅ locked |
| `find_user_id_by_email(text)` | . | . | Y | Y | service-role | ✅ locked |
| `transfer_account_ownership(uuid,uuid,uuid)` | . | . | Y | Y | service-role | ✅ locked (post-fix) |

All seven correctly deny `anon` + `authenticated`. The billing RPCs were always correct
(`REVOKE ... FROM public, anon, authenticated` in
[20260525000002](../../../supabase/migrations/20260525000002_reserve_reconcile_billing.sql),
[20260531000000](../../../supabase/migrations/20260531000000_fix_reserve_reconcile_rpcs_account_owner.sql),
[20260507000002](../../../supabase/migrations/20260507000002_user_billing.sql)). `find_user_id_by_email`
likewise ([20260531000011](../../../supabase/migrations/20260531000011_account_invitations.sql)).
`transfer_account_ownership` is locked after the
[20260605000000](../../../supabase/migrations/20260605000000_transfer_rpc_service_role_only.sql) fix.

### 2b. Intended caller-facing helpers (self-gated)

| Function | anon | authd | svc | SECDEF | Intended | Status |
|---|:--:|:--:|:--:|:--:|---|---|
| `is_account_member(uuid)` | Y | Y | Y | Y | authenticated + anon (RLS helper) | ✅ by design |
| `get_account_member_identities(uuid)` | **Y** | Y | Y | Y | authenticated only | ⚠️ LOW: anon reachable |

- **`is_account_member`** — an RLS-policy helper ([20260531000012](../../../supabase/migrations/20260531000012_account_memberships_co_member_rls.sql)).
  Must be executable by the roles whose queries trigger policy evaluation (incl. `anon` for
  anon-readable tables). Internally checks `auth.uid()` — an `anon` caller has `auth.uid() = NULL`,
  so it returns `false`. **Intended and safe.**
- **`get_account_member_identities`** — returns co-member email/display_name
  ([20260602000000](../../../supabase/migrations/20260602000000_account_member_identities_rpc.sql),
  redefined [20260602000001](../../../supabase/migrations/20260602000001_member_identities_name_fallback.sql)).
  Its migration did `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;` — it never
  revoked `anon`, so the default-privilege grant to `anon` survives. **The function self-gates**
  (`IF NOT public.is_account_member(p_account_id) THEN RAISE ... 42501`), and an `anon` caller has no
  `auth.uid()` membership, so it always denies anon. **No data leak**, but the `anon` EXECUTE grant
  is broader than intended → least-privilege hygiene gap. **Risk: LOW.**

### 2c. Trigger functions (return `trigger` — NOT RPC-exposable)

`account_memberships_enforce_personal_invariants`, `account_memberships_enforce_team_owner_invariants`,
`accounts_enforce_owner_is_member`, `handle_new_user`, `set_updated_at`,
`workflow_folders_enforce_same_account_parent`, `workflows_enforce_same_account_folder`.

These show `anon=Y authd=Y` (default privileges), but PostgREST does **not** expose
`RETURNS trigger` functions for RPC, and they take no callable arguments — they are invoked only by
the trigger system. **Not exposed in any meaningful way; no action.** (Several are SECURITY DEFINER,
correctly, to bypass RLS for their integrity checks.)

---

## 3. Findings + risk ratings

| # | Finding | Risk | Status |
|---|---|---|---|
| 1 | `transfer_account_ownership` executable by `authenticated` (arg-trusting SECURITY DEFINER) | **was CRITICAL** | ✅ FIXED (20260605000000), verified live |
| 2 | `get_account_member_identities` executable by `anon` (migration revoked PUBLIC only, not anon) | **LOW** | open — self-gated, no leak; hygiene only |
| 3 | Trigger functions carry `anon`/`authenticated` EXECUTE via default privileges | **INFO** | non-issue (not RPC-exposable) |
| 4 | All other service-role-only RPCs (billing ×5, `find_user_id_by_email`) | none | ✅ correctly locked |

**No open critical or high exposure.** The audit's main job — confirm no other service-role-only RPC
shares the transfer bug — is satisfied: **none do.** The billing RPCs (the highest-value targets,
since they mutate balances and trust `p_account_id`) are all locked.

---

## 4. Fix recommendations

### 4a. Optional tiny fix slice — `get_account_member_identities` anon hygiene
A one-statement migration (LOW priority; the function already denies anon at runtime):
```sql
REVOKE ALL ON FUNCTION public.get_account_member_identities(uuid) FROM anon;
-- GRANT EXECUTE ... TO authenticated stays as-is.
```
Defense-in-depth / least-privilege only — not a live vulnerability. Bundle with the next account
slice or ship standalone if desired. **Recommend: do it, but it is not urgent.**

### 4b. Regression guard (recommended) — migration static lint
Extend `scripts/check-migration-rls.mjs` (or a sibling `check-function-grants.mjs`) so CI flags the
bug class at author time:
- For any `GRANT EXECUTE ON FUNCTION public.<fn>(...) TO service_role` in a migration, **require** a
  matching `REVOKE ... ON FUNCTION public.<fn>(...) FROM ... anon` **and** `... authenticated` in the
  same migration (catches "REVOKE FROM PUBLIC only").
- Flag any `GRANT EXECUTE ... TO authenticated` that is **not** accompanied by `REVOKE ... FROM anon`
  (catches the `get_account_member_identities` pattern) unless `anon` is also explicitly granted.

### 4c. Permanent live guard (recommended) — gated DB privilege test
Add a triple-guarded `tests/integration/security/rpc-execute-privileges.dev.test.ts` that runs the
same `has_function_privilege` sweep and asserts an allow-list: the service-role-only set denies
`anon`+`authenticated`; the intended caller-facing set matches its declared roles. This catches any
future RPC that forgets the explicit revoke, against the **live** DB (where static text can lie).

---

## 5. Migrations / functions needing cleanup

| Item | Action | Priority |
|---|---|---|
| `get_account_member_identities(uuid)` | new migration: `REVOKE ALL ... FROM anon` | LOW |
| (none else) | billing + invitation + transfer RPCs already correct | — |

No existing migration is edited (they are applied); any change ships as a new migration.

---

## 6. Verification performed by this audit

- **Static:** read every `CREATE FUNCTION` + `GRANT`/`REVOKE` across all migrations.
- **Live:** direct `has_function_privilege` query over `POSTGRES_URL_NON_POOLING` (service-role
  connection) for `anon`/`authenticated`/`service_role` on all 16 live `public` functions. Result
  table in §2. (One-off query script was run and discarded; not committed.)
- **Confirmation of the fix:** `transfer_account_ownership` is `anon=. authenticated=.` live; the
  TL-1 gated DB test ("authenticated cannot execute the transfer RPC") passes 9/9.

---

## Report summary

- **Functions inventoried:** 16 live `public` functions (7 trigger/internal, 7 service-role-only
  RPCs, 2 caller-facing helpers). Migration-only artifacts since dropped (`_v2` billing, backfill,
  compat triggers) are out of scope.
- **Exposed / high-risk service-role-only RPC:** **none.** `transfer_account_ownership` (the only
  one ever exposed) is fixed and verified locked live.
- **Safe / intended caller-facing:** `is_account_member` (authenticated+anon RLS helper),
  `get_account_member_identities` (authenticated; self-gated). The latter has a LOW least-privilege
  gap (anon retains EXECUTE but is denied at runtime).
- **Recommended fix slice(s):** (a) optional one-line migration to `REVOKE ... FROM anon` on
  `get_account_member_identities`; (b) a migration static-lint rule for the revoke-from-PUBLIC-only
  bug class; (c) a gated DB privilege-sweep test as a permanent guard.
- **Live DB privilege checks run:** **yes** — authoritative `has_function_privilege` sweep, not just
  static text.
