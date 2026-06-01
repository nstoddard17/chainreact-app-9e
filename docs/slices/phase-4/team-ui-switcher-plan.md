# 4.ACCOUNT-MODEL-17 — Team UI + Account Switcher Plan

> **Type:** Planning doc only. No source, migrations, or tests in this slice.
> **Repo/branch:** ChainReactV2 @ `builder-ui-v1-audit-1`.
> **Status:** Plans Phase D **D3** (first visible Team/Account UI). Outbound email,
> transfer/leave, paid teams, org upgrade, account-scoped URLs all stay deferred.

Source of truth:
[`team-org-account-creation-plan.md`](./team-org-account-creation-plan.md),
[`team-invitations-roles-plan.md`](./team-invitations-roles-plan.md),
[`account-switcher-closeout.md`](./account-switcher-closeout.md); D1 `c561467be`,
D2a `f235beac3`, D2b `0cb324536`.

**Guardrail:** keep D3 launch-scoped. **Do not build a giant admin console.** The
goal is: see/switch accounts · create a team · invite by email + copy link ·
accept links · view/manage members on the D2b backend. Nothing more.

---

## Context

The entire team backend is built and tested but **invisible** — there is no UI
for any of it. The app shell deliberately *excludes* a workspace switcher today
(`AppTopBar` JSDoc: "would be fake on V2 today"), and `UserMenu` notes
"Settings / Billing / Account routes don't exist yet." D3 turns the D1/D2 backend
into the minimum usable surface.

Two codebase constraints shape D3:
- **UI primitive gap.** `components/ui/` has `popover`, `command`, `button`,
  `badge`, `input`, `label`, `select`, `switch`, `textarea` — but **no Dialog,
  Table, Toast, or DropdownMenu.** D3 should prefer **dedicated pages/panels +
  popover/command** over modals, and add at most a tiny primitive or two if truly
  needed (a small inline banner for success/error instead of a toast system).
- **Client API idiom.** Typed wrappers live in `lib/api/*.ts` (ai, runs,
  integrations…). D3 adds `lib/api/accounts.ts` / `invitations.ts` / `members.ts`
  over the existing routes.

---

## Current backend state

- **Accounts:** create team `POST /api/accounts`; set active `POST /api/account/active`;
  resolver + `accounts.listForUser` exist. **No `GET /api/accounts` list route yet**
  (the switcher needs one — small glue, below).
- **Invitations (D2a):** create/list/revoke `…/accounts/[id]/invitations`;
  accept `POST /api/invitations/accept`. Raw token returned **once** at create;
  in-app `account_invitation` notification fires for registered invitees. No
  outbound email.
- **Members (D2b):** list `GET …/members`; remove + role-change (admin↔member)
  `…/members/[userId]`; owner-target/last-owner guard; co-member RLS. The members
  response returns **userId/role/joinedAt only — no email/display name** (needs a
  display-identity extension for a usable roster, below).
- Deferred: outbound email, transfer/leave, DB ≥1-owner trigger, paid teams, org
  upgrade, account-scoped URLs.

---

## Recommended D3 launch scope

The thinnest visible layer that makes teams real:
1. **Account switcher** in the app shell (Personal + Teams), backed by a new
   `GET /api/accounts`; switching calls `POST /api/account/active`.
2. **Create team** from the switcher (small name form) → auto-switch → land on the
   new team's settings/members page (invite-next).
3. **Invite UI** (owner/admin): invite-by-email form → **copyable invite link**
   on success (no email) + pending-invite list with revoke.
4. **Accept-invite page** at `/invitations/accept?token=` with friendly states.
5. **Member list + management** (owner/admin): roster + remove + role-change
   (admin↔member), permission-gated.
6. **Account/team settings page** hosting members + invites (+ the existing
   personal delete flow surface).

Sequenced as **D3a (switch+create) → D3b (invite+accept) → D3c (member mgmt)** so
each is a small, shippable visible slice.

---

## Account switcher UX

- **Where:** a switcher control in the app shell — the `AppTopBar` (left of the
  page-context label) or top of `AppRail`. Trigger shows the **active account
  name** + chevron; built from `popover` + `command` (searchable list, keyboard
  nav for free). (Q1, Q13)
- **List contents:** **Personal + Teams** the user belongs to (Q2). Each row:
  account name + a subtle type badge (`Personal` / `Team`). **Organization needs
  no special-casing** — once a team is upgraded it simply appears with a `Team`→
  `Org` label in the same list.
- **Switch:** clicking a row calls `POST /api/account/active` then refreshes so
  bare-path requests re-resolve to the new active account. The active row shows a
  check.
- **Footer action:** "**+ Create team**" at the bottom (Notion/Linear idiom) → the
  creation form (Q3 — switcher is the primary entry; settings also links to it).
- **Single-account users:** with only a Personal account the switcher can render
  the account name non-interactively (or be hidden) — no empty dropdown.

---

## Team creation UX

- One small form (field: **team name**) reused by the switcher footer and the
  settings link (Q3). Calls `POST /api/accounts`.
- On success the backend **already auto-activates** the team (setActiveAccount).
  The UI **switches to it and navigates to the team's settings/members page** so
  the obvious next step — invite teammates — is right there (Q4). (Bare URLs
  resolve via the now-active account; no account-scoped URL needed.)
- Render as a small inline panel/page, not a modal (no Dialog primitive).

---

## Invite creation UX

- **Owner/admin only.** Form: **email** + **role (admin/member)** → `POST
  …/invitations`.
- **Copyable invite link (Q5, Q6).** The create response returns the raw
  `acceptToken`/`acceptPath` **once**. The success state shows the full accept URL
  with a **Copy** button and a note: *"This link is shown once — copy it now."*
  The owner shares it manually (Slack/email/etc.). Pending-invite rows **cannot**
  re-show the link (token is hashed at rest) — they show email/role/status/expiry
  + **Revoke**; "resend" = create a new invite (future, with email).
- **Existing-user invites (Q7):** D2a already inserts an in-app
  `account_invitation` notification; D3 surfaces it through the existing
  `NotificationBell` with the accept deep-link. No new mechanism. For
  not-yet-registered emails the copy-link is the only channel until outbound email.
- **Pending-invite list:** email · role · status · expires-in · Revoke.

---

## Invite acceptance UX

- Dedicated page `app/invitations/accept/page.tsx` reading `?token=` (Q8).
- **Not signed in →** "Sign in or create an account to join this team," preserving
  the token across the auth round-trip (carry it in the redirect/`next` param).
- **Signed in →** a simple "You've been invited to a team — **Accept**" panel.
  **No invite-detail prefetch** (there is no preview endpoint, and pre-revealing
  the team to a non-matching user is an enumeration risk): accept on click via
  `POST /api/invitations/accept`, then render the result. (Open: a future
  matching-user-only preview endpoint could show the team name first.)
- **On success →** "You've joined **<team>**" + CTA into the team (it
  auto-activated server-side); switch the shell to it.
- **Error states (Q9)** → friendly inline messages mapped from the route codes:
  `INVITATION_EMAIL_MISMATCH` → "This invite was sent to a different address — sign
  in with the invited email" (don't reveal the address); `INVITATION_EXPIRED` →
  "This invite expired — ask an admin for a new one"; `INVITATION_REVOKED` → "This
  invite is no longer valid"; `INVITATION_ALREADY_ACCEPTED` → "Already used";
  `INVITATION_NOT_FOUND` → "Invite not found"; `ACCOUNT_PENDING_DELETION` → "This
  team is unavailable."

---

## Member list and role-management UX

- **Roster** from `GET …/members` (any member can view). Columns: member identity
  · role badge · joined date · row actions.
- **⚠ Display-identity gap (Q10).** The members API returns **userId only** — a
  roster of raw uuids is unusable. D3c must **extend `GET …/members` to include a
  display name** (and/or email) via a service-role users/user_profiles lookup.
  Decide email-vs-display_name (privacy: showing co-members' emails inside a team
  is normal, but confirm). This is the one backend addition member-mgmt UI needs.
- **Actions (owner/admin, non-owner targets):**
  - **Role change** admin↔member → `PATCH …/members/[userId]`.
  - **Remove** → `DELETE …/members/[userId]` with a confirm step (inline confirm,
    not a Dialog).
- **Splits (Q10):** ship member mgmt in **D3c**, after D3a/b. Within D3c, the
  read-only roster + the mutations can land together (small) or roster-first then
  mutations if it grows.

---

## Permission / role UI rules

- **Hide, don't disable (Q11).** Render invite/remove/role-change controls **only**
  for owner/admin; members see a read-only roster with no action affordances.
  Hidden > disabled — disabled controls invite "why can't I?" confusion and hint at
  capabilities the user lacks. (The server enforces regardless; UI is convenience.)
- The **owner row** is always shown but **non-actionable** (no remove/role control)
  so the roster is complete and the owner-untouchable rule is visible.
- An **admin** sees actions on `member` rows only (not on other admins or the
  owner) — mirror the D2b `forbidden_target` rule in what's rendered.

---

## Pending-deletion UI behavior

- A `pending_deletion` account is frozen/non-operational (Q14). In the switcher,
  show it with a **"Pending deletion"** badge; switching into it surfaces a
  **"Cancel deletion"** affordance (the existing 10e `POST /api/account/delete/cancel`)
  rather than normal operation.
- Personal deletion is the only built deletion flow and is **blocked while the user
  owns teams** (D1 guard) — the settings "danger zone" should surface that 409
  (`ACCOUNT_HAS_OWNED_TEAMS`) as "Delete your teams first." Team self-deletion UI is
  **out of D3** (no team-delete backend yet).

---

## Route / page strategy

- **App-shell switcher:** a client island in `AppTopBar` (or `AppRail`) using
  `popover` + `command`. Reads `GET /api/accounts`, writes `POST /api/account/active`.
- **`app/account/` (settings):** reflects the **active** account — general
  (name; rename endpoint is a small open item) + **Members** + **Invites** tabs for
  team accounts; minimal for personal (+ the 10e delete surface). Switching the
  active account changes what `/account` shows.
- **`app/invitations/accept/page.tsx`:** the accept page (`?token=`).
- **Backend glue D3 needs:** `GET /api/accounts` (list the caller's accounts);
  extend `GET …/members` with display identity (D3c). Both read-only/additive.

---

## API usage strategy

- New typed clients: `lib/api/accounts.ts` (`list`, `create`, `setActive`),
  `lib/api/invitations.ts` (`create`, `list`, `revoke`, `accept`),
  `lib/api/members.ts` (`list`, `remove`, `changeRole`) — matching the existing
  `lib/api/*` idiom.
- The switcher + settings fetch on mount and after mutations; reuse the project's
  fetch-with-timeout / retry conventions where present. All mutations re-fetch the
  affected list (optimistic updates optional, not required at launch).

---

## Empty / error / loading states

- **Switcher:** loading skeleton; single-personal-account → just the name; teams
  empty → "+ Create team" is the only extra row.
- **Members:** loading skeleton; (roster never truly empty — at least the owner).
- **Invites:** empty → "No pending invites"; after create → the copy-link success
  panel.
- **Accept page:** loading while accepting; success/error panels per Q9.
- **Errors:** **no toast primitive exists** → use **inline banners** (success/error)
  on each surface, or add one small toast component as foundation. Pick inline
  banners for D3 to avoid new infra.

---

## Accessibility considerations

- Switcher: full keyboard nav + type-ahead (the `command` primitive provides it);
  `aria-label` on the trigger ("Switch account"); active row announced.
- Icon-only buttons (copy-link, remove) get `aria-label`s; copy gives an
  accessible "Copied" confirmation.
- Accept result announced via an `aria-live` region.
- **Light + dark mode** for every new surface + WCAG-AA badge contrast (per the
  CLAUDE.md UI rule); `variant="outline"` for custom badge colors.
- Hidden (not disabled) controls keep focus order clean; confirm-to-remove is
  keyboard-operable.

---

## Test plan

(Implementation slices, not this doc.) RTL component tests:
- Switcher: lists accounts, marks active, switch calls setActive, "+ Create team"
  opens the form; single-account render.
- Create: submit calls create, shows the new team, navigates.
- Invite: form posts, success shows the copy-link once; pending list + revoke;
  member/non-member don't see the invite form (hidden-control rule).
- Accept page: signed-out prompt; signed-in accept success; each error code → its
  friendly message.
- Member list: roster renders identity + role; owner row non-actionable; admin
  sees actions on members only; remove confirm; role-change posts.
- a11y: keyboard nav, aria-labels, light/dark snapshots.
Plus the small backend additions get route tests (`GET /api/accounts`; extended
members response).

---

## Implementation slice breakdown

- **D3a — Switcher + create + switch.** `GET /api/accounts` glue + `lib/api/accounts.ts`
  + app-shell switcher (popover/command) + create-team form + active-account
  switching. Visible accounts.
- **D3b — Invite + accept.** Invite form + copy-link success + pending-invite
  list/revoke (`lib/api/invitations.ts`) + the `/invitations/accept` page with all
  states + NotificationBell deep-link wiring.
- **D3c — Member management.** Extend `GET …/members` with display identity +
  `lib/api/members.ts` + roster + role-change + remove (permission-gated, hidden
  controls).
- **(Deferred)** outbound email (auto-send invites), owner transfer/leave UI, paid
  /seat UI, org-upgrade UI, account-scoped URL scheme + deep-linking, team rename
  (needs a backend endpoint), audit-log UI.

---

## Risks / open questions

- **UI primitive gap.** No Dialog/Table/Toast/DropdownMenu. Recommendation:
  page/panel + popover flows + inline banners; add at most a minimal Dialog if a
  flow truly needs modality. **Confirm** no shadcn Dialog/Toast foundation slice is
  wanted first.
- **Member display identity.** Roster needs email/name; the members API returns
  userId only → D3c backend extension. **Decide** email vs display_name (privacy).
- **`GET /api/accounts` doesn't exist** — small additive read route in D3a.
- **Accept-page preview.** No preview endpoint; accept-on-click avoids enumeration.
  **Decide** whether to add a matching-user-only preview that shows the team name
  pre-accept.
- **Team rename** has no backend endpoint — add a small one in D3 or defer rename.
- **Account-scoped URLs deferred.** Bare URLs resolve via active account; you can't
  deep-link/share a specific account's page yet, and two tabs share one active
  account (the switcher plan's concurrent-tab caveat). **Confirm** that's
  acceptable for D3.
- **Frozen-account UX.** Confirm the switcher should *show* frozen accounts with a
  cancel affordance vs hide them.
- **Don't over-build.** Standing guardrail: no admin console, no bulk ops, no audit
  UI, no per-resource ACL surfaces.

---

## Acceptance criteria

- A user can **see their accounts and switch** the active one from the app shell.
- A user can **create a team** (small name form) and is auto-switched into it.
- An owner/admin can **invite by email**, gets a **copyable invite link** (shown
  once), and can **list/revoke** pending invites; a member/non-member sees no
  invite controls.
- An invited person can **accept via the link** (sign-up-then-accept works), with
  clear wrong-email/expired/revoked/already-member/frozen states.
- An owner/admin can **view the member roster** (with display identity) and
  **remove / change role (admin↔member)** non-owner members; the **owner is never
  actionable**; controls are **hidden** by role.
- `pending_deletion` accounts are clearly surfaced (badge + cancel affordance),
  not silently operable.
- Light + dark, keyboard-accessible, WCAG-AA.
- **No** outbound email, payments, owner transfer/leave, DB ≥1-owner trigger, or
  org-upgrade UI is introduced; account stays the single ownership root.
