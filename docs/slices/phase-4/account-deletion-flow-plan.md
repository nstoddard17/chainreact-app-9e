# 4.ACCOUNT-MODEL-10 — User / Account Deletion Flow Plan

> **Type:** Planning doc only. No migrations, no source, no tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Phase B + Phase C complete (closeout `70033cbe2`). This plans the Phase D
> follow-up named "user / account deletion flow." Phase D (teams/orgs) otherwise NOT started.

---

## Context

Phase B + Phase C made every hot table account-owned and added
`accounts.owner_user_id → auth.users(id) ON DELETE RESTRICT` as a deliberate guard.

**Consequence:** directly deleting an `auth.users` row is now *blocked* — the RESTRICT FK
fails because the user still owns a personal account, and there is no flow to tear down
the account graph first. There is also no GDPR-style "delete my account" path today.
This slice plans that flow.

### Locked policy decisions
1. **Soft-delete + grace period.** Request → `pending_deletion` (account frozen, reversible)
   → purge after the grace window.
2. **Token handling = best-effort provider revoke *with retry*, then delete** the encrypted
   rows — performed **at purge time**, not at request time (see Token timing).
3. **Triggers = self-serve** (account settings, re-auth confirmed) **AND admin/service-role.**
4. **Ledgers = anonymize at purge, retain for a second window, then hard-delete** via cron.
   The retention window is the **product seam**: today there are no payments, so it can be
   short; once Stripe/payments land, the same pipeline supports longer paid-retention /
   financial-audit retention without redesign.

**Proposed defaults (product-tunable):** grace = **30 days**; anonymized-ledger retention =
**90 days** after purge.

---

## Current account-owned data graph

Verified against the migrations on this branch.

**Root:** `accounts` (one personal account per user; `accounts_one_personal_per_user`
unique index on `owner_user_id WHERE type='personal'`). Created at signup by
`handle_new_user()` (SECURITY DEFINER, `AFTER INSERT ON auth.users`,
current form in `20260531000004_account_billing_canonical_cleanup.sql:36-59`) which seeds
`user_profiles` + `accounts` + owner `account_memberships` + `account_billing`.

**Account-owned (`account_id`):**
- `account_billing` — current-period quota counters (not an audit ledger).
- `workflows`, `integrations`, `workflow_runs`.
- `task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons` (rescoped in
  `20260531000005_ledger_account_rescope.sql`).
- `account_memberships`.

**Reachable via parent workflow (`workflow_id`):** `workflow_revisions`,
`trigger_resources`, `workflow_files`, `builder_agent_threads`, `builder_agent_messages`,
and per-run `task_usage_events` / `ai_cost_events`.

**User-owned (`auth.users`):** `user_profiles`, `oauth_states`, `notifications`, plus the
`user_id` columns on `account_memberships`, `trigger_resources`, `workflow_files`,
`builder_agent_threads/messages`, `ai_cost_events`.

---

## Current delete constraints and FK blockers

| FK | ON DELETE | Implication for deletion |
|----|-----------|--------------------------|
| `accounts.owner_user_id → auth.users` | **RESTRICT** | **The gate.** `auth.users` cannot be deleted until the account is gone. Account teardown comes first; `auth.users` last. |
| `account_billing.account_id → accounts` | **RESTRICT** | Must delete the billing row explicitly before the account. |
| `workflows.account_id → accounts` | **RESTRICT** | Explicit delete, in order. |
| `integrations.account_id → accounts` | **RESTRICT** | Explicit delete (after revoke). |
| `workflow_runs.account_id → accounts` | **RESTRICT** | Explicit delete, before workflows. |
| `account_memberships.account_id → accounts` | CASCADE | Auto-removed with the account. |
| `task_usage_events.account_id → accounts` | CASCADE | **Conflicts with retain-anonymized** — would delete on account delete. Needs FK change (below). |
| `ai_cost_events.account_id → accounts` | CASCADE | Same conflict. |
| `billing_shadow_comparisons.account_id → accounts` | CASCADE | Same conflict. |
| `task_usage_events.workflow_run_id → workflow_runs` | **CASCADE** | **Would delete retained ledger rows when runs are deleted** unless anonymized/detached first. |
| `ai_cost_events.user_id → auth.users` | **CASCADE** | Would delete the row on user delete; must become SET NULL to retain anonymized. |
| `workflows.created_by_user_id` / `integrations.connected_by_user_id` / `workflow_runs.triggered_by_user_id` / `account_memberships.invited_by_user_id` | SET NULL | Provenance; harmless on user delete (rows already gone by then). |
| `user_profiles` / `oauth_states` / `notifications` / `trigger_resources.user_id` / `workflow_files.user_id` / `builder_agent_*` `.user_id` → `auth.users` | CASCADE | Cleaned by the final `auth.users` delete. |

**No `on_auth_user_deleted` trigger exists — and none should be added.** Deletion must be
app-ordered, not FK-cascade-from-auth, so retained ledgers and ordering are controlled.

---

## Deletion policy decisions

- **Soft-delete + grace**, reversible during the window (see Restore path).
- **Freeze on request** — a `pending_deletion` account is immediately non-operational
  (see Personal account deletion flow → Stage 1).
- **Token revoke deferred to purge** for self-serve (grace is reversible); admin
  force-delete may skip grace and revoke immediately (see Token timing).
- **Ledgers anonymized then retained then purged**; retention window is the payments seam.
- **All teardown is service-role only**; self-serve request requires re-auth.

---

## Personal account deletion flow

Three stages, two crons:

```
[active] --request(re-auth)--> [pending_deletion / FROZEN] --grace(30d)--> PURGE --> account+user gone
              ^                          |                                   |
              +---------cancel-----------+                                   v
                                                          anonymized ledgers --retain(90d)--> hard-delete
```

### Stage 1 — request (soft-delete + freeze)
Set `accounts.deletion_status='pending_deletion'`, `deletion_requested_at`,
`deletion_requested_by`, `purge_after = now()+grace`. Record a row in the durable
`account_deletions` audit table. Then **freeze the account so it is immediately
non-operational** (this is mandatory, not cosmetic):

- **Block normal app access / force sign-out** where applicable (revoke the owner's
  sessions; UI shows a "deletion pending — cancel?" state).
- **Exclude `pending_deletion` accounts from normal account resolvers and RLS surfaces** —
  `requireUserWithAccount` / `ensurePersonalAccount` and membership-based RLS must not
  resolve a frozen account for normal operations.
- **Prevent workflow activation / run-now.**
- **Stop scheduled / polling / webhook execution** for the account — the engine and the
  trigger entry points (cron dispatch, webhook handlers, polling) must short-circuit when
  the owning account is `pending_deletion`.
- **Prevent OAuth / connect actions** (no new integrations, no token refresh-for-use).
- **Prevent task-usage / billing activity** (reserve/deduct/reconcile RPC calls refuse for
  frozen accounts).

### Stage 2 — purge (cron `purge-pending-deletions`, service-role, per-account transaction)
Runs for accounts whose `purge_after < now()`. Ordered to satisfy RESTRICT **and** to
*detach-before-cascade* so retained ledgers survive:

1. **Anonymize ledgers first** (must precede every delete): `UPDATE` `task_usage_events` /
   `ai_cost_events` / `billing_shadow_comparisons` → null `account_id`, null `user_id`
   (ai_cost_events), null `workflow_id` / `workflow_run_id`, **strip `metadata` to
   non-identifying aggregates only**, set `anonymized_at=now()`,
   `ledger_purge_after=now()+ledgerRetention`. See Ledger anonymization warning.
2. **Revoke + delete integrations** — best-effort provider revoke *with bounded retry* per
   row (decrypt via `core/encryption/tokens.ts`), then `DELETE` (RESTRICT → explicit).
   Revoke failure is logged and **never blocks** the purge.
3. **Delete `workflow_runs`** (RESTRICT → explicit). Run-linked ledger rows already detached.
4. **Delete `workflows`** (RESTRICT → explicit) — cascades `workflow_revisions`,
   `trigger_resources`, `workflow_files`, `builder_agent_threads/messages`.
5. **Delete `account_billing`** (RESTRICT → explicit; counter state, not audit).
6. **Delete `accounts`** (`account_memberships` CASCADE).
7. **Delete `auth.users`** LAST via service-role `auth.admin.deleteUser` — cascades
   `user_profiles`, `notifications`, `oauth_states`, residual memberships. Anonymized
   ledgers are untouched (their `user_id`/`account_id` already null).
8. Mark the `account_deletions` audit row `purged_at=now()`, status `purged`.

**Idempotency:** every step is "act on rows still present," so an interrupted purge
re-runs cleanly.

### Stage 3 — ledger purge (cron `purge-anonymized-ledgers`)
Hard-`DELETE` anonymized ledger rows where `ledger_purge_after < now()`.

---

## User deletion flow

Today **1 user ⇒ exactly 1 personal account**, and personal accounts cannot be transferred
or left. So "delete user" == "delete that user's personal account," and the personal-account
flow above is the user-deletion flow. `auth.users` deletion is the final step of Stage 2,
never an independent action.

---

## Future team/org member deletion behavior (marked, not built)

- **Plain member of a future team/org account:** delete only their `account_memberships`
  rows (CASCADE on `auth.users` already does this); the team account survives.
- **Sole owner of a future team/org account:** **block at app layer** until ownership is
  transferred (transfer-then-delete). Personal accounts are exempt (purged with the user).
- **Deferred:** ownership transfer, account switcher / `active_account_id`, multi-member
  cascade. The lifecycle columns + `account_deletions` audit table designed here are
  forward-compatible with these.

---

## Data retention / anonymization rules

- **Hard-deleted with the account:** `account_billing`, `workflows` (+ all workflow
  children), `integrations`, `workflow_runs`, `account_memberships`, `user_profiles`,
  `notifications`, `oauth_states`.
- **Anonymized then retained then purged:** `task_usage_events`, `ai_cost_events`,
  `billing_shadow_comparisons`.
- **Provenance `user_id` columns** on deleted rows disappear with those rows; the one
  surviving actor reference (`ai_cost_events.user_id`) is **nulled** during anonymization.

---

## Integration credential cleanup rules

- Tokens are AES-256-GCM (`core/encryption/tokens.ts`); disconnect today is soft-only
  (`repositories/integrations.ts:markDisconnected`) with **no provider revocation** — this
  flow closes that gap at purge time.
- **Self-serve:** during the reversible grace window **do not revoke** — keep the encrypted
  tokens, but the account freeze (Stage 1) means the tokens cannot be *used* (no refresh,
  no run, no connect). At **purge**, best-effort provider revoke with bounded retry, then
  delete the encrypted integration rows.
- **Admin force-delete:** may skip grace and revoke immediately, **only if explicitly
  designed** as a distinct path; default admin deletion still uses grace.
- Revoke is best-effort: a provider returning an error (or having no revoke endpoint) is
  logged and does not block deletion.

---

## Billing / account_billing cleanup rules

- `account_billing` is per-account quota counter **state**, not an audit ledger →
  hard-deleted (RESTRICT → explicit step before the account).
- Reserve/deduct/reconcile RPCs (`repositories/accountBilling.ts`) must refuse for
  `pending_deletion` accounts (part of the freeze).
- No Stripe/customer/subscription data exists today → no payment wind-down required. The
  retention seam is where future paid-account wind-down logic attaches.

---

## Ledger / audit retention rules

- After anonymization, retained ledger rows are **non-user-addressable audit/statistical
  records only**. They MUST NOT be visible through any account-scoped API (no account_id to
  resolve them by).
- **Explicitly strip / never retain** in anonymized rows: raw `metadata`, AI prompts,
  provider payloads, workflow names, node configs, emails, or any other user-identifying
  content. Keep only aggregate numerics (task counts, cost micros, token counts), policy
  versions, coarse type/event labels, and timestamps.
- The durable `account_deletions` audit row keeps deletion bookkeeping (ids, timestamps,
  counts) after the account/user are gone; it stores **no** user content.

---

## Supabase auth deletion sequencing

`auth.admin.deleteUser` is **service-role only** and the **last** step of Stage 2, after the
full account graph is torn down (so the `owner_user_id` RESTRICT no longer blocks it). No
`on_auth_user_deleted` DB trigger is added — ordering stays app-controlled.

---

## Service / repository design (named, not coded)

- `services/accounts/accountDeletion.ts` — `requestAccountDeletion(userId, accountId)`,
  `cancelAccountDeletion(userId, accountId)`, `purgeAccount(accountId)` (service-role
  transactional teardown), `anonymizeLedgersForAccount(accountId)`.
- Repo helpers: `repositories/accounts.ts` (lifecycle setters + final account delete),
  `repositories/integrations.ts` (`revokeAndDelete` best-effort + retry),
  `repositories/accountBilling.ts` (delete + frozen-account refusal), ledger repos
  (anonymize / purge).
- Freeze enforcement: extend `app/api/workflows/_shared.ts:requireUserWithAccount` /
  `services/accounts/ensurePersonalAccount.ts` to treat `pending_deletion` as
  non-resolvable for normal ops; gate engine + trigger (cron/webhook/polling) entry points.
- Token revocation: per-provider best-effort revoke + bounded retry, reusing
  `core/encryption/tokens.ts:decryptToken`.
- Crons: `app/api/cron/purge-pending-deletions`, `app/api/cron/purge-anonymized-ledgers`
  (cron-auth gated, service-role via `repositories/supabase/serviceRoleClient.ts`).
- Routes: `app/api/account/delete` (POST request, POST cancel) with re-auth/step-up
  confirm; admin/service-role path.

---

## RLS / security / service-role boundaries

- All teardown + cron work is **service-role only** (`getServiceRoleClient` with reason
  strings); never client-reachable.
- Self-serve request route: authenticated user + re-auth confirm; a user may only request
  deletion of **their own** account.
- `pending_deletion` accounts are invisible/non-actionable through normal RLS membership
  paths and resolvers (the freeze).
- `auth.admin.deleteUser` is service-role only and runs last.

---

## Migration needs (named, NOT written here)

1. **Account lifecycle columns** on `accounts`: `deletion_status` (`active|pending_deletion`),
   `deletion_requested_at`, `deletion_requested_by uuid`, `purge_after timestamptz`; RLS /
   resolver changes to exclude `pending_deletion`.
2. **Ledger anonymizability + self-retiring** on `task_usage_events`, `ai_cost_events`,
   `billing_shadow_comparisons`: make `account_id` (and `ai_cost_events.user_id`) nullable,
   change those FKs **CASCADE → SET NULL**, change `task_usage_events.workflow_run_id`
   **CASCADE → SET NULL**; add `anonymized_at`, `ledger_purge_after`.
3. **`account_deletions` audit table** — durable, outlives account/user, no user content.
4. (Optional) a `purge_account(account_id)` SECURITY DEFINER SQL function if the ordered
   teardown is preferred server-side in one transaction.

---

## Test plan (gated DB integration tests, future slice)

- Full-graph purge leaves **no orphaned** accounts, memberships, integrations, billing,
  workflows, runs, or workflow children.
- Ledgers are **anonymized (not deleted)** at purge — rows present with null
  account_id/user_id/workflow refs and stripped metadata; fully gone after retention.
- RESTRICT ordering proven (purge succeeds; reordering fails).
- Freeze: `pending_deletion` blocks access, activation, run-now, scheduled/webhook/polling
  execution, connect, and billing RPCs.
- Restore during grace returns account to active with workflows/integrations intact and
  **no** anonymization having occurred.
- Token revoke retried + best-effort (provider failure does not block purge).
- `auth.users` delete succeeds as the final step.

---

## Rollout / rollback strategy

- Ship behind a feature flag; default off until 10b–10d are verified on the shared dev DB.
- Migrations are additive (new columns/table + FK loosening CASCADE→SET NULL) — safe to
  apply ahead of code.
- Rollback before purge code ships = no behavioral change (columns unused).
- The grace window itself is the operational safety net: nothing is destroyed until a frozen
  account ages past `purge_after`, and cancel fully restores within that window.

---

## Risks / open questions

- **Highest-risk FKs:** `accounts.owner_user_id` RESTRICT (ordering gate);
  `task_usage_events.workflow_run_id` CASCADE and `ai_cost_events.user_id` CASCADE (would
  destroy retained ledgers unless changed to SET NULL + anonymized first); the four RESTRICT
  `account_id` FKs (each a required ordered delete); `billing_shadow_comparisons` no-FK
  correlation keys (must be nulled by value).
- **Freeze surface area:** stopping scheduled/polling/webhook execution touches engine +
  multiple trigger entry points; needs a single, well-placed gate to avoid leaks.
- **Open product decisions:** grace length (proposed 30d); anonymized-ledger retention
  (proposed 90d); re-auth mechanism for self-serve confirm (password re-entry vs email
  confirm vs provider re-auth); whether admin force-delete (skip-grace + immediate revoke)
  ships in launch scope or later.

---

## Recommended implementation slices (staged)

- **10a — this plan doc.**
- **10b — lifecycle columns + `pending_deletion` access freeze** (request/cancel + freeze
  enforcement across resolvers, RLS, engine, triggers, billing RPCs). No purge yet.
- **10c — purge service + token revoke/delete** (`purgeAccount` ordered teardown +
  best-effort revoke-with-retry + `purge-pending-deletions` cron + `auth.admin.deleteUser`).
- **10d — ledger anonymization + retention cron** (FK changes, anonymize step wired into
  purge, `purge-anonymized-ledgers` cron).
- **10e — self-serve UI + admin/service-role trigger** as needed (settings page with
  re-auth confirm; admin path).

---

## Acceptance criteria

- A user can request deletion (self-serve, re-auth) and an admin/service-role path can too.
- On request, the account is immediately frozen (non-operational across all surfaces) and
  reversible during the grace window; cancel fully restores it with data intact.
- After grace, purge tears down the account graph in RESTRICT-safe, detach-before-cascade
  order, best-effort-revokes + deletes integration tokens, and deletes `auth.users` last —
  leaving **zero orphans**.
- Ledgers are anonymized (PII/content-free) and retained for the retention window, then
  hard-deleted by cron.
- Entire flow is service-role for teardown; nothing destructive is client-reachable.
- The whole thing is staged across 10b–10e; no single slice must build every piece at once.
