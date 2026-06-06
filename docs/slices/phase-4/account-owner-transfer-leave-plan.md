# 4.ACCOUNT-MODEL-TRANSFER-LEAVE-1 — Owner Transfer + Leave Team Plan

**Type:** Planning / design only. No code, migrations, tests, or UI in this slice.
**Date:** 2026-06-04
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state):**
[services/accounts/membership.ts](../../../services/accounts/membership.ts) ·
[services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts) ·
[services/accounts/offboardingImpact.ts](../../../services/accounts/offboardingImpact.ts) ·
[repositories/integrations.ts](../../../repositories/integrations.ts) ·
[repositories/accounts.ts](../../../repositories/accounts.ts) ·
[app/api/account/delete/route.ts](../../../app/api/account/delete/route.ts) ·
[services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) ·
[services/oauth/credentialResolutionContext.ts](../../../services/oauth/credentialResolutionContext.ts) ·
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) ·
[supabase/migrations/20260530000000_accounts_and_memberships.sql](../../../supabase/migrations/20260530000000_accounts_and_memberships.sql) ·
[supabase/migrations/20260531000010 (role CHECK relax)](../../../supabase/migrations/) ·
[supabase/migrations/20260531000012_account_memberships_co_member_rls.sql](../../../supabase/migrations/20260531000012_account_memberships_co_member_rls.sql)

> **Planning only.** This proposes the Team/Business **owner-transfer** and **leave-team**
> model and breaks the work into slices. Nothing here is built. It deliberately reuses the
> **already-shipped** member-removal offboarding (soft-disconnect of personal Team credentials)
> and the workflow-impact warning rather than inventing new mechanisms.

---

## 1. Context

Team accounts, invitations, member management, Team workflow support, credential scoping,
member-removal offboarding warnings, and workflow folders/trash are all in place locally
(closeouts: [team-account-launch-closeout.md](./team/team-account-launch-closeout.md),
[team-workflows-closeout.md](./team/team-workflows-closeout.md),
[team-credential-access-closeout.md](./team/team-credential-access-closeout.md),
[account-deletion-flow-closeout.md](./account-model/account-deletion-flow-closeout.md),
[workflow-folders-trash-plan.md](./workflow-folders-trash-plan.md)). The major remaining Team
account lifecycle gap is **owner transfer / leave Team**.

What already exists and this plan builds on:

- **Roles** `owner | admin | member` ([contracts/accounts.ts](../../../contracts/accounts.ts),
  enforced by the `account_memberships_role_check` CHECK). Rank is implicit: owner > admin > member.
- **Member management** ([services/accounts/membership.ts](../../../services/accounts/membership.ts)):
  `removeMember`, `changeMemberRole`, `getMemberWorkflowImpact`, all behind a shared `gateTarget`
  (frozen-account refuse, **owner untouchable**, admins-can't-manage-admins). `changeMemberRole`
  **only allows `admin↔member`** — it cannot create or remove an owner. So transfer needs a NEW
  service path; it is not expressible with today's role-change.
- **Authorization** ([services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts)):
  `requireAccountRole(userId, accountId, allowed[])` is the route chokepoint.
- **Offboarding on removal** ([services/accounts/membership.ts:removeMember](../../../services/accounts/membership.ts)):
  calls `softDisconnectPersonalForMember` (sets `integrations.disconnected_at`, personal providers
  only) **before** deleting the membership, then clears the user's active-account pointer.
- **Workflow-impact warning** ([services/accounts/offboardingImpact.ts](../../../services/accounts/offboardingImpact.ts)):
  `countImpactedWorkflowsForMember(accountId, targetUserId)` counts non-deleted workflows
  `createdByUserId === target` that contain ≥1 personal-provider node.
- **Creator-pinned execution** ([services/execution/engine.ts](../../../services/execution/engine.ts) +
  [services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts)): personal-provider
  steps resolve credentials by the workflow's `created_by_user_id` with **no co-member fallback**.
- **Deletion guard** ([app/api/account/delete/route.ts](../../../app/api/account/delete/route.ts)):
  blocks deleting a personal account while the user owns any team/org account
  (`code: ACCOUNT_HAS_OWNED_TEAMS`, 409), because `accounts.owner_user_id → auth.users ON DELETE
  RESTRICT` would otherwise block the user purge. The guard comment literally says *"Until ownership
  transfer ships (Phase E), deleting those accounts is the only resolution."* — this slice is that
  Phase E.

---

## 2. Current model / known limitations

- **No transfer path.** `changeMemberRole` is hard-limited to `admin↔member`; owner is untouchable.
  There is no way to move `owner` from one user to another.
- **No leave path.** There is no self-service "leave account" route at all; only owner/admin-driven
  `removeMember`.
- **Sole-owner trap.** An owner cannot be removed or demoted, and cannot delete their personal
  account while they own a team/org (deletion guard). With no transfer, a sole owner is stuck.
- **≥1-owner invariant is service-only for team/org.** The DB trigger
  `account_memberships_enforce_personal_invariants` enforces exactly-one-owner **only for personal
  accounts**; for team/org it is a no-op. The team/org ≥1-owner guarantee currently rides entirely
  on the "owner untouchable" service rule + service-role-only writes (no client write policies on
  `account_memberships`). The migration comment notes this was *"deferred to D5."*
- **`owner_user_id` ↔ owner-membership coupling is implicit.** `accounts.owner_user_id` and the
  `role='owner'` membership row are kept consistent only by convention (account creation writes both);
  nothing enforces they stay in sync.
- **Creator-pinned workflows break when a creator leaves.** After offboarding soft-disconnects the
  leaver's personal credentials, their personal-provider workflow steps fail with the existing clear
  *"the workflow owner has no active &lt;provider&gt; connection"* error — no silent fallback. Transfer
  of ownership does **not** change `created_by_user_id`, so this is independent of owner transfer.

---

## 3. Product decisions (locked for this slice)

- An account must **always have at least one owner** — enforced at the **DB layer** (new trigger),
  not just the service layer, shipped together with transfer/leave.
- **Launch single-owner.** Exactly one owner per account at launch; `accounts.owner_user_id` stays
  authoritative and must equal the one `role='owner'` membership. The DB invariant is written as
  **"≥1 owner"** so multi-owner can be enabled later **without** a schema rewrite.
- **Owner transfer updates both** `accounts.owner_user_id` **and** the `account_memberships` roles
  of the old and new owner, **atomically** (one RPC / one transaction).
- **Transfer target must already be a member** of the account (admin or member). Non-members must be
  invited + accept first (existing invitation flow).
- **Old owner becomes `admin`** by default after transfer, unless they choose **"transfer and leave"**
  (then they are removed via the existing offboarding path).
- **Owner transfer requires step-up auth** (reuse the password re-auth step-up the account-deletion
  route already performs).
- **Transfer is owner-initiated and immediate** for V1 (see Risks for the accept-based alternative).
- A **sole owner cannot leave** until ownership is transferred. Non-owner members and admins **can
  leave freely**.
- **Leave reuses removal offboarding** verbatim: soft-disconnect personal Team credentials, clear the
  active-account pointer, and surface the workflow-impact warning **before** the user confirms.
- **Workflow `created_by_user_id` is NOT changed** by ownership transfer. Workflow-creator transfer /
  per-node credential reassignment is a **separate future track** (not this slice).
- **Billing / usage / ledgers are unaffected.** Transfer/leave touch neither
  `task_billing_events`, usage counters, nor any Stripe object.

---

## 4. Recommended owner model

**Invariant: every team/org account has ≥ 1 `role='owner'` membership, and
`accounts.owner_user_id` references one of those owners.**

- **Single-owner at launch.** Product surfaces exactly one owner. Transfer moves it.
  `accounts.owner_user_id` == the single owner membership's `user_id`.
- **Multi-owner is a future toggle.** Because the DB invariant is "≥1 owner" (not "==1 owner"),
  enabling co-owners later is additive: relax the service-layer "single owner" assumption and add a
  "grant owner / revoke owner" path. No migration to the invariant is needed. In a multi-owner world
  `accounts.owner_user_id` becomes the *primary/billing owner* pointer (still must reference an owner
  membership) — out of scope now, but the shape doesn't preclude it.
- **Personal accounts are unchanged** — their existing exactly-one-owner trigger stays; transfer/leave
  are team/org-only operations (a personal account has no other members to transfer to or leave).

Why not multi-owner now: it multiplies the gating matrix (who can demote whom, last-owner races,
UI for owner lists) for little launch value. Single-owner + transfer covers every real need
(hand-off, departure) with one well-tested path.

---

## 5. Transfer behavior

**Operation:** `transferOwnership(accountId, fromOwnerUserId, toUserId, { leave })`.

Preconditions (all refuse with a typed reason, mirroring `MemberMgmtReason`):

1. Account is **team/org** and **not frozen** (`deletion_status = 'active'`).
2. Caller is the **current owner** (`requireAccountRole(['owner'])` **and** caller == `owner_user_id`).
3. **Step-up** re-auth verified (same mechanism as account deletion).
4. `toUserId` is an **existing member** of the account and is **not** the current owner.

Effect (single atomic RPC / transaction):

- Set `accounts.owner_user_id = toUserId`.
- Set `account_memberships.role = 'owner'` for `(accountId, toUserId)`.
- Set `account_memberships.role = 'admin'` for `(accountId, fromOwnerUserId)` — **unless** `leave`.
- If `leave === true`: run the **existing offboarding** for the old owner instead of demoting them —
  `softDisconnectPersonalForMember` → `removeMembershipServiceRole` → clear active pointer. (Allowed
  here precisely because ownership has already moved, so the ≥1-owner invariant still holds.)

Notes:

- The DB ≥1-owner trigger must treat the swap as valid **within** the transaction (the new owner row
  is written before/with the old owner's demotion). The transfer RPC is the *only* sanctioned way to
  change `owner_user_id` + owner roles together; ad-hoc role updates remain blocked by the trigger.
- Transfer never touches workflows, credentials of other members, folders, billing, or `created_by_user_id`.
- Emit a structured audit log (`event: "account.owner.transferred"`, `from`, `to`, `leave`) consistent
  with the existing offboarding `console.info` JSON events.

---

## 6. Leave behavior

**Operation:** `leaveAccount(accountId, userId)` — self-service; the caller acts on themselves.

Preconditions:

1. Account is team/org (you cannot "leave" your personal account; that's deletion).
2. Caller is a **member** of the account.
3. Caller is **not the sole owner**. A sole owner is refused (`reason: 'sole_owner_must_transfer'`)
   and the UI routes them to **Transfer ownership** (optionally "transfer and leave").
   - Non-owner members and admins: always allowed.
   - In single-owner launch, "owner who is not sole owner" cannot occur; the path is reserved for the
     future multi-owner world (an owner may leave iff ≥1 other owner remains).

Effect (reuses removal offboarding **exactly**):

- `softDisconnectPersonalForMember({ accountId, connectedByUserId: userId })` (personal providers only).
- `removeMembershipServiceRole(accountId, userId)`.
- `clearActiveAccountIfMatchesServiceRole(userId, accountId)`.

Pre-leave UX: surface the **workflow-impact warning** for the leaving user (count of their own
personal-provider workflows that may stop). This needs a **self-scoped** impact read — see §11; the
existing `getMemberWorkflowImpact` gate refuses an owner target and is owner/admin-gated, so a thin
self variant calling `countImpactedWorkflowsForMember(accountId, selfUserId)` is required.

---

## 7. Credential / offboarding behavior

- **Leave == Remove**, credential-wise. Both call the same `softDisconnectPersonalForMember`
  ([repositories/integrations.ts](../../../repositories/integrations.ts)): only **personal**-class
  providers ([core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts)
  `isPersonalCredentialProvider`) connected by that user in that account get `disconnected_at` stamped;
  account/service credentials (Slack/Notion/Stripe/…) are untouched (they belong to the team).
- **Transfer-without-leave does NOT disconnect anything.** Demoting the old owner to admin keeps them a
  member, so their personal Team credentials stay active and their workflows keep running.
- **Transfer-and-leave** disconnects the old owner's personal Team credentials exactly like removal.
- Idempotency is inherited: the `disconnected_at IS NULL` guard makes a repeated disconnect a no-op.

---

## 8. Workflow creator / personal-provider implications

- **`created_by_user_id` is provenance, not ownership** (workflows are account-owned). Ownership
  transfer **does not** rewrite it (locked, Q16).
- **Consequence of leaving:** any workflow the leaver created that uses a personal-provider node will,
  after their personal credential soft-disconnects, fail at run time with the existing explicit error
  (*"the workflow owner has no active &lt;provider&gt; connection — Connect &lt;provider&gt; to run this
  workflow"*; [services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts)). There is
  **no silent fallback** to another member's credential — by design. The pre-leave/pre-remove count
  warns about exactly these.
- **Transfer (no leave)** has **no** workflow-execution impact: the old owner stays a member, so their
  creator-pinned credentials remain resolvable.
- **Mitigations are a separate future track (Q17, deferred):** workflow-creator reassignment, per-node
  credential re-pinning, or explicit credential-sharing. None are implemented here; the plan only
  documents the breakage and the warning. This is the honest current limitation.

---

## 9. Account deletion interaction

- The deletion guard stays — owning a team/org still blocks personal-account deletion
  (`ACCOUNT_HAS_OWNED_TEAMS`, 409). But its **remediation changes**: once transfer ships, the message
  becomes *"Transfer or delete the team/organization accounts you own before deleting your personal
  account,"* and the response should ideally include the owned accounts (id + name) so the UI can deep-link
  each to **Transfer ownership** or **Delete account**.
- After a user **transfers away** every team/org they own (or deletes them), `listOwnedTeamOrgAccountIds`
  returns empty and personal-account deletion proceeds unchanged.
- No change to the deletion freeze/purge lifecycle itself.

---

## 10. DB invariants / RLS / security

**Add the ≥1-owner invariant at the DB layer when transfer/leave ships (Q20 = yes, DB-enforced).**
Service-layer alone is insufficient once a self-service leave and a role-swapping transfer exist —
both can race or be bypassed by any future direct writer.

**New trigger(s) on `account_memberships` (team/org accounts only; personal stays on its existing trigger):**

- **BEFORE DELETE:** refuse if the deleted row is the **last** `role='owner'` membership for the account
  (`reason: would_orphan_account` / stable error prefix for tests). This protects leave/remove.
- **BEFORE UPDATE:** refuse a role change **away from `owner`** if it would drop the last owner
  (protects any demotion path).
- **Consistency:** keep `accounts.owner_user_id` pointing at an actual `role='owner'` membership.
  Options: (a) a trigger on `accounts` UPDATE that asserts the new `owner_user_id` has an owner
  membership; and/or (b) require all `owner_user_id` changes to go through the transfer RPC, which writes
  the owner membership in the same transaction. Recommend **both** (defense in depth), evaluated against
  the existing `account_memberships_enforce_personal_invariants` precedent.

**Q21 — events/tables the trigger must cover:** `account_memberships` DELETE + UPDATE (role) for the
last-owner guard; `accounts` UPDATE (owner_user_id) for the consistency guard. The transfer RPC is
`SECURITY DEFINER`, service-role-invoked, and performs the multi-row write atomically so the trigger
sees a consistent end state.

**RLS:** unchanged. `account_memberships` keeps co-member SELECT visibility
([20260531000012](../../../supabase/migrations/20260531000012_account_memberships_co_member_rls.sql)
`is_account_member`) and **no client write policies** — transfer/leave writes stay service-role only
behind authenticated routes. No new table needs RLS in this slice (an optional audit table, if added,
gets owner/admin SELECT + service-role write, per the Data-API GRANT rule).

**Security:** transfer is owner-only + step-up; leave is self-only; both refuse on frozen accounts.
The transfer RPC must be unreachable from the anon/authenticated Data API (service-role only) so it
can't be invoked to escalate a member to owner outside the gated route.

---

## 11. API surface

All routes account-scoped via the existing `requireUserWithAccount` / `requireAccountRole` helpers;
no account-scoped URLs.

| Method + path | Purpose | Auth |
|---|---|---|
| `POST /api/accounts/[id]/transfer-ownership` | Body `{ targetUserId, leave?: boolean, stepUp:… }`. Atomic owner swap; old owner → admin or removed. | current **owner** only + **step-up** |
| `POST /api/accounts/[id]/leave` | Caller leaves the account. Refuses sole owner with a transfer hint. | self (any **member**); sole-owner refused |
| `GET /api/accounts/[id]/leave-impact` *(or reuse)* | Self-scoped workflow-impact count for the leaving user (thin variant over `countImpactedWorkflowsForMember(accountId, self)`). | self (member) |
| `GET /api/account/delete` guard *(updated copy)* | Existing route: extend the `ACCOUNT_HAS_OWNED_TEAMS` payload with owned `{id,name}[]` + transfer-or-delete wording. | self-serve owner |

Typed client wrappers in [lib/api/accounts.ts](../../../lib/api/accounts.ts) (`transferOwnership`,
`leaveAccount`, `getLeaveImpact`) consistent with the existing `lib/api/accounts.ts` patterns. No new
backend behavior beyond these already-planned routes.

---

## 12. UI expectations (later slice; not built here)

- **Team page** ([features/team/…](../../../features/team/)): an owner-only **Transfer ownership**
  action — member picker (admins/members of this account), a **"transfer and leave"** checkbox, and a
  step-up prompt. Confirmation summarizes "X becomes owner; you become admin (or leave)."
- **Leave team** button for members/admins; for a sole owner it is disabled/replaced with "Transfer
  ownership to leave." Leave confirmation shows the **workflow-impact warning** ("N workflows you
  created use personal connections and may stop running").
- **Deletion-guard error** surfaces the owned-account list with **Transfer** / **Delete** CTAs per account.
- No explicit credential-sharing UI; no creator-reassignment UI (both out of scope).

---

## 13. Test plan (later slices)

**Transfer (service + RPC):**
- Atomic: `owner_user_id` + both roles change together; partial failure rolls back.
- Target must be an existing member; non-member / current-owner target refused.
- Old owner → admin by default; `leave:true` removes old owner via offboarding (soft-disconnect runs).
- Only the current owner can initiate; admin/member refused; frozen account refused.
- Step-up required (missing/invalid step-up refused).
- `created_by_user_id` of all workflows unchanged after transfer.

**Leave (service + route):**
- Non-owner member and admin can leave; offboarding runs (personal creds soft-disconnected, active
  pointer cleared); account/service creds untouched.
- Sole owner refused with `sole_owner_must_transfer`.
- Self-scoped leave-impact returns the creator's personal-provider workflow count.

**DB invariant (migration / integration):**
- Cannot DELETE the last owner membership (leave/remove of last owner blocked at DB).
- Cannot UPDATE the last owner's role away from owner.
- `accounts.owner_user_id` cannot be set to a non-owner; stays consistent after transfer.
- Personal-account invariant unchanged (regression).

**Deletion guard:** updated message/payload (owned accounts listed); deletion proceeds after all
owned team/orgs are transferred away or deleted.

**Security/RLS:** non-members can't transfer/leave others; transfer RPC unreachable from Data API;
co-member SELECT visibility unchanged.

**Regression:** existing `membership` (remove/changeRole/impact), offboarding soft-disconnect,
account-deletion, and creator-pin suites stay green.

---

## 14. Implementation slice breakdown (proposed; none built here)

- **TL-1 — DB invariants + transfer RPC.** ≥1-owner trigger on `account_memberships` (DELETE + role
  UPDATE) for team/org; `owner_user_id` consistency guard on `accounts`; `transfer_ownership` RPC
  (`SECURITY DEFINER`, atomic owner_user_id + role swap). Migration + repository wrappers + repo types.
- **TL-2 — Transfer service + route.** `transferOwnership` service (owner-only, step-up, member-target,
  old-owner admin|leave) reusing offboarding for the leave variant; `POST /api/accounts/[id]/transfer-ownership`;
  `lib/api/accounts.transferOwnership`.
- **TL-3 — Leave service + route.** `leaveAccount` reusing the removal offboarding sequence; sole-owner
  block; self-scoped leave-impact (`countImpactedWorkflowsForMember` self variant);
  `POST /api/accounts/[id]/leave` + `GET …/leave-impact`.
- **TL-4 — Deletion-guard remediation.** Extend `ACCOUNT_HAS_OWNED_TEAMS` payload (owned `{id,name}[]`)
  and wording to "transfer or delete."
- **TL-5 — UI.** Team-page Transfer ownership + Leave team + confirmations + impact warning + deletion-guard CTAs.
- **TL-6 — Tests.** Woven into TL-1..TL-5 (service unit, migration/integration for the trigger, route, UI).

Suggested order: **TL-1 → TL-2 → TL-3 → TL-4 → TL-5** (TL-6 alongside each). TL-1/2/3 deliver the
lifecycle; TL-4 unblocks the deletion dead-end; TL-5 makes it usable.

---

## 15. Risks / open questions

1. **Immediate vs accept-based transfer (Q6).** V1 recommends **immediate** (target is already a member,
   owner-initiated, step-up). But ownership carries an obligation — the new owner then **cannot delete
   their own personal account** until they transfer/delete this one (deletion guard). An **accept-based**
   flow (invite-to-own → recipient accepts) is safer and avoids surprise obligations. **Open product
   decision:** ship immediate now and add accept-based later, or start accept-based? Recommendation:
   immediate for launch with a clear confirmation to the recipient afterward; revisit if it surprises users.
2. **Multi-owner now or later (Q4).** Recommended single-owner launch with a ≥1-owner DB invariant so
   co-owners are additive later. Confirm we don't need co-owners at launch (e.g., Business accounts).
3. **Creator-pinned workflows break on leave (Q18).** Documented, warned, **not mitigated** here. Confirm
   it's acceptable that a leaver's personal-provider workflows stop until a future creator-reassignment /
   sharing track ships. This is the single biggest UX sharp edge.
4. **Step-up availability (Q5).** Account deletion uses password re-auth; confirm OAuth-only users have a
   viable step-up (the deletion flow already faces this — reuse whatever it settled on).
5. **Should transfer offer creator-reassignment inline?** Tempting to batch "transfer ownership **and**
   reassign the departing owner's workflows," but that's the deferred creator-transfer track. Keep separate.
6. **owner_user_id semantics under future multi-owner.** It becomes a "primary owner" pointer; make sure
   TL-1's consistency guard is written so multi-owner relaxation doesn't require rewriting it.

---

## 16. Acceptance criteria (for the eventual build, not this doc)

- An account always has ≥1 owner, enforced by a DB trigger (team/org) in addition to the service layer.
- A current owner can transfer ownership to an existing member, with step-up; the swap of
  `accounts.owner_user_id` + old/new `account_memberships.role` is atomic; `created_by_user_id` is unchanged.
- The old owner becomes admin by default, or is offboarded (personal creds soft-disconnected) if
  "transfer and leave" is chosen.
- A sole owner cannot leave; they are routed to transfer. Non-owner members and admins can leave; leaving
  reuses the removal offboarding and surfaces the creator's workflow-impact count first.
- The personal-account deletion guard points users to **transfer or delete** owned team/orgs, and
  deletion proceeds once none are owned.
- No bulk/owner changes leak through the Data API; transfer RPC is service-role only; RLS unchanged.
- Billing/usage/ledgers, folders/trash, workflow execution authorization, and credential-sharing rules
  are unaffected; no creator-reassignment, no explicit credential-sharing UI, no account-scoped URLs,
  no Stripe.

---

## Report summary

- **Owner model:** every team/org account keeps **≥1 owner** (new DB trigger); **launch single-owner**
  with `accounts.owner_user_id` authoritative; ≥1 invariant leaves room for future co-owners with no
  schema rewrite.
- **Transfer:** owner-only + **step-up**, target must already be a member; one atomic RPC swaps
  `owner_user_id` **and** old/new `account_memberships.role`; old owner → **admin** by default or
  **removed** on "transfer and leave"; `created_by_user_id` untouched; no credential/billing impact
  (except the leave variant's offboarding).
- **Leave:** self-service for non-sole-owners (members/admins); **sole owner blocked → must transfer**;
  reuses the **existing** removal offboarding (personal-credential soft-disconnect + active-pointer clear)
  and surfaces the creator workflow-impact warning first.
- **DB invariant recommendation:** add the **≥1-owner** guard at the DB **now** (with transfer/leave),
  on `account_memberships` DELETE + role-UPDATE for team/org, plus an `accounts.owner_user_id`↔owner-membership
  consistency guard; transfer goes through a `SECURITY DEFINER` service-role RPC. Don't rely on the
  service layer alone once self-service leave exists.
- **Slice breakdown:** TL-1 DB invariants+RPC → TL-2 transfer service/route → TL-3 leave service/route →
  TL-4 deletion-guard remediation → TL-5 UI (TL-6 tests alongside).
- **Open product decisions:** (1) immediate vs accept-based transfer + the recipient inheriting the
  delete-blocking obligation; (2) single- vs multi-owner at launch; (3) accepting that a leaver's
  personal-provider workflows stop until the deferred creator-reassignment/sharing track; (4) step-up
  method for OAuth-only users.
