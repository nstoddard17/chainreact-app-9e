# 4.ACCOUNT-MODEL-19 — Team Member Limit Plan

> **Type:** Planning doc only. No source, migrations, or tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Defines the launch member-limit rule for Team accounts before the D3
> invite/member UI exposes invitations broadly. Implementation is a small backend
> guard slice (4.ACCOUNT-MODEL-20), planned at the end.

Source of truth:
[`team-invitations-roles-plan.md`](./team-invitations-roles-plan.md),
[`team-org-account-creation-plan.md`](./team-org-account-creation-plan.md); D2a
`f235beac3`, D2b `0cb324536`.

---

## Context

D2a/D2b made invites + membership real but **unbounded** — a team can grow to any
size. Before the D3 UI invites people at scale, the product needs a launch cap.
ChainReact does **not** charge per seat at launch (billing is account/usage-based),
so the cap is a **plan-capability rule**, not a billing meter: a Team includes a
limited number of members; an Organization (same `account_id`, reached via the
future upgrade) is required for more.

This slice fixes the rule; a small backend guard slice enforces it before any UI
ships.

---

## Current state (what the rule will hook into)

- **Members** live in `account_memberships` (one row per member; owner included).
- **Pending invites** live in `account_invitations` (`status='pending'`).
- The invite flow is `services/accounts/invitations.ts` —
  `createInvitation` / `acceptInvitation`. Membership mgmt is
  `services/accounts/membership.ts`.
- No count/limit exists today. The guard needs cheap counts:
  `count(account_memberships WHERE account_id=…)` +
  `count(account_invitations WHERE account_id=… AND status='pending')`.

---

## Locked product direction (restated)

- No per-seat charging at launch; Team billing is account/usage-based.
- Team includes a limited number of members. **Launch limit: Team = up to 5.**
- Organization is required for 6+ members.
- Team upgrades in place to Organization (same `account_id`) — future.
- Paid-team / seat billing remain deferred to the payments track.

---

## Policy decisions (answers Q1–Q9)

1. **Team max = 5 total members, INCLUDING the owner** (Q1). The cap is on
   `account_memberships` row count — owner + admins + members ≤ 5.

2. **Pending invites count toward the limit** (Q2). The effective "seats used" =
   `accepted members + pending invites`. This stops an owner from blasting 50
   invites against a 3-person team and over-filling it as they accept.
   → **seatsUsed = count(memberships) + count(pending invites)**.

3. **Enforce on invite creation AND re-check on accept** (Q3):
   - **Create:** refuse when `seatsUsed + 1 > 5` (the new pending invite would
     exceed the cap).
   - **Accept:** re-check `count(memberships) < 5` *before* inserting the new
     membership. Re-checking on accept is what makes (2) safe even as pending
     invites expire/revoke (freeing slots) or drift — accept is the only moment a
     real seat is consumed.

4. **At limit → `409 TEAM_MEMBER_LIMIT_REACHED`** (Q4), on both create and accept.
   The message names the cap and points at Organization (see Q5).

5. **Yes — surface an upgrade hint** (Q5): the error/message reads *"Teams are
   limited to 5 members. Organization accounts support larger teams (coming
   soon)."* It does **not** link a flow — org upgrade isn't built — so it's
   informational, not a dead CTA. The D3 UI renders this as a non-actionable
   notice for owners/admins.

6. **Hard-block at 5 — no admin/beta override** (Q6). An override is a bypass to
   maintain, test, and reason about, and the cap is trivially bumpable centrally
   (one constant) if beta feedback demands it. Hard-block is simpler and
   correct; a constant change (not a per-account override) is the escape hatch.

7. **Team only; Organization is EXEMPT** (Q7). The guard applies to
   `type='team'`. `type='organization'` is not capped (orgs support 6+). Since org
   upgrade isn't exposed yet, no org accounts exist — the exemption is
   forward-compatible (the upgrade flow, when built, lifts the cap by flipping
   `type`). `personal` is single-member and irrelevant.

8. **A central constant / policy helper for now — NOT plan/billing metadata**
   (Q8). e.g. `TEAM_MAX_MEMBERS = 5` in a small `services/accounts/memberLimits.ts`
   (or `lib/accounts/memberLimits.ts`) with a `teamMemberLimitFor(accountType)`
   helper that returns the cap (`team` → 5, `organization` → `Infinity`/null,
   `personal` → 1). **TODO:** when paid plans + org upgrade ship, move the cap into
   plan policy (per-plan limits keyed off `account_billing`/plan) — the helper is
   the single seam to change.

9. **Bypass-resistance tests (Q9):**
   - **Multiple pending invites can't bypass:** create counts pending invites, so
     the 6th outstanding seat (members + pending) is refused at creation.
   - **Accept re-check:** when `count(members) == 5`, an accept of a still-pending
     invite is refused `TEAM_MEMBER_LIMIT_REACHED` (covers the case where invites
     were created before a slot filled by another path).
   - **Revoked/expired invites free slots:** after revoke/expire, a new invite is
     allowed again.
   - **Org exempt:** an organization account is not capped.
   - **Concurrency (documented soft limit):** two concurrent accepts could each
     pass the non-atomic re-check and land at 6. See Concurrency below — at launch
     this off-by-one is acceptable (soft cap, low-traffic beta); the test asserts
     the *sequential* re-check blocks, and the doc records the race + hardening
     path.

---

## Where the limit is enforced

- `createInvitation` (D2a): after the existing guards (owner-role, frozen,
  already-member), add the seat check for `type='team'` accounts → refuse with
  `team_member_limit_reached` when `seatsUsed + 1 > cap`.
- `acceptInvitation` (D2a): before inserting the membership, re-check
  `count(members) < cap` for `type='team'` → refuse `team_member_limit_reached`.
- The route maps the new reason to `409 TEAM_MEMBER_LIMIT_REACHED`.

The account `type` is read alongside the existing `getDeletionStatusServiceRole`
lookup (or via `getByIdServiceRole`), so the guard is `type`-aware (team-only).

---

## Constant / policy helper

```
// services/accounts/memberLimits.ts
export const TEAM_MAX_MEMBERS = 5;            // incl. owner
export function memberLimitFor(type): number | null  // team→5, organization→null (uncapped), personal→1
```
Counts come from two cheap service-role `count` queries (members + pending
invites) — add `countMembersServiceRole(accountId)` +
`countPendingInvitesServiceRole(accountId)` (or `head:true, count:'exact'` selects)
rather than listing rows.

---

## Concurrency

The create-time check and the accept-time re-check are **read-then-write**, not
atomic. Edge cases:
- **Multiple pending invites:** fully closed by counting pending invites at create
  time — they can't collectively exceed the cap.
- **Concurrent accepts of two different pending invites:** both could read
  `count==4`, both insert → 6. This is a genuine race, but bounded (off-by-one per
  concurrent burst) and low-probability at beta scale.

**Launch decision:** accept the soft cap (re-check on accept closes the common
case; the rare concurrent-accept off-by-one is tolerable). **Hardening path (if
strictness is ever required):** a `BEFORE INSERT` trigger on `account_memberships`
that counts existing rows for a `team` account and raises when ≥ cap (atomic under
the row lock), OR a `SELECT … FOR UPDATE` on the `accounts` row inside the accept
transaction. Documented now; not built at launch.

---

## Deferred / TODO

- Paid-plan-driven limits (move the cap into plan policy keyed off `account_billing`).
- Organization upgrade (lifts the cap by flipping `type`).
- Per-account custom limits / enterprise overrides.
- Atomic DB-trigger enforcement (only if the soft cap proves insufficient).
- Seat billing (payments track).

---

## Implementation slice (next — small backend guard, before D3 invite/member UI)

**4.ACCOUNT-MODEL-20 — Team Member Limit Guard** (backend-only, no UI):
- `services/accounts/memberLimits.ts` — `TEAM_MAX_MEMBERS` + `memberLimitFor(type)`.
- Repo counts — `countMembersServiceRole` / `countPendingInvitesServiceRole`.
- `createInvitation` seat guard (team-only) → `team_member_limit_reached`.
- `acceptInvitation` re-check (team-only) → `team_member_limit_reached`.
- Route maps → `409 TEAM_MEMBER_LIMIT_REACHED` (+ the upgrade-hint message).
- Preserve existing teams already at/over the cap (the guard blocks *new* additions
  only; it never removes anyone).
- Tests: at-limit create refused; pending invites counted; accept re-check; revoke
  frees a slot; org exempt; sequential bypass blocked.

---

## Risks / open questions

- **Existing over-limit teams.** No team can exceed 5 today (created in D1, no bulk
  add), but the guard must **never** retroactively remove members — it only blocks
  *new* invites/accepts. Confirm: a team somehow at 6 stays operational; just can't
  grow.
- **Owner-counts-as-1.** Confirm 5 includes the owner (recommended) vs 5 + owner.
  Recommendation: **5 total incl. owner.**
- **Concurrency soft cap.** Confirm the off-by-one tolerance at launch vs investing
  in the DB trigger now. Recommendation: soft cap now.
- **Upgrade-hint copy** references a not-yet-built Organization upgrade — confirm
  "coming soon" wording is acceptable (no dead CTA).

---

## Acceptance criteria

- A Team is capped at **5 total members including the owner**; the cap counts
  **accepted members + pending invites**.
- Invite creation is refused when it would exceed the cap; invite acceptance
  re-checks and is refused when the team is already full — both `409
  TEAM_MEMBER_LIMIT_REACHED` with an Organization upgrade hint.
- Revoked/expired invites free seats; **Organization accounts are exempt**;
  personal accounts are unaffected.
- The cap is a single central constant/helper (not billing metadata), with a TODO
  to move into plan policy when paid plans / org upgrade ship.
- Existing teams under (or at) the cap keep working; **no member is ever removed**
  by the guard; **no UI, payments, or org-upgrade** behavior is added.
