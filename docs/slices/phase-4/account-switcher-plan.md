# 4.ACCOUNT-MODEL-11 — Active Account / Account Switcher Plan

> **Type:** Planning doc only. No migrations, no source, no tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Plans the active-account resolver foundation. Implementation deferred
> to its own slices; visible switcher UI deferred to Phase D (team/org).

Source of truth:
[`account-ownership-model.md`](../../rules/account-ownership-model.md) (canonical —
§"Account switching behavior" already fixes the contract this plan implements),
[`account-model-closeout.md`](./account-model/account-model-closeout.md),
[`account-deletion-flow-closeout.md`](./account-model/account-deletion-flow-closeout.md).

---

## Context

Phase B + C made every hot asset account-owned; the deletion arc (10b–10e) gave
accounts a freeze/purge lifecycle. Today the model is **correct but
single-account**: `requireUserWithAccount` (app/api/workflows/_shared.ts) and
`ensurePersonalAccount` (services/accounts/ensurePersonalAccount.ts) hard-assume
"the caller's account == their personal account." There is no `active_account_id`,
no resolver precedence, and no way to scope a request to a non-personal account.

The canonical rule already decided the *shape* of account switching
(account-ownership-model.md §"Account switching behavior"): a **server-side,
durable-per-user active account** as a default, **explicit account id/slug in
URLs/APIs** wherever practical, and a **server membership check on every request**.
This plan does not re-decide that contract — it plans how to land the resolver
foundation underneath today's single-account app so that Phase D (team/org
creation) plugs in without reworking the hot paths.

The hard lesson the rule doc calls out: **do not recreate V1's localStorage-only
workspace context**, where the server could not authoritatively answer "which
workspace is this request scoped to?" V2's active account must be server state,
gating every API call, with membership verified server-side.

---

## Current state

- Every user has exactly one **personal** account (seeded atomically at signup by
  `handle_new_user`: `user_profiles` + `accounts` + owner `account_memberships` +
  `account_billing`).
- Accounts own integrations, workflows, workflow_runs, billing, ledgers, and the
  deletion lifecycle. RLS gates every hot table on `account_memberships`.
- `accounts.listForUser(userId)` (repositories/accounts.ts) already lists every
  account a caller is a member of (RLS-scoped) — the read the switcher will use.
- `requireUserWithAccount` resolves the personal account via `ensurePersonalAccount`
  and **403s on `pending_deletion`** (10b freeze). This is the only account-resolution
  chokepoint for workflow create/list/run + AI.
- No team/org accounts, no roles beyond `owner`, no invitations, no switcher,
  no `active_account_id`, no account-scoped URL scheme.

---

## Product decision: active account vs personal fallback

**Decision: ship the resolver foundation now; keep the app visually single-account;
defer the visible switcher to Phase D.**

The active-account concept is only *meaningful* once a user can belong to >1
account — which requires team/org creation (Phase D). But retrofitting a resolver
into the hot paths *after* Phase D ships would mean re-touching every
account-scoped route under time pressure. So we land the resolver **now**, while
there is exactly one account per user and the "active vs fallback" distinction is a
no-op (active always resolves to the personal account). This:

- Exercises the precedence + membership-verification logic against the safe
  single-account case before multi-account exists.
- Makes Phase D **purely additive**: team creation writes a membership row and the
  resolver already knows how to honor it.
- Avoids the V1 trap by making the server authoritative from day one.

At launch the contract degenerates cleanly: `explicit id (none) → stored active
(none/personal) → personal fallback` always yields the personal account, so
behavior is identical to today — but the *seam* is in place.

---

## Recommended target model

The canonical three-part contract (account-ownership-model.md §"Account switching
behavior"), restated as what we build toward:

1. **Active account = server-side default.** One durable `active_account_id` per
   user. Used only to scope **interactive UI sessions** when no explicit account is
   named. Persisted across sign-out/sign-in.
2. **Explicit account id/slug in URLs & APIs** wherever practical. Active-account is
   a default, never a hidden side channel. Deep links / shared URLs / concurrent
   tabs name their account explicitly.
3. **Server membership verification on every request**, regardless of how the
   account id arrived (explicit or default). RLS enforces it in the DB; the app
   layer enforces it as defense-in-depth and to return clean 403s instead of empty
   result sets.
4. **Background work never consults active-account.** Cron / polling / webhook /
   scheduled runs operate on the account that owns the workflow/integration they
   fire for (already true today — this plan must not regress it).

Launch builds (1) as a column + resolver, (2) as *optional* explicit account id on
APIs (defaulting to active) with bare URLs unchanged, (3) as the membership check
folded into the resolver. (4) is preserved by *not* wiring active-account into any
background entry point.

---

## Resolver precedence

A single resolver — `resolveActiveAccount(userId, { explicitAccountId? })` —
applied at route entry, **highest-priority first**:

1. **Explicit account id/slug in the request** (path segment / query / body).
   → Verify the caller has a membership row for it. Member → use it. Non-member →
   **403** (never fall through to a default; a named-but-unauthorized account is an
   error, not a cue to silently serve a different account).
2. **Stored `active_account_id`** (the durable default).
   → Verify it still exists, is not `pending_deletion`, and the caller is still a
   member. Valid → use it. Invalid/stale/frozen → clear it (SET NULL) and continue
   to (3). Never serve a stale active account.
3. **Personal-account fallback.** `ensurePersonalAccount(userId)` — always resolves
   (creates on the rare miss). This is the guaranteed floor; every user always has
   exactly one personal account.

Every branch that *returns* an account has already passed membership verification.
The resolver returns a typed outcome (`{ accountId, source: 'explicit' | 'active' |
'personal', account }`) or a typed failure (`403 not-a-member`,
`409/403 account-frozen`) so callers map to HTTP without re-deriving.

**Freeze interaction:** a `pending_deletion` account is non-operational. If reached
via (1) explicit → return the frozen failure (the caller deliberately named a frozen
account). If reached via (2) stored-active → treat as stale, clear, fall to (3).
At launch where active == personal == possibly-frozen, the resolver surfaces the
existing freeze 403 exactly as `requireUserWithAccount` does today (no behavior
change).

---

## URL / API scoping strategy

**Launch:** keep current **bare URLs** (`/workflows`, `/integrations`, `/runs`).
With one account per user, an account-in-URL scheme buys nothing and adds churn.
Bare paths resolve through the resolver (→ active → personal).

**APIs:** introduce an **optional** explicit account id on account-scoped routes
*now* (query param or body field), defaulting to the resolver when absent. This is
the forward-compatible seam — Phase D clients start passing it without a route
signature change. Today every caller omits it and gets the personal account.

**Phase D:** add the account-scoped URL scheme (`/accounts/<idOrSlug>/workflows`,
…) and make the explicit id the primary path for deep links / shared URLs /
concurrent tabs. Bare paths keep resolving via active-account as the default. Slug
support (human-readable URLs) is a Phase D decision — launch uses ids if/when
explicit ids appear.

**Non-negotiable:** the active-account default never *replaces* the membership
check. An explicit id with no membership check is a hole; a membership check with no
explicit id forces every endpoint to silently resolve through user state (the V1
failure). We ship all three legs.

---

## `active_account_id` storage decision

**Recommendation: a nullable `user_profiles.active_account_id uuid` column,
`REFERENCES accounts(id) ON DELETE SET NULL`.**

Rationale:
- **Server-side + durable-per-user** is the canonical requirement; a `user_profiles`
  column satisfies both with zero new infrastructure. `user_profiles` already exists
  and is seeded at signup, so there is a natural home and no new table lifecycle.
- **`ON DELETE SET NULL`** makes a purged/deleted active account self-heal: the
  column nulls, and the resolver falls back to the personal account (Q7). No dangling
  pointer, no app-layer cleanup cron.
- **NULL is a valid state** meaning "no explicit active account chosen" → resolver
  uses the personal fallback. NULL is the launch default for every user (no backfill
  needed; the resolver treats NULL and "personal account id" identically while there
  is one account).

**Rejected alternatives:**
- **Cookie/session-only** — exactly V1's localStorage trap in a different cookie jar:
  not durable across devices, not authoritative server-side, easy to desync across
  tabs. The rule doc explicitly forbids this as the *sole* mechanism.
- **New `user_settings` table** — over-engineered for a single scalar today. If a
  broader per-user settings surface is ever needed, `active_account_id` can migrate
  into it; not worth the table now.

Optional convenience layer (non-authoritative): the client *may* cache the active
account id for instant UI paint, but it is a cache only — the server column is the
source of truth and every request re-verifies membership. The cache must never be
the thing that decides scope.

---

## Account switcher UI recommendation

**Defer the interactive switcher to Phase D.** Build the resolver + set-active
backend now; ship no visible switcher while users have exactly one account.

- **Launch (1 account):** no interactive control. Optionally render a **static,
  non-interactive account name** in the header for future-fit familiarity, or render
  nothing. A dropdown with one item is noise.
- **Phase D (≥2 accounts):** a top-bar switcher listing `accounts.listForUser`,
  calling the set-active endpoint, re-scoping subsequent bare-path requests. The
  backend it needs (`listForUser`, `setActiveAccount`, resolver) all exist by then.

This matches the user-stated preference: add the resolver foundation first, defer
visible UI until multi-account creation exists.

---

## Pending-deletion / deleted account behavior

| Situation | Resolver behavior |
|-----------|-------------------|
| Stored active = `pending_deletion` (Q5) | Never silently served as active. Reached via stored-active → treat as stale, clear (SET NULL), fall back to personal. Reached via **explicit** id → return the frozen failure (the caller named it deliberately). At launch (active==personal==frozen) → existing 10b freeze 403, unchanged. |
| Stored active points at an account the user no longer belongs to (Q6) | Membership check fails → treat as stale → clear (SET NULL) → personal fallback. Never serve data for a non-member. |
| Active account deleted/purged (Q7) | `ON DELETE SET NULL` clears the column at purge → resolver falls back to personal. If the *personal* account is the one being purged, the user row itself is being deleted (purge deletes `auth.users` last), so the question is moot. |
| Explicit id names a frozen/non-member account | 403 (frozen failure or not-a-member). Never fall through to a default — a named-but-unavailable account is an error. |

Principle: **stale/forbidden/frozen never silently downgrades into another
account's data.** It either self-heals to the personal fallback (for the *default*
path) or returns a clean 403 (for the *explicit* path).

---

## Security / RLS considerations

- **RLS is unchanged and remains the backstop.** Every hot table already gates on
  the `account_memberships` join; resolving the "wrong" account can only ever return
  rows the caller is a member of. The resolver's app-layer membership check is
  defense-in-depth + clean 403s, not the only line of defense.
- **`active_account_id` is a default, not an authority.** Writing it never grants
  access; reading it never bypasses the membership check. The column being wrong can
  at worst point the *default* at an account the resolver then rejects.
- **`ON DELETE SET NULL`** prevents a dangling active pointer from outliving its
  account.
- **No new RLS policy is required for the column itself** beyond the standard
  `user_profiles` self-access policy (a user reads/writes only their own profile
  row). Setting active-account is a self-scoped write; the *target* account's
  membership is verified in the service before the write.
- **Background paths must stay active-account-free.** A hard review item for every
  impl slice: cron / polling / webhook / scheduled entry points resolve the account
  from the workflow/integration they fire for — never from `active_account_id`.
- **Anti-hidden-context rules (Q4):** (a) the resolver is the *single* place
  account scope is decided for interactive requests; (b) prefer explicit ids on
  APIs; (c) every resolution re-verifies membership server-side; (d) emit a
  structured log of `{ source, accountId }` per resolution so a wrong-scope bug is
  observable; (e) cross-account isolation tests are mandatory (see Test plan).

---

## Repository / service helper strategy

Named, not coded. All additive; nothing rewrites existing behavior at launch.

**Services:**
- `services/accounts/activeAccount.ts`
  - `resolveActiveAccount(userId, { explicitAccountId? }): ResolvedAccount | ResolveFailure`
    — the precedence engine above. The single resolution chokepoint.
  - `setActiveAccount(userId, accountId)` — verifies membership + not-frozen, writes
    `user_profiles.active_account_id`. Wired but UI-less at launch.
  - `getActiveAccountId(userId): string | null` — raw read.
- Extend the route gate: `requireUserWithAccount(explicitAccountId?)` delegates to
  `resolveActiveAccount`. Default (no arg) preserves today's personal-account
  behavior bit-for-bit. The existing freeze 403 is produced by the resolver's frozen
  failure mapping.

**Repositories:**
- `repositories/userProfiles.ts` — `getActiveAccountId` / `setActiveAccountId`
  (session-client, RLS self-scoped) + a service-role variant for the deletion/purge
  paths if needed.
- Membership check — reuse `accounts.listForUser` or add a focused
  `accountMemberships.isMember(userId, accountId)` for an O(1) existence check
  (cheaper than listing). Recommend the focused helper.
- `accounts.listForUser` already exists for the switcher's list read.

**Boundary rule:** account resolution happens **at the route**, threaded downstream
as `accountId` (the pattern Phase B established for `requireUserWithAccount`).
Repositories never resolve active-account themselves.

---

## Migration needs, if any

One small additive migration:

1. **`user_profiles.active_account_id uuid NULL REFERENCES accounts(id) ON DELETE
   SET NULL`** + an index if it is ever queried by value (it is read by `user_id`,
   which is the PK, so likely no extra index needed). No backfill — NULL is the
   correct launch default for every user (resolver treats NULL == personal while
   there is one account). RLS: covered by the existing `user_profiles` self-access
   policy; confirm `lint:migrations` passes (no new table → no new policy required,
   but the column lives on an RLS-enabled table already).

No changes to `accounts`, `account_memberships`, or any hot table. No FK loosening.
No team/org schema. The migration is safe to apply ahead of the resolver code
(column unused until the resolver reads it).

---

## Test plan

Unit (no DB):
- Resolver precedence: explicit-member → explicit; explicit-non-member → 403;
  no-explicit + valid-stored-active → active; stale/non-member stored-active →
  cleared + personal fallback; frozen stored-active → cleared + personal; frozen
  **explicit** → frozen failure; NULL stored → personal.
- `requireUserWithAccount()` (no arg) unchanged: personal account, freeze 403
  preserved (regression guard against the 10b contract).
- `setActiveAccount`: refuses a non-member target; refuses a frozen target; writes
  on a valid target.

Cross-account isolation (the safety core — Q11):
- A user who is a member of A but not B **cannot** resolve B by any path (explicit
  id, forged active_account_id) — every path 403s or falls back to A's personal.
- A forged/stale `active_account_id` never serves another account's rows.
- Explicit id overrides the default **but still passes** the membership check.

Background-path guard:
- Assert cron/polling/webhook/scheduled entry points resolve the workflow's owning
  account and **never read** `active_account_id` (a structural test / grep-guard
  plus a unit test on the dispatch helper).

Gated DB (`ALLOW_DB_INTEGRATION_TESTS=true`, destructive, self-cleaning):
- RLS proves a non-member's resolved-wrong account returns **zero rows** (the
  backstop holds even if the app check were bypassed).
- `ON DELETE SET NULL` nulls `active_account_id` when the referenced account is
  deleted.

---

## Rollout strategy

- **Additive + flag-free at launch.** The resolver defaults to the personal account
  for every user, so shipping it is a no-op behaviorally. No feature flag needed —
  there is no destructive or user-visible change.
- **Migration first** (column), then resolver, then fold `requireUserWithAccount`
  onto the resolver, then the (unused) `setActiveAccount` endpoint. Each is its own
  small slice; each is independently green.
- **Verification baseline per slice:** `lint:migrations`, `typecheck`, `lint`, full
  Jest, gated DB isolation + SET-NULL tests.
- **Rollback** before Phase D = drop the column (unused) — no behavioral change.
- The **visible switcher** turns on only in Phase D when ≥2 accounts can exist; the
  resolver foundation is inert-but-correct until then.

---

## Risks / open questions

- **Slug vs id in URLs (Phase D).** Launch uses bare URLs; explicit ids on APIs.
  Whether Phase D URLs carry a numeric id or a human slug (and slug uniqueness /
  collision / rename semantics) is a **Phase D** decision — capture it then, don't
  pre-commit.
- **Concurrent-tab divergence.** Two tabs, two different explicit accounts, one
  shared `active_account_id`. Resolved by design: explicit-id URLs are unaffected by
  the active default; only bare paths follow active. Worth an explicit test in Phase D.
- **Active-account write contention.** If the switcher writes `active_account_id` on
  every navigation, that is write amplification. Decision: write **only** on explicit
  switch, never on read/resolve. The resolver is read-only except the stale-clear
  SET NULL (rare).
- **Personal account as a "real" switch target.** When team/org exists, the personal
  account is just another entry in `listForUser`. Confirm the switcher lists it
  (it should — it is a normal membership).
- **Interaction with the deletion freeze on multi-account.** Once a user has ≥2
  accounts, freezing one must not strand the user; the resolver's stale-clear →
  personal-fallback handles it, but Phase D should test "active account frozen while
  user has another account" explicitly.
- **`user_profiles` RLS self-write scope.** Confirm the existing policy allows a user
  to UPDATE their own `active_account_id` (self-scoped) without exposing other
  columns — verify in the impl slice.

---

## Recommended implementation slices

- **11a — `active_account_id` migration.** Additive column on `user_profiles` with
  `ON DELETE SET NULL`. Migration + `lint:migrations`. No code reads it yet.
- **11b — resolver + repository/service helpers.** `resolveActiveAccount`,
  `getActiveAccountId`, `isMember`, `userProfiles` get/set. Full unit + cross-account
  isolation tests. Not yet wired into routes.
- **11c — fold `requireUserWithAccount` onto the resolver.** Default path unchanged
  (personal + freeze 403). Add the optional explicit-account-id seam on
  account-scoped APIs. Regression tests prove launch behavior is identical.
- **11d — `setActiveAccount` endpoint (UI-less).** `POST /api/account/active`
  (membership- + freeze-checked). Backend only; no switcher UI. Gated DB SET-NULL +
  isolation tests.
- **(Phase D) switcher UI + account-scoped URL scheme** — out of this arc; rides on
  11a–11d.

11a–11b can land together if the slice plan justifies it; 11c depends on 11b; 11d
depends on 11b.

---

## Acceptance criteria

- A single durable, **server-side** `active_account_id` exists per user (no
  localStorage/cookie-only authority).
- `resolveActiveAccount` honors precedence **explicit id → stored active → personal
  fallback**, with **membership verified server-side on every branch** and a clean
  403 (never a silent downgrade) for a named-but-unauthorized account.
- A stale / non-member / frozen stored active account self-heals to the personal
  fallback; a purged account nulls the column via `ON DELETE SET NULL`.
- Launch behavior is **identical to today** (one account ⇒ resolver always yields the
  personal account; the 10b freeze 403 is preserved).
- Background work never consults active-account.
- Cross-account isolation is proven by test; RLS remains the backstop.
- The visible switcher is **deferred to Phase D**; the backend foundation
  (`listForUser`, `setActiveAccount`, resolver) is in place so Phase D is purely
  additive.
- No team/org, invitations, roles beyond owner, or account-creation UI introduced.
