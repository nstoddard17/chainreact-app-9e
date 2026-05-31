# 4.ACCOUNT-MODEL-SWITCHER-CLOSEOUT — Active Account Foundation Closeout

> **Type:** Docs-only closeout. No source, migrations, or tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Active-account **foundation** complete (11 plan → 11a/11b/11c/11d).
> Visible switcher UI + account-scoped URL scheme deferred to Phase D.

Single-page record of the final active-account foundation so a future session
(especially when Phase D team/org + the visible switcher land) does not
reconstruct it from commits. The original design rationale lives in
[`account-switcher-plan.md`](./account-switcher-plan.md); this doc records what
actually shipped. Mirrors the precedent
[`account-deletion-flow-closeout.md`](./account-deletion-flow-closeout.md).

---

## Commit chain

| Slice | Commit | What landed |
|-------|--------|-------------|
| 11 (plan) | `74ba3e610` | Planning doc — storage decision, resolver precedence, URL strategy, switcher-UI-deferral, 11a–11d slice breakdown. |
| 11a | `80f61eb4a` | Migration `20260531000009_user_profiles_active_account_id.sql` — nullable `user_profiles.active_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL`. Additive, no backfill. Column unused by code until 11b. |
| 11b | `5475ff087` | `resolveActiveAccount` + helpers: `repositories/userProfiles.ts` (`get/set/clearActiveAccountId`), `accountMemberships.isMember`. Not wired into any route. |
| 11c | `fd3cd24f2` | `requireUserWithAccount` (`app/api/workflows/_shared.ts`) delegates account selection to `resolveActiveAccount`. Launch behavior unchanged. |
| 11d | `cff7a1fa1` | `setActiveAccount` + `POST /api/account/active` (`app/api/account/active/route.ts`). Backend-only; no switcher UI. |

---

## Final active-account model

- **Pointer:** `user_profiles.active_account_id uuid NULL`, `REFERENCES
  accounts(id) ON DELETE SET NULL`. Server-side + durable-per-user. `ON DELETE
  SET NULL` makes a purged/deleted active account **self-heal to NULL** (→
  personal fallback) instead of dangling. NULL = "no explicit active account
  chosen" → personal fallback. NULL is the launch default for every user.

- **`active_account_id` is a DEFAULT, not authority.** Writing it grants no
  access; reading it never bypasses the membership check. A wrong/forged pointer
  can at worst point the *default* at an account the resolver then rejects.

- **Resolver precedence** (`resolveActiveAccount(userId, { explicitAccountId? })`,
  highest first):
  1. **Explicit account id** in the request — membership-verified. Never
     downgrades.
  2. **Stored `active_account_id`** — membership-verified and must be `active`.
  3. **Personal-account fallback** (`ensurePersonalAccount`, always resolves).

- **Membership verified server-side on every returned branch.** A shared
  `verifyMemberAccount` gate (`isMember` + RLS-gated `getById` + `active` status
  check) backs both the explicit and stored branches and `setActiveAccount`, so a
  "set" and a later "resolve" of the same id always agree.

- **Explicit non-member / frozen NEVER silently downgrades to personal.** Explicit
  non-member → `not_member`; explicit `pending_deletion` → `account_frozen`. Both
  surface as failures — the caller named that account deliberately.

- **Stored stale / non-member / frozen / vanished (non-personal) self-heals.** The
  pointer is cleared to NULL and resolution falls through to the personal
  fallback. A stored pointer **at** the personal account is **preserved** (not
  cleared) so personal-account freeze behavior is identical to pre-11c. A frozen
  personal floor returns `account_frozen` — the exact outcome
  `requireUserWithAccount` produced before this arc.

- **NULL stored / default launch path → personal account.**

---

## Current launch behavior

- **No visible switcher.** Single-personal-account behavior is unchanged.
- **Bare URLs still work** (`/workflows`, `/integrations`, `/runs`) — they resolve
  through the resolver (→ active → personal).
- **No account-scoped URL scheme yet.** The gate exposes an optional
  `explicitAccountId` seam, but **no route passes it today**; it is the
  forward-compatible hook for Phase D.
- With one account per user and `active_account_id = NULL`, the resolver always
  returns the personal account — identical to `ensurePersonalAccount` before 11c.

---

## Routes / helpers

| Surface | File | Role |
|---------|------|------|
| `resolveActiveAccount(userId, { explicitAccountId? })` | `services/accounts/activeAccount.ts` | Single account-resolution chokepoint. |
| `setActiveAccount(userId, accountId)` | `services/accounts/activeAccount.ts` | Membership+freeze-gated write of the pointer. Grants no access. |
| `POST /api/account/active` | `app/api/account/active/route.ts` | Backend-only set-active endpoint. Body `{ accountId: uuid }`; 400 (malformed) / 401 (unauth) / 403 (`NOT_ACCOUNT_MEMBER` \| `ACCOUNT_PENDING_DELETION`). |
| `requireUserWithAccount(explicitAccountId?)` | `app/api/workflows/_shared.ts` | Route gate; **delegates to the resolver**. Maps `account_frozen → 403 ACCOUNT_PENDING_DELETION`, `not_member → 403 NOT_ACCOUNT_MEMBER`. |
| `get/set/clearActiveAccountId` | `repositories/userProfiles.ts` | Session-client (RLS self-scoped) pointer read/write/clear. |
| `isMember(userId, accountId)` | `repositories/accountMemberships.ts` | Focused membership existence check. |

---

## Security invariants

- **Active account is a default, not authority.** Setting it grants nothing;
  membership is re-checked at every resolve via `verifyMemberAccount`.
- **Background paths must NOT use active-account.** Cron / webhook / polling /
  trigger entry points resolve the account from the workflow/integration they fire
  for — never from `active_account_id`. Enforced by a structural guard over
  `app/api/cron`, `app/api/webhooks`, `services/triggers` in
  `tests/unit/services/accounts/activeAccount.test.ts` (asserts none reference
  `resolveActiveAccount`, `setActiveAccount`, the resolver module, or the active
  route).
- **RLS remains the backstop.** Every hot table already gates on the
  `account_memberships` join; resolving the "wrong" account can only ever return
  rows the caller is a member of. The app-layer membership check is
  defense-in-depth + clean 403s.
- **A forged/stale `active_account_id` cannot leak another account** — the
  membership check fails first; the offending id is never read or returned.
- The user id always comes from the verified session (never request input), so a
  caller can only ever resolve/set **their own** active account.

---

## Intentionally deferred (Phase D)

- **Visible switcher UI** (top-bar account selector).
- **Account-scoped URL scheme** (`/accounts/<idOrSlug>/...`) and the
  **slug-vs-id** decision.
- **Team / organization account creation** (`accounts.type` beyond `personal`).
- **Invitations / accept flow / roles beyond `owner`.**
- **Multi-account freeze test** ("active account frozen while the user has another
  account") — the resolver's stale-clear → personal-fallback already handles it,
  but it should be tested explicitly once ≥2 accounts can exist.

These ride on this foundation additively; none change the model above.

---

## Verification baseline

Re-run before starting Phase D so drift is caught against a known-good state:

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors.
- Full `npx jest` — green (1309 suites at `cff7a1fa1`).
- Targeted suites:
  - `tests/unit/services/accounts/activeAccount.test.ts` (resolver + setActive +
    round-trip + background structural guard).
  - `tests/unit/app/api/workflows/requireUserWithAccount-gate.route.test.ts`
    (gate → resolver mapping; launch + freeze regressions).
  - `tests/unit/app/api/account/active.route.test.ts` (set-active endpoint).
  - `tests/unit/migrations/userProfilesActiveAccountId.test.ts` (migration static
    guard).
- Gated DB (`ALLOW_DB_INTEGRATION_TESTS=true`):
  `tests/integration/migrations/user-profiles-active-account-id.dev.test.ts`
  (column exists + defaults NULL + `ON DELETE SET NULL`).

---

## Provenance

- Repo: `ChainReactV2`
- Branch: `builder-ui-v1-audit-1`
- HEAD at closeout: `cff7a1fa1` (`4.ACCOUNT-MODEL-11d`)
