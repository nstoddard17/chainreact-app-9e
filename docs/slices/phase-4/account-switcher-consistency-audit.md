# 4.ACCOUNT-SWITCHER-1 — Account switcher + active-account consistency audit

**Date:** 2026-06-04 · **Branch:** `builder-ui-v1-audit-1`

Adds a workspace/account switcher and audits every authenticated foreground
page for active-account vs personal/global scoping. No billing, credential
provenance, execution authorization, folder/trash, or background
trigger/webhook account-resolution changes (decision 11c preserved).

## Switcher

- `components/app-shell/AccountSwitcher.tsx` — client island in the desktop top
  bar (`AppTopBar`), left of the page-context label. Self-fetches `GET
  /api/accounts` (`listUserAccountSummaries`), shows the active account
  (name + Personal/Team/Organization), lists member accounts, and switches via
  `POST /api/account/active` (`setActiveAccount`) then `window.location.reload()`
  so SSR + client state agree. Frozen (pending_deletion) accounts are disabled.
- No second workspace-state system — thin control over the existing 11b
  resolver / 11d set-active model.

## Page-by-page audit

| Page | Scope | Status |
|------|-------|--------|
| `/workflows` (+ folders/trash) | **Active account** | Fixed in WF-5 follow-up (`resolveActiveAccount`); run stats now `getStatsForAccount`. |
| `GET /api/workflows` | **Active account** | `requireUserWithAccount` + `getStatsForAccount` (was `getStatsForUser`). |
| `/apps` (integrations) | **Active account** | **Fixed here** — was `ensurePersonalAccount` → now `resolveActiveAccount` (`listActiveByAccount`). |
| `/runs` | **Active account** | **Fixed here** — was `ensurePersonalAccount` → now `resolveActiveAccount` (`listByAccountForDisplay`). |
| `/team` | **Active account (effective)** | Already correct — resolves effective active via `listUserAccountSummaries`; renders the active team's roster. |
| `/workflows/[id]` (builder) | **Workflow-scoped** (by id, membership-authorized) | Correct as-is — a workflow opens regardless of active account; only reads the active pointer read-only for the TW-3b mismatch banner. |
| `/notifications` | **User-scoped** | Correct — notifications are per-user, not per-account. |
| `/` (marketing) | **Global** | Correct — no account context. |

## Run-stats fix

`workflow_run_stats` view (`20260604000000`) now exposes `account_id` (grouped by
`workflow_id, account_id` — account_id is functionally dependent, so aggregates
are unchanged). `repositories/workflowRunStats.getStatsForAccount(accountId)`
filters by it. The view's old comment claiming per-`user_id` scoping was stale:
post-4.ACCOUNT-MODEL-8 the underlying `workflow_runs` RLS is account-membership,
and the `security_invoker` view inherits it. Gated DB test proves no
cross-account leak + test-mode exclusion.

## Decision 11c (unchanged)

`resolveActiveAccount` stays foreground-gate-only. Allowlist now: the route gate
(`app/api/workflows/_shared.ts`) + the SSR pages that render account-scoped lists
(`/workflows`, `/apps`, `/runs`). Background paths (cron / webhook / trigger
execution) still MUST NOT consult active-account session state — they resolve the
workflow's owning account. The `activeAccount.test.ts` guard enforces both.

## Known follow-ups (not in this slice)

- Mobile: surface the active account / switcher in the nav drawer (`AppMobileBar`
  is space-constrained; desktop top bar has it today).
- First-paint: the switcher self-fetches, so the active label briefly shows
  "Loading…". Could be SSR-seeded via an `AppShell` prop later.
