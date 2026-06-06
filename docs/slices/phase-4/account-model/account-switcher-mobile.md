# 4.ACCOUNT-SWITCHER-MOBILE — Mobile Account Switcher + Account Context Visibility

**Type:** Implementation. Mobile UI + shared-state refactor + tests.
**Date:** 2026-06-04
**Builds on:** 4.ACCOUNT-SWITCHER-1 (desktop top-bar switcher), 4.ACCOUNT-MODEL-11b/11c/11d (active-account model + foreground/background guard).

---

## Goal

Mobile users can see and switch their active workspace/account from the nav drawer —
closing the gap left by 4.ACCOUNT-SWITCHER-1, which shipped the switcher only in the
desktop top bar. The active account must be reachable and switchable below `md`, using
the exact same active-account mechanism as desktop (no second workspace-state system).

---

## Implementation

The desktop switcher's stateful logic and row markup were extracted into shared pieces so
desktop and mobile render from one fetch + one switch path:

- **`components/app-shell/useAccountSwitcher.ts`** — shared hook. Owns the accounts fetch,
  the resolved active account, the `switching`/`error` state, and the `switchTo` action.
  Single source of truth for active-workspace state across both surfaces. Also exports the
  `TYPE_LABEL` map (`personal → "Personal"`, `team → "Team"`, `organization → "Organization"`).
- **`components/app-shell/AccountSwitcherList.tsx`** — shared presentational list. Renders the
  "Workspaces" header, per-account row (avatar + name + type + pending-deletion note), active
  checkmark, "Switching…" affordance, frozen-disabled state, and error line. Parameterized by
  a `testIdPrefix` so each surface keeps distinct test ids.
- **`components/app-shell/AccountSwitcher.tsx`** (desktop) — refactored to consume the shared
  hook + list inside its existing popover. All prior test ids / markup / behavior preserved.
- **`components/app-shell/AppMobileAccountSwitcher.tsx`** — new. Renders `AccountSwitcherList`
  **inline** (not a nested popover) using the shared hook.
- **`components/app-shell/AppMobileNav.tsx`** — renders `AppMobileAccountSwitcher` inline inside
  the drawer, above the primary nav items, separated by a divider (drawer widened `w-56 → w-64`).

Inline (vs. a nested popover-in-popover) avoids the portal/dark-scope problem documented in
`UserMenu.tsx`, and keeps the switcher out of the space-constrained `AppMobileBar`.

---

## Behavior

Identical to the desktop switcher because both consume the same hook + list:

- Self-fetches the caller's accounts + effective active id via **`GET /api/accounts`**.
- Switching writes through **`POST /api/account/active`** (`setActiveAccount`).
- **Reloads** (`window.location.reload()`) after a successful switch so SSR + client state both
  pick up the new active account. The reload also dismisses the drawer.
- The **active** account is checkmarked (`aria-current="true"`).
- **Frozen** (pending-deletion) accounts are disabled and labeled "· pending deletion".
- Clicking the already-active account is a no-op (no write, no reload).
- Switch failure surfaces an inline error and does not reload.

---

## Account-context visibility

- `/workflows`, `/apps`, and `/runs` all render through `AppShell`.
- The **desktop** switcher remains in the top bar (always visible).
- The **mobile** switcher is available through the nav drawer.
- The **builder** continues to surface account context via the existing
  `ActiveAccountMismatchBanner` + team-context badges (display-only, read-only pointer — not the
  gated resolver). No builder changes were needed.

---

## Scope boundaries

- No billing changes.
- No credential sharing / provenance changes.
- No execution authorization changes.
- No schema / migration changes.
- No background webhook / cron / trigger account-resolver changes.
- No changes to the foreground-gate-only active-account resolver; no new callers of it.
- No second workspace-state system — one shared hook serves both surfaces.
- No workflow folders / trash UI work included.

---

## UX note

The mobile active workspace is **one tap behind the hamburger by design**: `AppMobileBar`
already carries five affordances, and the slice intentionally does not force the switcher into
that constrained bar. An always-visible mobile active-workspace chip is **deferred** unless
requested.

---

## Verification

- `tsc --noEmit` — clean.
- `eslint` on all changed files — clean.
- Targeted tests — `tests/unit/components/app-shell/*` (9 suites, 57 tests) green, including:
  - new `AppMobileAccountSwitcher.test.tsx` (render/access, switch-then-reload, already-active
    no-op, frozen-disabled, switch-error-without-reload),
  - updated `AppMobileNav.test.tsx` (accounts API mocked + mobile drawer access-path test),
  - existing `AccountSwitcher.test.tsx` unchanged and green.
- **11c guard** — `tests/unit/services/accounts/activeAccount.test.ts` 20/20 green (foreground
  gates only; no background path references active-account machinery).
- Full Jest — 1354 suites / 15460 tests passed, 104 skipped (dev-only DB integration suites),
  0 failures.
