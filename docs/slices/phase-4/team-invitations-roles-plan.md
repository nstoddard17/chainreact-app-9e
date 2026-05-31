# 4.ACCOUNT-MODEL-14 — Invitations + Roles Plan

> **Type:** Planning doc only. No migrations, no source, no tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Plans Phase D **D2** (invitations + roles). Visible UI → D3;
> transfer/leave + DB ≥1-owner invariant → D5; outbound email → when email infra
> exists. Implementation deferred to its own slices.

Source of truth:
[`team-org-account-creation-plan.md`](./team-org-account-creation-plan.md),
[`account-ownership-model.md`](../../rules/account-ownership-model.md) (canonical
§"Membership and role rules"), the account
[ownership](./account-model-closeout.md) / [deletion](./account-deletion-flow-closeout.md)
/ [switcher](./account-switcher-closeout.md) closeouts, and the D1 team-creation
backend (commit `c561467be`).

**Guardrail:** keep this launch-scope. Owner/admin/member is enough — **no
enterprise RBAC, no per-resource ACLs, no V1 workspace complexity.** Account stays
the single ownership root; roles gate *member management*, not data access.

---

## Context

D1 (`c561467be`) shipped backend-only team creation: a user creates a team
(`type='team'`), gets an `owner` membership + free `account_billing`, and the team
auto-activates. `account_memberships.role` already accepts `owner|admin|member`,
but only `owner` is ever assigned because there is no way to add a second member.
D2 closes that: **invite people, let them accept, and make `admin`/`member`
mean something.**

Two facts from the codebase shape this plan:
- **No transactional email infrastructure exists** in V2 (no Resend/SMTP wiring
  for app email — the only "resend" hits are *user-facing integration handlers*).
  → outbound invite email is **deferred**; D2 produces invite records + accept
  links + in-app notifications.
- **`oauth_states`** is a working precedent for a short-lived, opaque-token table;
  **`notifications`** already delivers in-app messages. D2 reuses both patterns
  rather than inventing infra.

---

## Current state after D1

- Users create backend-only team accounts (owner membership + free billing,
  auto-activate). A user may own many teams.
- `account_memberships.role` CHECK = `owner|admin|member`; only `owner` assigned.
- RLS today: `account_memberships_select_self` — a member sees **only their own**
  membership row (no co-member visibility yet).
- No invitations, no role assignment, no member removal, no transfer/leave.
- Deletion is blocked (409 `ACCOUNT_HAS_OWNED_TEAMS`) while a user owns any
  team/org account.
- Active-account foundation (`resolveActiveAccount` / `setActiveAccount`) is live;
  the personal-invariants trigger is a no-op for team/org accounts.

---

## Recommended D2 launch scope

**"Invite by email → accept while signed in → become an admin/member; owners and
admins manage the member list." Backend + minimal. No outbound email, no visible
UI, no transfer/leave.**

What D2 ships:
- An **`account_invitations`** table: opaque expiring token, statuses
  `pending|accepted|expired|revoked`, roles `admin|member` only.
- **Create / list / revoke** invites (owner+admin); **accept-by-token**
  (authenticated, email-matched), which inserts the membership and **auto-activates**
  the joined account.
- **Broaden membership RLS** to co-member visibility + a **member-list** API.
- **Remove member** (owner/admin, non-owner targets) and **basic role change**
  (`admin ↔ member`). Owner-role changes are transfer (D5).
- **Service-layer last-owner guard** (refuse removing/demoting the owner). The
  **DB ≥1-owner trigger is deferred to D5** — D2 has no operation that can reach a
  zero-owner state, so the trigger would guard an unreachable case.
- **Email delivery deferred**: invite records + an in-app `notifications` row for
  already-registered targets + the accept link returned from the API. Outbound
  email lands when email infra does.
- **`pending_deletion` accounts** refuse invite creation and acceptance.

This is the minimum that makes collaboration real without building delivery,
billing, or UI machinery that has no backing system yet.

---

## Invitation data model

New table `account_invitations` (Q1 → dedicated table + token, **not** direct
membership insert — the invitee may not have an account yet, and we need a
lifecycle + audit):

| Column | Notes |
|--------|-------|
| `id uuid PK` | |
| `account_id uuid` | FK `accounts(id) ON DELETE CASCADE` — invites die with the account. |
| `email citext`/lowercased `text` | the invitee identity (Q2 — keyed on email, not user_id, so a not-yet-registered person can be invited). |
| `role text` | `CHECK (role IN ('admin','member'))` — **owner is never invitable** (owner arrives only via creation or transfer). |
| `token_hash text` | store a **hash** of the opaque token (oauth_states pattern); the raw token rides only in the accept link. `UNIQUE`. |
| `status text` | `CHECK (status IN ('pending','accepted','expired','revoked'))` DEFAULT `pending`. |
| `invited_by_user_id uuid` | FK `auth.users ON DELETE SET NULL` (provenance). |
| `expires_at timestamptz` | e.g. `now() + 7 days`. |
| `accepted_by_user_id uuid` | who accepted (nullable). |
| `accepted_at` / `revoked_at` / `created_at` | timestamps. |

- **Partial unique index** `(account_id, lower(email)) WHERE status='pending'` —
  at most one live invite per email per account (Q11).
- **RLS:** owner/admin of the account `SELECT` invites for their account (to list
  pending). All writes service-role (the routes go through service-role services,
  matching the no-client-write rule for account tables). The invitee does **not**
  read invites via RLS — the accept endpoint resolves by token, service-role.
- **Data API GRANTs** per the post-Oct-2026 rule (authenticated SELECT, service_role
  full).

---

## Invite lifecycle

```
create (owner/admin, account active)
   → pending ──accept(token, email match, account active)──> accepted (+ membership)
        │
        ├── revoke (owner/admin) ─────────────────────────────> revoked
        └── expires_at < now / swept ─────────────────────────> expired
```

- **pending** → the only acceptable state.
- **accepted** → terminal; membership row created; re-accept by the same user is a
  no-op.
- **revoked** → owner/admin cancelled it; token no longer accepts.
- **expired** → past `expires_at`; computed at accept time (refuse) and optionally
  flipped by a lightweight sweep/cron (not required for correctness — accept
  checks `expires_at` directly).

---

## Acceptance flow

`POST /api/invitations/accept { token }` (authenticated):
1. **Auth required** — the user must be signed in. If they don't have an account
   yet, they sign up / log in first; the token is carried in the URL across
   signup (Q2: invite-then-signup-then-accept works).
2. Service-role: resolve invite by `token_hash`. Refuse if not found / not
   `pending` / `expires_at < now` (mark `expired`) / account not `active`.
3. **Email match (security):** the authenticated user's verified email must equal
   the invite `email` (case-insensitive). This binds the invite to an identity
   without pre-creating the user and stops one user accepting another's invite.
4. Insert `account_memberships(account_id, userId, role)` (role from the invite).
   The personal-invariants trigger is a no-op (team account). Idempotent: if the
   membership already exists, no-op.
5. Mark invite `accepted` (`accepted_by_user_id`, `accepted_at`).
6. **Auto-activate** the joined account via `setActiveAccount(userId, accountId)`
   (Q13 → yes; the user just chose to join it).
7. Return the joined account summary.

---

## Role model and permissions

Launch RBAC is deliberately tiny (Q7) — roles gate **member management only**;
**all members have full workflow/integration access within the account** (no
per-resource ACL, per canonical "accounts default to uniform membership-gated
access"):

| Capability | owner | admin | member |
|------------|:-----:|:-----:|:------:|
| Build / edit / run workflows; connect integrations; view runs | ✅ | ✅ | ✅ |
| Invite admin/member; revoke invites | ✅ | ✅ | ❌ |
| Remove a **non-owner** member; change a non-owner's role (admin↔member) | ✅ | ✅ | ❌ |
| Change/remove the **owner**, transfer ownership | ✅ (D5) | ❌ | ❌ |
| Manage billing, delete account, upgrade to org | ✅ | ❌ | ❌ |

- **admin cannot** touch the owner or (per canonical) another admin's role — D2
  enforces "admin may only manage members with role `member`" to keep it simple;
  admin-manages-admin can be revisited if needed.
- Workflow/integration/billing-run permissions are **unchanged** by role at launch
  — the account membership (any role) is the access grant; Phase C billing already
  charges the account, not the actor.

Invitable roles (Q4): **admin and member only.** Who can invite (Q5): **owner +
admin.** Role changes (Q6): **yes, basic admin↔member** in D2 (cheap, supported by
the permission model); owner-role changes are transfer (D5).

---

## Who can invite / manage roles

- A single **permission helper** — `requireAccountRole(userId, accountId,
  allowed: Role[])` — resolves the caller's role via
  `accountMemberships.getRole` and 403s if not in `allowed`. Every
  invite/member-management route calls it first. This is the launch authorization
  surface; it is membership-role-based, server-side, on every request (canonical
  contract).
- Invite/revoke/remove/role-change → `allowed = ['owner','admin']`, with the
  service additionally refusing **owner targets**.
- Member-list read → any member of the account.

---

## RLS and membership visibility changes

- **Broaden** `account_memberships_select_self` → `account_memberships_select_co_member`
  (Q8): a member sees **all membership rows of accounts they belong to** (the
  canonical "same-account membership EXISTS join"). Needed for the member list.
  Replace the self-only policy in the D2 migration.
  ```
  USING (EXISTS (SELECT 1 FROM account_memberships m
                 WHERE m.user_id = auth.uid()
                   AND m.account_id = account_memberships.account_id))
  ```
- `accounts_select_member` already lets co-members read the account row — no
  change.
- `account_invitations` gets its own owner/admin-SELECT policy (above).
- Membership writes stay service-role (no client INSERT/UPDATE/DELETE policy).

---

## Last-owner invariant strategy

- **Personal:** unchanged (personal-invariants trigger).
- **Team/org (Q9, Q10):** the invariant is "**≥1 `owner` membership at all
  times**." In D2 it is **unviolable**: invites are admin/member only, owner role
  is never assigned or removed, and remove/role-change refuse owner targets. So:
  - **D2 = service-layer guard only** — `removeMember` / `changeRole` refuse when
    the target is the account's owner, returning a clear error.
  - **DB-enforced ≥1-owner trigger ships in D5** (transfer/leave), the first slice
    that can actually demote/remove an owner. Building the trigger now would guard
    an unreachable state.

---

## Active-account behavior on accept

- On successful accept, **auto-activate** the joined account (`setActiveAccount`)
  — the user just opted in (Q13). Reuses the 11d foundation (membership + freeze
  re-checked; the membership row was just committed service-role).
- The visible switcher is still D3; until then "active" only changes bare-path
  resolution server-side.

---

## Pending-deletion behavior

(Q14) The freeze composes with invitations via explicit checks:
- **Create invite** → refuse if the account is `pending_deletion` (non-operational).
- **Accept invite** → refuse if the account is `pending_deletion` (you can't join a
  frozen account); the invite simply fails at accept time — no proactive sweep
  needed.
- A frozen account's pending invites become effectively void (unacceptable while
  frozen; consumed/expired on the normal lifecycle). No new freeze surface.
- Invites die with the account (`ON DELETE CASCADE`) at purge.

---

## Email delivery strategy

(Q15) **Deferred — D2 creates records, not emails.** V2 has no transactional email
infra. D2:
- Creates the invite + accept token; **returns the accept link** from the create
  API (a future D3 UI shows "copy invite link").
- For an invitee **who already has an account** (email matches an existing user),
  inserts an in-app **`notifications`** row ("You've been invited to <team>") with
  the accept deep-link — reusing existing infra.
- **Outbound email** (for not-yet-registered invitees) lands when email infra is
  built (its own slice). The token + link are email-ready; only the transport is
  missing.

This mirrors the project's backend-first pattern (payments deferred, switcher UI
deferred) — ship the durable mechanism, defer external delivery.

---

## API / service strategy

Routes (all explicit-account-id in path; `requireAccountRole` first):
- `POST /api/accounts/[id]/invitations` (owner/admin) — create `{ email, role }`.
- `GET /api/accounts/[id]/invitations` (owner/admin) — list pending.
- `DELETE /api/accounts/[id]/invitations/[inviteId]` (owner/admin) — revoke.
- `POST /api/invitations/accept` (authenticated) — accept `{ token }`.
- `GET /api/accounts/[id]/members` (any member) — member list.
- `DELETE /api/accounts/[id]/members/[userId]` (owner/admin, non-owner) — remove.
- `PATCH /api/accounts/[id]/members/[userId]` (owner/admin, non-owner) — role change.

Services (service-role writes):
- `services/accounts/invitations.ts` — `createInvitation` / `revokeInvitation` /
  `acceptInvitation` (token + email match + freeze + auto-activate).
- `services/accounts/membership.ts` — `listMembers` / `removeMember` /
  `changeMemberRole` with the **last-owner / owner-target guard**.
- `services/accounts/accountAuthz.ts` — `requireAccountRole(userId, accountId,
  allowed)` (the single permission chokepoint).

Repos:
- `repositories/accountInvitations.ts` — CRUD + token-hash lookup.
- extend `repositories/accountMemberships.ts` — insert (non-owner) / delete /
  update-role / list-by-account (already exists).
- token hashing reuses whatever `oauth_states` uses (crypto hash).

---

## UI strategy

- **No visible UI in D2** (backend behind a flag, like D1). The accept route works
  via the returned link; in-app notifications surface invites to existing users.
- **D3** ships the visible surface: invite form, member list, pending-invite
  management, and a friendly accept page — alongside the deferred switcher UI.

---

## Test plan

Unit / route:
- Create invite: owner ✅, admin ✅, member → 403, non-member → 403; duplicate
  pending (same email) → 409; invite to an existing member → 409; `role='owner'`
  → 400 (not invitable); frozen account → refuse.
- Accept: valid token + email match → membership + accepted + auto-activate;
  wrong email → 403; expired → refuse (marked expired); revoked → refuse; already
  a member → idempotent no-op; frozen account → refuse; unauthenticated → 401.
- Revoke: owner/admin ✅, member → 403; revoked token no longer accepts.
- Member list: co-member can read (RLS); non-member → empty/403.
- Remove member: owner/admin removes a member ✅; removing the **owner** → refuse
  (last-owner guard); member → 403.
- Role change: admin↔member ✅; targeting the owner → refuse.
- Permission helper `requireAccountRole`: each allowed/denied combination.

Gated DB:
- Broadened RLS: a co-member sees teammates' membership rows; a non-member sees
  none.
- `account_invitations` accepts the role/status CHECKs; partial unique index
  blocks a second pending invite for the same email; `ON DELETE CASCADE` clears
  invites when the account is deleted.

---

## Implementation slice breakdown

- **D2a — Invitations.** `account_invitations` migration (+RLS/GRANTs/index) +
  `accountInvitations` repo + `invitations` service + `accountAuthz` helper +
  create/list/revoke/accept routes + in-app notification on create. No member
  removal / role change yet.
- **D2b — Membership management.** Broaden membership RLS to co-member +
  member-list API + remove-member + admin↔member role change + the service-layer
  last-owner/owner-target guard.
- **(D3) Visible UI** — invite form, member list, accept page, switcher.
- **(D5) Transfer + leave** — owner transfer, member leave, **DB ≥1-owner
  trigger**, transfer-then-delete in the deletion guard.
- **(Email infra slice) Outbound delivery** — wire transport; invites already
  carry tokens/links.
- **(Payments track) Paid seats** — per-seat/seat-count billing, if/when the
  product wants it.

D2a/D2b can land together if small; each is independently green.

---

## Risks / open questions

- **No email infra.** Confirm D2 ships **records + in-app notifications + returned
  link**, with outbound email as a later slice. (Recommended.)
- **admin-manages-admin.** D2 restricts admin to managing `member`s only (not
  other admins). Confirm that's acceptable for launch vs. canonical's "admin can
  change non-owner roles" (which includes other admins). Recommendation: members
  only at launch; revisit.
- **Role change in D2 vs deferred.** Recommended: include admin↔member (cheap).
  Confirm, or push to D2b/D3.
- **DB ≥1-owner trigger timing.** Recommended: D5 (first slice that can violate
  it); D2 uses a service guard. Confirm.
- **Invite to an email with no account.** D2 stores the invite; acceptance waits
  for that person to sign up. Without outbound email they won't know — acceptable
  only because D3/email follow. Confirm the interim is OK (or gate visible invites
  on email infra).
- **Token security.** Store `token_hash` (not raw); single-use; 7-day expiry.
  Confirm expiry window.
- **Don't recreate V1.** Standing guardrail: roles gate member-management only; no
  per-resource ACLs; one ownership root.

---

## Acceptance criteria

- An owner/admin can invite an `admin`/`member` by email; a `member`/non-member
  cannot. `owner` is not invitable.
- An invited person can accept while signed in (sign-up-then-accept works); accept
  requires an **email match**, a `pending` non-expired invite, and an `active`
  account; it creates the membership and **auto-activates** the account.
- Invites have `pending|accepted|expired|revoked`; one live invite per email per
  account; revoke/expire block acceptance.
- Co-members can see each other (broadened RLS + member-list API).
- Owner/admin can remove a non-owner member and change a non-owner's role
  (admin↔member); the **owner can never be removed/demoted** (service guard) —
  the DB ≥1-owner trigger lands in D5.
- `pending_deletion` accounts refuse invite creation + acceptance.
- **No outbound email** in D2 (records + in-app notification + returned link);
  **no visible UI**; **no transfer/leave**; **no payments**.
- Permissions are membership-role-based, verified server-side on every request;
  account stays the single ownership root; no per-resource ACLs / V1 workspace
  complexity introduced.
