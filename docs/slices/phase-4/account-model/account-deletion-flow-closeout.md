# 4.ACCOUNT-MODEL-DELETE-CLOSEOUT — Account Deletion Flow Closeout

> **Type:** Docs-only closeout. No source, migrations, or tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Arc complete (10 plan → 10b/10c/10d backend → 10e self-serve API).
> Purge crons ship **default-OFF**; nothing destructive runs until deliberately enabled.

This is the single page a future session should read to understand the final
state of the user/account deletion flow without reconstructing it from commits.
The original design rationale lives in
[`account-deletion-flow-plan.md`](../account-deletion-flow-plan.md); this doc records
what actually shipped.

---

## Commit chain

| Slice | Commit | What landed |
|-------|--------|-------------|
| 10 (plan) | `1ae3b6a76` | Planning doc only — policy decisions, data-graph audit, FK blockers, staged 10a–10e plan. |
| 10b | `5fa14849e` | Lifecycle columns + `pending_deletion` access **freeze**. Migration `20260531000006` (accounts deletion columns + `account_deletions` audit table + RLS re-point). `requestAccountDeletion` / `cancelAccountDeletion` services; `accountFreeze` guard; freeze wired into `requireUserWithAccount`, `executionBillingGate`, `LifecycleOrchestrator.activate`, OAuth connect/callback/refresh. No purge. |
| 10c | `1fe4e1abd` | **Purge service** + best-effort token revoke + delete. Migration `20260531000007` (additive `account_deletions.purge_counts jsonb`). `purgeAccount` ordered teardown; `purge-pending-deletions` cron (flag-gated); `auth.admin.deleteUser` last. |
| 10d | `bd9876c9b` | **Ledger anonymization + retention cron**. Migration `20260531000008` (CASCADE→SET NULL + nullable + `anonymized_at`/`ledger_purge_after` on the three ledgers). Anonymize is the first purge step; `purge-anonymized-ledgers` cron (separate flag). |
| 10e | `d12347dc0` | **Self-serve request/cancel API**. `POST /api/account/delete` (typed phrase + password re-auth) and `POST /api/account/delete/cancel` (auth + ownership). API-only — no UI. Admin HTTP trigger deferred. |

---

## Final lifecycle

```
[active] --request(typed phrase + password re-auth)--> [pending_deletion / FROZEN]
              ^                                                |
              +------------------ cancel (grace) --------------+
                                                               | purge_after < now
                                                               v
                                          PURGE (cron, flag-gated)
                                  anonymize ledgers → revoke+delete integrations
                                  → delete runs → workflows → account_billing
                                  → account → auth.users (LAST)
                                                               |
                                                               v
                            anonymized ledgers retained (90d) --ledger_purge_after < now-->
                                          HARD-DELETE (cron, separate flag)
```

1. **active** — normal operational state.
2. **pending_deletion (frozen)** — request sets `deletion_status='pending_deletion'`,
   `deletion_requested_at`, `deletion_requested_by`, `purge_after = now()+30d`, and
   appends a `pending` `account_deletions` audit row. The account is immediately
   non-operational: RLS hides operational data from the session client, and the
   service-role freeze guards block billing/OAuth/activation/engine paths. **Default
   grace = 30 days** (`DEFAULT_GRACE_PERIOD_DAYS`).
3. **cancel during grace** — returns the account to `active`, clears request
   metadata, settles the audit row to `cancelled`. Fully reversible; no
   anonymization has happened, so workflows/integrations are intact.
4. **purge after grace** — only for `pending_deletion` AND `purge_after <= now`.
   Ordered, RESTRICT-safe, detach-before-cascade, idempotent ("delete WHERE
   present"). Token revoke is best-effort with bounded retry and never blocks.
   Audit row → `purged` with counts.
5. **anonymized ledger retention** — `task_usage_events` / `ai_cost_events` /
   `billing_shadow_comparisons` are anonymized (all identifiers + free-form fields
   nulled, metadata stripped) and retained as non-account-addressable audit records.
   **Default retention = 90 days** (`LEDGER_RETENTION_DAYS`).
6. **final ledger hard-delete** — the retention cron deletes anonymized rows where
   `ledger_purge_after <= now`.

---

## Final API / routes

| Surface | Path | Guard | Effect |
|---------|------|-------|--------|
| Request | `POST /api/account/delete` | session + typed phrase + password re-auth | `active → pending_deletion` (freeze) **+ immediate cancellation of the account's ChainReact subscription** (BILLING-LIFECYCLE-1). Returns 502 `BILLING_CANCELLATION_FAILED` if the freeze committed but Stripe did not. Soft-only; reversible. |
| Cancel | `POST /api/account/delete/cancel` | session + ownership | `pending_deletion → active` (restore). |
| Purge cron | `GET\|POST /api/cron/purge-pending-deletions` | cron-auth + `ENABLE_ACCOUNT_PURGE_CRON` | Tears down due `pending_deletion` accounts (anonymize → revoke+delete → ... → `auth.users`). **Fails closed while a live subscription remains** (BILLING-LIFECYCLE-1). |
| Billing reconcile | same route, **ungated** | cron-auth only | Retries the subscription cancellation for every `pending_deletion` account. Non-destructive; runs even with the purge flag OFF. |
| Ledger-purge cron | `GET\|POST /api/cron/purge-anonymized-ledgers` | cron-auth + `ENABLE_LEDGER_PURGE_CRON` | Hard-deletes retention-elapsed anonymized ledger rows. |

Key modules: `services/accounts/accountDeletion.ts` (request/cancel),
`services/accounts/accountPurge.ts` (purge), `repositories/ledgerAnonymization.ts`
(anonymize + retention delete), `app/api/account/_shared.ts`
(`requireOwnPersonalAccount` — resolves a frozen account so cancel isn't locked
out), `repositories/authReauth.ts` + `services/accounts/accountDeletionReauth.ts`
(password re-auth).

---

## Confirmation / re-auth model

- **Request (destructive):** two factors layered on the session cookie —
  (1) a typed confirmation phrase `"delete my account"` (case-insensitive,
  anti-accidental), and (2) a **password re-auth** step-up verified on a
  throwaway, session-less Supabase client that never mutates the caller's
  cookies. Appropriate for the current **email + password** auth setup.
- **Cancel (non-destructive restore):** authentication + ownership only — no
  re-auth, so the freeze can never strand a user out of undoing the request.
- **Own-account-only:** routes resolve the account from the session user id and
  accept no account id in the body — a caller can only ever act on their own
  personal account.

---

## Flags (both DEFAULT-OFF)

| Flag | Gates | Default |
|------|-------|---------|
| `ENABLE_ACCOUNT_PURGE_CRON` | the destructive purge cron fan-out | **OFF** |
| `ENABLE_LEDGER_PURGE_CRON` | the anonymized-ledger hard-delete cron | **OFF** |

Both are read at call time in `services/accounts/accountDeletionFlags.ts`. The
purge/anonymization/ledger-delete **services** work when invoked directly (tests
/ admin); only the scheduled cron fan-outs are flag-gated. Neither cron is
registered in `vercel.json` yet.

---

## Intentionally deferred

- **Self-serve UI** — settings/account page with the request/cancel flow. 10e is
  API-only.
- **Admin HTTP trigger** — the service layer already supports a system caller
  (`requestAccountDeletion` with `requestedByUserId=null`), but a secure admin
  HTTP surface awaits a real admin-auth system (V2 has only cron auth today).
- **Team/org owner-transfer behavior** — sole-owner-of-a-team block + ownership
  transfer. Personal accounts are exempt (purged with the user). Lifecycle
  columns + `account_deletions` are forward-compatible.
- **Account switcher / `active_account_id`** — not built.
- ~~**Payment / Stripe retention expansion** — no payment data exists today~~
  **SUPERSEDED (2026-07-24) by 4.ACCOUNT-BILLING-LIFECYCLE-1.** Platform billing
  shipped after this arc. A deletion request now **cancels the account's ChainReact
  subscription immediately**, the purge **fails closed** while any live subscription
  remains, and a reconciliation sweep retries a failed cancellation. Cancelling a
  deletion restores the account on **Free** and never restarts billing. See
  [`account-billing-lifecycle-closeout.md`](../account-settings/account-billing-lifecycle-closeout.md)
  — that doc is authoritative for anything cancel-vs-delete. The 90-day ledger
  retention window is unchanged and is still the seam for future financial-audit
  retention.
- **SSO / OAuth-only re-auth** — password re-auth only today; OAuth-only users
  must use the (deferred) admin path until a provider-reauth/OTP branch is added.

---

## Current verification baseline

What the arc is expected to pass (run at 10e, `d12347dc0`):

- `npm run lint:migrations` — OK.
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors.
- Full `npx jest` — all suites green (gated DB tests skip without env).
- Gated DB tests (`ALLOW_DB_INTEGRATION_TESTS=true`, DESTRUCTIVE, self-cleaning):
  - `tests/integration/accounts/accountDeletionFreeze.dev.test.ts` (10b — request
    freezes / cancel restores + audit rows).
  - `tests/integration/accounts/accountPurge.dev.test.ts` (10c — purge leaves zero
    orphans, `auth.users` deleted last, in-grace refusal).
  - `tests/integration/accounts/ledgerAnonymization.dev.test.ts` (10d — anonymize
    survives cascade, retention hard-delete).

---

## Launch caveats

- **Purge crons must stay OFF until deliberately enabled.** Enabling
  `ENABLE_ACCOUNT_PURGE_CRON` makes due `pending_deletion` accounts permanently
  destroyable; verify 10b–10d on the shared dev DB first and register the cron in
  `vercel.json` only when ready.
- **Admin HTTP deletion requires real admin auth** — do not expose an
  accountId-taking admin route on cron-auth alone.
- **Future payments may require longer ledger retention / policy updates** — the
  90-day window and the anonymization field list are the levers to revisit when
  Stripe/payments land.
