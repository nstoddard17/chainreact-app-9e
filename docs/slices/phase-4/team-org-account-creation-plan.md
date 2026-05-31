# 4.ACCOUNT-MODEL-12 — Team / Organization Account Creation Plan

> **Type:** Planning doc only. No migrations, no source, no tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Plans Phase D team/org account creation. Implementation deferred to
> its own slices; paid-team billing deferred to the payments track.

Source of truth: [`account-ownership-model.md`](../../rules/account-ownership-model.md)
(canonical — §"Account types", §"Personal vs team/org creation", §"Membership and
role rules", §"Owner transfer and leaving" already fix most of this),
[`account-model-closeout.md`](./account-model-closeout.md),
[`account-deletion-flow-closeout.md`](./account-deletion-flow-closeout.md),
[`account-switcher-closeout.md`](./account-switcher-closeout.md).

---

## Context

Phases B/C made every asset account-owned; the deletion arc (10) gave accounts a
freeze/purge lifecycle; the active-account arc (11) gave a durable resolver +
set-active endpoint. The data model has been account-scoped from day one
*specifically so that adding team/org accounts is purely additive* — no rescope
of existing rows, no schema churn on hot tables (account-model-closeout, "Launch
scope"). This plan is the first concrete step on that additive path: how a user
creates a second, non-personal account.

The canonical rule already decided the *shape*: team and organization are
**account types**, not new ownership roots. A team workflow and a personal
workflow are the same row with a different `account_id`. This plan must not
re-litigate that, and must actively **resist recreating V1's workspace/team/org
complexity** — there is exactly one ownership root (`accounts.id`), reached
through `account_memberships`, forever.

---

## Current account foundation

Verified against the migrations on this branch.

- `accounts.type` is `CHECK (type IN ('personal'))` — **commented "relaxed in
  Phase D"**. `account_memberships.role` is `CHECK (role IN ('owner'))` — same.
- `accounts_one_personal_per_user` is a **partial** unique index
  (`WHERE type = 'personal'`) — already forward-compatible: a user may own many
  team/org accounts, only one personal.
- Personal-account invariants trigger enforces "a `personal` account has exactly
  one membership, owned by `owner_user_id`, role `owner`." Scoped to
  `type='personal'`, so team/org rows are unaffected.
- `accounts.owner_user_id → auth.users(id) ON DELETE RESTRICT` — **the gate.** A
  user cannot be deleted while they own any account. Today that is only their
  personal account (torn down last in the 10c purge). **Once a user can own
  team accounts, this FK blocks user-deletion until those teams are gone** — see
  Account deletion interaction.
- Writes to `accounts` / `account_memberships` have **no client INSERT/UPDATE/
  DELETE policies** — every write goes through the SECURITY DEFINER signup trigger
  or a service-role helper (`ensurePersonalAccountServiceRole`). Reads:
  `accounts_select_member` (members see their accounts),
  `account_memberships_select_self` (a member sees only their own row —
  "Phase D will broaden this").
- `account_billing(account_id)` holds per-account plan/quota; seeded at signup for
  the personal account. **No Stripe/payment behavior exists yet** (closeouts:
  "No Stripe / payment implementation").
- Active-account: `resolveActiveAccount` / `setActiveAccount` /
  `POST /api/account/active` (11b–11d). `accounts.listForUser` already lists every
  account a user belongs to (the switcher read).

---

## Locked product decisions (restated)

- Account is the single ownership/billing/security/usage root.
- personal/team/organization are **account types**, not separate ownership roots.
- "Create Team" creates a **separate** team account; it never converts the
  personal account.
- A paid Personal user starting a paid Team is **explicitly offered**: keep
  Personal Pro + start Team, **or** downgrade Personal to Free + start Team. **No
  silent double-charge.**
- Billing is per account (personal/team/org each bills its own workflows).
- A Team is later **upgradeable in place** to an Organization — same `account_id`,
  workflows, integrations, members, billing history.
- Personal accounts never auto-convert to team/org.

---

## Recommended launch scope

**Phase D launch = "a user can own a second, separately-billed account that can
later gain members and become an org." Build the backend first; defer visible UI
until invitations exist; ship team creation on the FREE plan only.**

Concretely, what the first wave ships:
- **Model all three types + all three roles in the schema now** (one CHECK relax
  each) — cheap, avoids a second migration, matches the canonical role set.
- **Ship Team creation backend** (service-role create + owner membership + free
  billing init + auto-activate) behind an authenticated route. **No visible UI**
  in the first slice (mirrors the 11-arc: foundation first, UI after invitations).
- **Organization = upgrade-from-Team only** initially (in-place type flip).
  Create-new-org is deferred (at launch org behaves identically to team, so a
  from-scratch org adds a label and no capability).
- **Invitations deferred to the next slice.** A team without invitations is still
  useful as a *separately-billed second workspace* (see "Invitation strategy").
- **Paid teams + the Personal-Pro keep/downgrade flow are DEFERRED to the payments
  track** — they cannot be built before Stripe/payments exist. Teams launch on the
  free plan.

This is deliberately the minimum that is *correct and additive*, and it refuses to
build collaboration/billing machinery that has no backing system yet.

---

## Team account creation rules

What happens on "Create Team" (Q1):
1. **Validate**: authenticated user; non-empty `name`; `type` ∈ {team}
   (organization via upgrade only at launch).
2. **Insert `accounts`** row: `type='team'`, `name`, `owner_user_id = creator`.
   Service-role write (no client INSERT policy), mirroring
   `ensurePersonalAccountServiceRole`.
3. **Insert owner `account_memberships`**: `(account_id, creator, role='owner')`.
4. **Init `account_billing`**: free plan defaults (same shape the signup trigger
   seeds for personal). No Stripe customer created (payments deferred).
5. **Auto-activate** (Q13 → yes): `setActiveAccount(creator, newAccountId)` so the
   user lands in the new team's context — matches Linear/Notion "create workspace
   → switch into it." The set-active endpoint (11d) already does the membership +
   freeze check.
6. **Return** the new account summary `{ id, name, type }`.

A user may create **multiple** team accounts (the personal-only unique index does
not constrain them). The personal account is **untouched** — same workflows,
integrations, billing, still switchable-to.

`accounts.type` values allowed (Q2): **now** `'personal'` (existing) +
`'team'` + `'organization'` (relax the CHECK). The creation *route* accepts
`'team'` only at launch; `'organization'` is reachable solely via upgrade.

---

## Organization account rules

- At launch an organization is **behaviorally identical to a team** (canonical
  §account types). The only differences are the `type` label and the *future*
  option of internal groups/departments/projects **inside** the org account (a
  sub-layer below the account — never a new root above it).
- **No create-new-organization at launch** (Q9). It would add a label and zero
  capability. Organizations are reached only by **upgrading a Team** (below).
- When the internal-grouping capability is eventually built, it attaches *inside*
  an org account; it does not change ownership. Explicitly out of this plan.

---

## Team → Organization upgrade rules

- **In-place type flip** (Q8): `UPDATE accounts SET type='organization' WHERE
  id=…` — **same `account_id`**, so all workflows, integrations, runs, members,
  billing history, and account-owned data carry over with zero migration. This is
  exactly why type is a column on the single root, not a separate object.
- **Owner-only**, service-role, audit-logged. Requires step-up auth (same class as
  destructive role actions).
- **One-way** (team → org). No org → team downgrade at launch (no use case; avoids
  a reversibility matrix).
- Personal accounts are **never** upgrade targets (the route refuses
  `type='personal'` sources).
- Ships as its own slice (D4), after creation + invitations.

---

## Personal account billing interaction

The headline correctness rule: **no silent double-charge** — but also **this
cannot be implemented until the payments track exists.**

- **Launch reality:** teams are created on the **free plan**. A free team + a paid
  Personal account never double-charge because the team is free. So the
  keep-vs-downgrade decision **does not arise at launch**.
- **Designed (deferred) paid flow (Q10):** when a paid Personal user starts a
  *paid* Team, the UI presents an explicit choice **before** any charge:
  - **Keep Personal Pro + start Team** → two paid subscriptions, **two Stripe
    customers** (one per account; canonical §billing: "Stripe customer ID is
    attached to the account, not the user"). The user knowingly pays twice.
  - **Downgrade Personal to Free + start Team** → one paid subscription (the team).
- **"Downgrade Personal to Free" operationally (Q11):** move the personal
  account's `account_billing.plan` to free (cancel/downgrade the personal Stripe
  subscription per the payments track's proration policy — typically at period end
  to avoid clawback complexity), then start the team's paid subscription. The
  personal account **keeps all its workflows/integrations/runs**; it loses
  Pro-tier quota/features going forward. No data is moved between accounts.
- **Hard dependency:** all of the above requires Stripe/subscription machinery that
  does not exist. **Defer paid-team billing + the keep/downgrade flow to the
  payments track**; document the decision tree now so the payments slice inherits
  it. Launch ships free teams only.

---

## Roles and memberships

- **Model the full role enum now** (Q5): relax `account_memberships.role` CHECK to
  `('owner','admin','member')` — the canonical launch role set
  (owner=full control, admin=manage members/integrations/workflows minus
  ownership/billing/delete, member=build/run/connect). One migration, no churn
  later.
- **But assign only `owner` until invitations + role management ship.** The
  creation slice inserts the creator as `owner`; admin/member are inert literals
  until D2. This avoids building role-assignment UI before there is anyone to
  assign roles to (anti-V1-complexity).
- Broaden `account_memberships_select_self` → "a member can see co-members of the
  same account" only when invitations land (D2) — not needed for an owner-only
  team.

---

## Owner invariant

- **Personal:** unchanged — the existing personal-invariants trigger guarantees
  exactly one owner.
- **Team/org (Q4):** invariant = "**at all times ≥1 membership with role='owner'**."
  - **Creation** trivially satisfies it (creator = owner).
  - The invariant is only *violable* once you can remove or demote members — which
    requires invitations + role management (D2) and leave/transfer (D5). So the
    **enforcement trigger** (block removing/demoting the last owner; DB CHECK/
    trigger + service-layer re-validation) ships with the **leave/transfer slice
    (D5)**, not the creation slice.
  - Until then, an owner-only team cannot lose its owner except via account
    deletion (which removes the whole account).

---

## Invitation strategy

- **Defer invitations from the first creation slice** (Q6). Bundle them as the
  immediate next slice (D2), and **gate the visible team UI (D3) behind
  invitations** so users never see a team they cannot populate.
- **How a Team differs from "a second personal account" even without invitations
  (Q7):**
  - `type='team'` → **not** bound by the one-personal-per-user index → a user can
    own **many** teams; a personal account is singular and non-deletable-except-
    via-user-deletion.
  - **Separate billing** (`account_billing` per account) — the concrete launch
    value: a freelancer/side-project gets an isolated plan, quota, and (later)
    invoice.
  - Separate integrations/workflows/runs namespace; switchable via active-account.
  - **Upgradeable to org**; **transferable/leavable** later. Personal is none of
    these.
  So a team-without-invitations is a legitimate "separate, separately-billed
  workspace I own" — not a pointless clone of personal. (Open question flagged
  below: whether that standalone value justifies shipping D1's UI before D2.)

---

## Active-account / switcher interaction

- A newly created team immediately appears in `accounts.listForUser` → the
  switcher's list (Q12).
- **Auto-activate on creation** (Q13 → yes): creation calls
  `setActiveAccount(creator, teamId)`. The user's bare-path requests now resolve to
  the team. The 11-arc resolver already handles everything downstream (membership
  verified, freeze-aware).
- The **visible switcher UI stays deferred** to D3 (per the switcher closeout). So
  until D3, "active team" only changes bare-path resolution server-side — invisible
  but correct. No regression to single-account users (they own no team, so nothing
  changes).

---

## Account deletion interaction

- **A team/org `pending_deletion`** behaves exactly like a frozen personal account
  via the existing arcs (Q14): the 11-arc resolver self-heals a frozen *stored*
  active team → falls back to personal; the gate 403s a frozen *explicit* team; the
  10b freeze blocks operational surfaces. **No new freeze logic needed** — team
  creation composes with the deletion lifecycle for free. (The team's own
  request/cancel/purge would reuse the 10b–10e flow, generalized from "personal"
  to "any account the caller owns" — a small extension, not a rebuild.)
- **Critical prerequisite (Q15):** `accounts.owner_user_id → auth.users ON DELETE
  RESTRICT` means **a user who owns a team cannot be deleted until that team is
  gone.** The current 10c purge tears down only the personal account before
  `auth.admin.deleteUser`; it does **not** handle owned team accounts, so once
  teams exist, user-purge would fail the RESTRICT FK. **Before team creation
  ships**, the deletion flow must:
  - **Block personal-account / user deletion at the request layer while the user
    solely owns any team/org account**, with a clear "delete or transfer your
    teams first" message — until ownership transfer (D5) exists, "delete the team"
    is the only resolution.
  - (Once transfer exists) allow transfer-then-delete per canonical §14.
  This guard is a **hard dependency of D1** (or lands in the same slice).
- **Owner-transfer + leave (Q15)** are **Phase E (D5)** — not required to *create*
  a team, but required before the ≥1-owner invariant can be violated and before a
  sole-owner can exit without deleting. The deletion-blocks-on-team-ownership guard
  above is the launch stand-in until transfer ships.

---

## Billing / plan transition rules

- **Launch:** team `account_billing` initialized to **free**; no Stripe customer,
  no subscription, no proration. Reuse the personal-account billing-init shape.
- **Per-account isolation** is already enforced (Phase C): a team's runs bill the
  team's `account_billing`; the user's personal budget is never touched by team
  runs and vice-versa. Creating a team adds a billing row; it changes nothing about
  how existing personal billing computes.
- **Deferred (payments track):** paid team plans, the keep-vs-downgrade decision
  flow, two-Stripe-customers-per-user, proration on personal downgrade. The plan
  above is the spec the payments slice implements.

---

## Schema needs, if any

Additive, small:
1. **Relax `accounts.type` CHECK** → `('personal','team','organization')`.
2. **Relax `account_memberships.role` CHECK** → `('owner','admin','member')`.
3. (D2, not creation) **Broaden `account_memberships_select_self`** → same-account
   co-member visibility.
4. (D5, not creation) **Team/org ≥1-owner invariant trigger.**
5. **No new INSERT/UPDATE policies** on `accounts`/`account_memberships` — team
   creation goes through a **service-role** service (like
   `ensurePersonalAccountServiceRole`), preserving the "no client writes" rule.
6. Confirm the personal-invariants trigger stays scoped to `type='personal'`
   (it does) so team rows are unconstrained by it.

CHECK relaxations are forward-only and safe to apply ahead of code (no row uses the
new literals until the creation service runs).

---

## Service / API strategy

- `services/accounts/createTeamAccount(userId, { name })` — service-role: insert
  account (`type='team'`) → insert owner membership → init free `account_billing` →
  `setActiveAccount`. Mirrors `ensurePersonalAccountServiceRole`. Returns the
  account summary.
- `POST /api/accounts` (authenticated) — validates body `{ name }`, calls the
  service. User id from session only (never body). 400 on bad name; 200 with the
  new account.
- `services/accounts/upgradeTeamToOrganization(userId, accountId)` (D4) — owner +
  step-up; in-place `type` flip; audit-logged.
- **Deletion guard** — extend the deletion request service (10) to refuse when the
  caller solely owns team/org accounts (D1 dependency).
- Reuse: `setActiveAccount` (11d), `accounts.listForUser` (switcher),
  `account_billing` init helper.

---

## UI strategy

- **No visible UI in the creation backend slice (D1).** Behind a flag /
  backend-only, exactly like the 11-arc deferred its switcher.
- **Team-creation modal + switcher UI ship in D3**, *after* invitations (D2), so a
  user never lands in an empty, unpopulatable team.
- Org upgrade UI rides with D4. Role-management UI rides with D2.

---

## Test plan

Unit / integration (mirroring prior arcs):
- Creation: inserts account (`type='team'`) + owner membership + free billing;
  creator is `owner`; returns summary.
- A user may create **multiple** teams (personal-only index does not block).
- Personal account untouched by team creation (workflows/integrations/billing
  intact).
- New team becomes the active account (`setActiveAccount` called).
- Cannot create as another user (user id from session, not body).
- Cross-account isolation: a non-member cannot see/resolve the new team (RLS +
  resolver `not_member`).
- Frozen team behaves per 10b/11 (resolver self-heal / gate 403) — no new logic.
- **Deletion guard:** a user who owns a team cannot request user/personal deletion
  until the team is deleted (the RESTRICT-FK prerequisite).
- (Gated DB) CHECK relaxations accept `team`/`organization` + `admin`/`member`;
  personal-invariants trigger still rejects a second personal membership.

---

## Implementation slice breakdown

- **D1 — Team creation backend.** CHECK relaxations (type + role) + service-role
  `createTeamAccount` + `POST /api/accounts` + free billing init + auto-activate
  **+ the deletion-blocks-on-team-ownership guard**. No UI. (D1 can split the
  deletion guard into D1a if it grows.)
- **D2 — Invitations + roles.** Invite/accept flow (expiring token), role
  assignment (owner/admin/member usable), broaden membership RLS to co-members.
- **D3 — Visible UI.** Team-creation modal + the deferred account switcher UI.
- **D4 — Team → Organization upgrade.** In-place type flip, owner+step-up,
  audit-logged.
- **D5 — Transfer + leave (Phase E).** Owner transfer, member leave, the ≥1-owner
  invariant trigger, transfer-then-delete.
- **(Payments track, separate arc) — Paid teams.** Paid plans, keep-vs-downgrade
  flow, per-account Stripe customers. Blocks on Stripe existing.

D1 is the only slice this plan authorizes detailed design for next; D2–D5 + payments
get their own plan docs.

---

## Risks / open questions

- **Paid teams depend on a payments track that does not exist.** Biggest one.
  Recommendation: launch free teams; do not block team creation on payments.
  **Confirm:** is a free-only team valuable enough to ship before paid tiers?
- **User-deletion vs team-ownership RESTRICT FK** must be resolved *before* teams
  exist, or user purge breaks. The D1 deletion guard is the proposed fix.
  **Confirm** the "block until teams deleted/transferred" stance vs auto-cascading
  owned teams into the user purge.
- **Team-without-invitations value (Q7).** Is a separately-billed solo team worth a
  visible D1, or should visible UI wait for invitations (D3)? Recommendation: wait
  for D3.
- **Org create-new vs upgrade-only.** Recommendation: upgrade-only at launch.
  **Confirm** no product need for from-scratch orgs.
- **Auto-activate UX with no visible switcher.** Until D3, creating a team silently
  changes bare-path scope. Acceptable backend-only, but confirm no surprise.
- **Step-up auth for upgrade/transfer** reuses which mechanism? (Ties to whatever
  admin step-up the product adopts — flagged for D4/D5.)
- **Don't recreate V1.** Standing guardrail: no "workspace" object above accounts;
  org sub-groups live *inside* an org account; one ownership root forever.

---

## Acceptance criteria

- A user can create a **team** account (separate `account_id`, owner membership,
  free billing) without touching their personal account; can create more than one.
- `accounts.type` ∈ {personal, team, organization} and `account_memberships.role`
  ∈ {owner, admin, member} are modeled, with only `team` creatable and only
  `owner` assigned at launch.
- The new team auto-activates and appears in the switcher list; visible switcher /
  creation UI is deferred to D3.
- Organization is reachable **only** by in-place upgrade from a team (same
  `account_id` + all data); no create-new-org at launch.
- Paid-team billing + the Personal-Pro keep/downgrade flow are **designed here and
  deferred** to the payments track; teams launch on the free plan with **no silent
  double-charge** possible (free ⇒ no charge).
- User/personal deletion is **blocked while the caller solely owns a team**, until
  transfer (D5) exists — the RESTRICT-FK prerequisite is closed before teams ship.
- A frozen team composes with the existing 10/11 freeze+resolver behavior with no
  new logic.
- One ownership root (`accounts.id`) is preserved; no V1-style workspace layer is
  introduced.
