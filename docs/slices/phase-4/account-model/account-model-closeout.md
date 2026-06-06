# 4.ACCOUNT-MODEL-CLOSEOUT — Account Ownership / Billing Closeout

> **Status:** Phase B + Phase C COMPLETE. Phase D NOT started.
> **Scope of this doc:** Record the final state of the Account Ownership + Billing
> Rescope arc so future sessions do not need to reconstruct it from commit history.

---

## What this arc did

Moved ChainReact's data + billing ownership model from **user-owned** to
**account-owned**. Every hot table now hangs off an `account_id`; an account has
exactly one owner today (no team/org UI, no roles beyond owner). `user_id` columns
that survive do so only as **actor/provenance** signals, never as the ownership key.

The arc ran in two phases:

- **Phase B** — Account/membership foundation + additive `account_id` + cutover of
  the hot tables (`integrations`, `workflows`, `workflow_runs`) to account ownership.
- **Phase C** — Billing rescoped to the account: `account_billing` foundation, live
  billing cutover, canonical cleanup, and usage/cost ledger + analytics rescope.

---

## Commit chain

The authoritative, chronological list of every `4.ACCOUNT-MODEL`-tagged commit on
branch `builder-ui-v1-audit-1` (current HEAD `d19304f4d`) follows. Generated directly from
`git log` so the hashes are exact:

- `5399c5f8f` — docs(account): plan accounts membership foundation _(2026-05-30)_
- `5831a73d9` — feat(accounts): accounts + memberships foundation (4.ACCOUNT-MODEL-3) _(2026-05-30)_
- `2e7361bb3` — docs(account): plan account id cutover sequence _(2026-05-30)_
- `eb7d471ae` — feat(accounts): account_id additive foundation (4.ACCOUNT-MODEL-5) _(2026-05-30)_
- `974cbc2bc` — feat(accounts)[WIP]: integrations cutover foundation (4.ACCOUNT-MODEL-6a) _(2026-05-30)_
- `f9f24f8c4` — feat(accounts): integrations account_id cutover — close 6a (4.ACCOUNT-MODEL-6b) _(2026-05-30)_
- `1820d42a6` — feat(accounts): integrations cutover test assertion cleanup (4.ACCOUNT-MODEL-6c) _(2026-05-31)_
- `709672493` — feat(accounts): workflows account_id cutover (4.ACCOUNT-MODEL-7) _(2026-05-31)_
- `c752a49e8` — feat(accounts): workflow_runs account_id cutover — close Phase B (4.ACCOUNT-MODEL-8) _(2026-05-31)_
- `55449896b` — feat(runs): run-history page + API, account-scoped (4.RUNS-PAGE-1) _(2026-05-31)_
- `9faacfd66` — docs(billing): Phase C account-billing rescope plan (4.ACCOUNT-MODEL-9) _(2026-05-31)_
- `b3edf5de4` — fix(billing): reserve/reconcile RPCs referenced dropped workflow_runs.user_id (4.ACCOUNT-MODEL-9a) _(2026-05-31)_
- `53d1e5910` — test(billing): account-own the reserve/reconcile engine harness (4.ACCOUNT-MODEL-9a2) _(2026-05-31)_
- `a5de655fa` — feat(billing): account_billing foundation, side-by-side with user_billing (4.ACCOUNT-MODEL-9b) _(2026-05-31)_
- `96aa82c9f` — feat(billing): live cutover to account_billing (4.ACCOUNT-MODEL-9c) _(2026-05-31)_
- `d9bc7181f` — refactor(billing): canonical account billing cleanup — drop user-scoped path (4.ACCOUNT-MODEL-9c2) _(2026-05-31)_
- `d19304f4d` — feat(billing): rescope usage/cost ledgers to account ownership (4.ACCOUNT-MODEL-9d) _(2026-05-31)_

**Logical progression these commits implement (Phase B → Phase C):**

1. Account model rule doc — ownership rule + hard fences written down first.
2. Account / membership foundation — `accounts` + `account_memberships` tables.
3. `account_id` additive foundation — nullable `account_id` added alongside existing `user_id` (no behaviour change yet).
4. Integrations cutover — `integrations` reads/writes keyed on `account_id`.
5. Workflows cutover — `workflows` keyed on `account_id`.
6. Workflow_runs cutover — `workflow_runs` keyed on `account_id` (`c752a49e8`).
7. Billing plan — the account_billing rescope plan doc.
8. Reserve / reconcile hygiene — task reserve + reconcile paths aligned to account scope.
9. `account_billing` foundation — account-scoped billing table.
10. Live billing cutover — runtime deduction/cost paths read account billing.
11. Canonical cleanup — drop the now-redundant user-scoped billing reads.
12. Ledger / analytics rescope — usage/cost ledgers + analytics on account ownership (`d19304f4d`, `4.ACCOUNT-MODEL-9d`, closes Phase C).

> If a line above is not represented in the git-generated list, it is a
> documentation-only commit that was not tagged with the slice marker — check
> `git log` on `builder-ui-v1-audit-1` directly.

---

## Final ownership model — by table

| Table | Ownership key | Notes |
|-------|---------------|-------|
| `accounts` | (root) | One row per account. Exactly one owner today. |
| `account_memberships` | `account_id` + `user_id` | Owner-only membership for now; the seam for future roles/teams. |
| `integrations` | `account_id` | Cutover in Phase B. `connected_by_user_id` retained as provenance. |
| `workflows` | `account_id` | Cutover in Phase B. `created_by_user_id` retained as provenance. |
| `workflow_runs` | `account_id` | Cutover in Phase B (`c752a49e8`). `triggered_by_user_id` retained as provenance. |
| `account_billing` | `account_id` | Phase C foundation. Account-scoped billing state. |
| `task_usage_events` | `account_id` | Phase C ledger rescope. Append-only usage ledger. |
| `billing_shadow_comparisons` | `account_id` | Phase C. Shadow comparison rows for the cutover safety net. |
| `ai_cost_events` | `account_id` (ownership) + `user_id` (actor) | Phase C. Owned by account; `user_id` kept as the acting user (provenance). |
| `trigger_resources` / `workflow_files` | via parent (`workflow`/`account`) | **Not renamed.** Reachable through their owning workflow/account; no direct `account_id` column was added. See "Intentionally not changed." |

---

## Which `user_id` fields remain — and why

All surviving `user_id` columns are **actor / provenance only**. They record *who
did a thing*, never *who owns the row*. None of them gate access or billing.

- `created_by_user_id` (`workflows`) — which user authored the workflow.
- `connected_by_user_id` (`integrations`) — which user connected the integration.
- `triggered_by_user_id` (`workflow_runs`) — which user (or system actor) triggered the run.
- `ai_cost_events.user_id` — the acting user for an AI cost event (ownership is `account_id`).
- Known user-delivered notifications — notification/delivery rows that target a
  specific human stay user-addressed (you notify a person, not an account).

---

## Intentionally NOT changed

These were deliberately left out of scope. They are seams for later, not gaps.

- **No team/org UI.** Accounts exist in the data model; there is no UI to manage them as teams.
- **No account switcher.** No `active_account_id`; each user resolves to their single owned account.
- **No invitations / roles beyond owner.** `account_memberships` carries owner-only today.
- **No Stripe / payment product behaviour change.** Billing was *rescoped to the account*; the Stripe/payment surface and product behaviour are untouched.
- **No `trigger_resources.account_id` rename.** `trigger_resources` (and `workflow_files`) stay parent-reachable; no direct account column was introduced.

---

## Current verification baseline

The arc was validated against:

- **Typecheck** — clean.
- **Lint** — clean.
- **Full Jest suite** — green.
- **Gated DB suites** — run and green.
- **`db:push`** — all account-model migrations applied.

> Re-run this same baseline before starting Phase D so any drift is caught against
> a known-good state.

---

## Remaining follow-ups (Phase D candidates — NOT started)

- **User / account deletion flow** — cascade + cleanup semantics for deleting a user and/or account.
- **Account switcher / `active_account_id`** — once an account can hold more than one membership.
- **Team / org account types + memberships / roles** — the multi-user account expansion the membership table was designed for.
- **`trigger_resources.account_id` naming cleanup** — only if a direct account column is ever wanted.
- **Stripe / payment implementation** — actual payment/product work, if and when the product requires it.
- **Docs to update later** — fold the final ownership model into the main architecture docs once Phase D direction is chosen.

---

## Provenance

- Repo: `ChainReactV2`
- Branch: `builder-ui-v1-audit-1`
- HEAD at closeout: `d19304f4d`
- Phase C closing commit: `d19304f4d` (`4.ACCOUNT-MODEL-9d`)
