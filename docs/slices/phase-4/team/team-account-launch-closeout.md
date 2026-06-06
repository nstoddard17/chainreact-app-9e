# 4.TEAM-ACCOUNT-LAUNCH-CLOSEOUT — Team Page + Account Model Launch Checklist

**Type:** Closeout / launch checklist / handoff. **Docs only** — no source, schema,
migrations, or tests in this slice.
**Date:** 2026-06-02
**Branch:** `builder-ui-v1-audit-1` (all arcs below landed locally; nothing pushed)
**Supersedes nothing — consolidates:** the account-model, deletion, switcher, team, and
credential closeouts into one launch-readiness source-of-truth.

> **Read this first.** The Team page + account model launch foundation is **complete
> locally**. **Team workflow builder support is intentionally the *next* track and is NOT
> part of this closeout.** This document is a checklist and handoff — not implementation.
> **Update (2026-06-03):** the credential-consistency arc that previously gated the Team
> workflow builder is now **complete** (22D-1 `9abab5385`, 22D-2 `57116df28`, 22D-3
> `a209e3996`); broad Team workflow work is **unblocked** (see §5, §8, §9).

---

## 1. Status / summary

- **Team / account launch foundation: COMPLETE locally.** Account ownership cutover,
  billing/usage rescope, deletion lifecycle, active-account foundation, Team creation,
  invitations, membership management, member-limit guard, account-switcher
  API/client foundation, Team page UI, member-identity display, settings alignment, and
  the Team credential access audit + execution/offboarding fixes have all landed on
  `builder-ui-v1-audit-1`.
- **Team workflow builder support is intentionally next, not included here.** It is gated
  on the builder/options/AI credential-consistency work (22D-1/2/3) — see §6 and §9.
- **This doc is a checklist and handoff, not implementation.** No source, schema,
  migration, or test changes are made by this slice.

---

## 2. Major completed arcs

Commit references are the local arc on `builder-ui-v1-audit-1` (newest → oldest within
each arc). Plan docs are linked where they exist.

### Account ownership / `account_id` cutover
- Plans: [account-model-foundation-plan.md](../account-model-foundation-plan.md),
  [account-id-cutover-plan.md](../account-id-cutover-plan.md)
- Closeout: `70033cbe2` — *4.ACCOUNT-MODEL-CLOSEOUT* (Account Ownership + Billing Rescope arc)
- Every hot/billing table moved to `account_id` ownership; account is the ownership root.

### Account billing / usage rescope
- Plan: [account-billing-rescope-plan.md](../account-billing-rescope-plan.md)
- Folded into the ownership arc closeout `70033cbe2`. Billing/usage now resolve per
  **account** (Free/Personal/Team/Org each billed at the account level).

### Account deletion lifecycle
- Plan: [account-deletion-flow-plan.md](../account-deletion-flow-plan.md) (`1ae3b6a76`)
- `5fa14849e` — 10b: deletion lifecycle + `pending_deletion` freeze
- `1fe4e1abd` — 10c: account purge service + token revoke/delete + cron
- `bd9876c9b` — 10d: ledger anonymization + retention cron
- `d12347dc0` — 10e: self-serve account-deletion request/cancel routes
- Closeout: `c30d783b5` — [account-deletion-flow-closeout.md](../account-model/account-deletion-flow-closeout.md)

### Active-account / account-switcher backend foundation
- Plan: [account-switcher-plan.md](../account-switcher-plan.md) (`74ba3e610`)
- `80f61eb4a` — 11a: `user_profiles.active_account_id` pointer
- `5475ff087` — 11b: active-account resolver + helpers
- `fd3cd24f2` — 11c: wire `requireUserWithAccount` to the resolver
- `cff7a1fa1` — 11d: set-active-account endpoint
- Closeout: `26421b9ec` — [account-switcher-closeout.md](../account-model/account-switcher-closeout.md)

### Team / organization account creation planning
- Plan: `1be545b21` — [team-org-account-creation-plan.md](./team-org-account-creation-plan.md)

### Team creation backend
- `c561467be` — 4.ACCOUNT-MODEL-13: team account creation backend

### Team invitations backend
- Plan: `445466382` — [team-invitations-roles-plan.md](./team-invitations-roles-plan.md)
- `f235beac3` — 4.ACCOUNT-MODEL-15 (D2a): team invitations backend

### Team membership management backend
- `0cb324536` — 4.ACCOUNT-MODEL-16 (D2b): membership management backend

### Team member-limit guard
- Plan: `61dcffe97` — [team-member-limit-plan.md](./team-member-limit-plan.md)
- `059c61c80` — 4.ACCOUNT-MODEL-20: team member-limit guard (cap = 5 incl. owner)

### Account-switcher API / client foundation
- Plan: [team-ui-switcher-plan.md](./team-ui-switcher-plan.md) (`01f168296`)
- `86df1bc8b` — 4.ACCOUNT-MODEL-18: account-switcher API + client foundation

### Team page UI
- `cbd6ebc5c` — 4.TEAM-PAGE-1: Teams / account management page

### Member identity display
- `322fc5e01` — 4.TEAM-PAGE-2: co-member display identity for roster
- `a443fe588` — 4.TEAM-PAGE-2 follow-up: name-on-top / email-underneath rows

### Team settings visual alignment
- `ba91dda81` — 4.TEAM-PAGE-3: role clarity + read-only settings shell
- `152b5ebf7` — 4.TEAM-PAGE-4: settings sub-nav + design-faithful primitives
- `22dadd9a8` — Team page full-width (drop centered `max-w-6xl`)

### Team credential access audit / fixes / closeout
- `6b1f96d38` — 21: integration credential access audit
  ([team-integration-credential-access-audit.md](../team-integration-credential-access-audit.md))
- `dc1171922` — 22A: provider credential-sharing classification
- `244e0c4d9` — 22B: provenance-pin personal credentials in Team workflows (execution)
- `13e325dcb` — 22C: offboarding soft-disconnect for personal credentials
- `33541cba0` — 22D: builder/options/AI credential-consistency **plan** (no code)
  ([team-credential-consistency-builder-ai-plan.md](./team-credential-consistency-builder-ai-plan.md))
- `f8bc354c6` — closeout: [team-credential-access-closeout.md](./team-credential-access-closeout.md)

---

## 3. Current product behavior (user-facing today)

- **Every user has a Personal account.**
- **A user can create Team accounts.**
- **Team is separate from Personal** — a Team is its own account, not a wrapper above
  Personal.
- **Personal is never converted into Team.** Creating a Team makes a new account.
- **A Team can later upgrade into an Organization using the same `account_id`** — but the
  **org upgrade is not built** (account type would flip in place; preserve `account_id`).
- **Team member limit = 5 total members, including the owner.**
- **No per-seat billing at launch.**
- **Team members do not need Personal Pro** to participate in a Team.
- **Free / Personal / Team / Org billing remains per account.**
- **The Team page exists at `/team`.**
- **The Team page supports:** account switching / create-Team, invites via copy-link,
  pending invites, member roster, role changes / removal, a settings sub-nav, and a
  roles/access explanation.
- **Not built (see §7):** outbound invite email, billing / Stripe / paid Team plans,
  transfer / leave, account-scoped URLs.

---

## 4. Current role rules

- **Owner** — full account authority today: can invite, revoke invites, and
  remove / change role of **non-owner** members. (Transfer / leave: later.)
- **Admin** — can invite and manage members only; **cannot** manage owners or other admins.
- **Member** — can use the Team workspace but cannot manage people.
- **Roles gate member management only** — not workflow / integration access.
- **All Team members can use Team workflows / integrations / runs**, subject to account
  membership.

---

## 5. Current credential / security rules

- **Team workflows belong to the Team account.**
- **Personal OAuth providers are NOT team-shared by default**
  (Gmail / Outlook / Drive / Calendar / Dropbox / Discord / …).
- **Account / service providers are account-shared** (Slack / Notion / Stripe / Shopify /
  HubSpot / Mailchimp).
- **Unknown / unclassified providers default to personal** (fail-safe).
- **Execution pins personal credentials to the workflow creator** (`created_by_user_id`,
  22B) — no silent fallback to a co-member's credential; a missing creator credential
  fails clearly.
- **A removed member's personal Team credentials soft-disconnect** on member removal
  (22C); account/service credentials and the member's own personal-account integrations
  are untouched.
- **Builder options, AI options, and AI context now enforce the same policy** (22D-1
  `9abab5385`, 22D-2 `57116df28`, 22D-3 `a209e3996`): account providers resolve the
  workflow account (shared); personal providers are creator-pinned and creator-only; a
  non-creator editor gets a typed `NOT_WORKFLOW_OWNER` (options) / redacted
  `ownerControlled` state (AI); co-member personal credentials are **never used,
  surfaced, or enumerated**; a missing creator credential reports `OWNER_MUST_CONNECT` /
  `ownerMustConnect`.
- **Team workflow builder support is no longer blocked on credential policy** — it is
  enforced. (See [team-credential-access-closeout.md](./team-credential-access-closeout.md).)

Authoritative policy + classification table:
[team-credential-access-closeout.md](./team-credential-access-closeout.md).

---

## 6. Launch checklist

Run the §10 commands to confirm the green items before any push / PR.

| Item | Status |
|------|--------|
| Typecheck green (`npm run typecheck`) | ☐ verify before push |
| Lint green (`npm run lint`) | ☐ verify before push |
| Structure lint green (`npm run lint:structure`) | ☐ verify before push |
| Migration RLS lint green (`npm run lint:migrations`) | ☐ verify before push |
| Full Jest green (`npx jest`) | ☐ verify before push |
| Migrations applied to dev DB | ☐ verify (account-model + deletion + switcher + team + credential migrations) |
| Gated DB tests (account deletion / ledger / identity / RLS) passed where applicable | ☐ verify if DB creds available |
| Purge crons default-OFF | ✅ deletion-purge cron ships disabled by default |
| Ledger purge cron default-OFF | ✅ ledger anonymization/retention cron ships disabled by default |
| No Stripe / payment behavior accidentally added | ✅ none added (paid Team / Stripe is deferred — §7) |
| No outbound email accidentally added | ✅ none added (invite email is deferred — §7) |
| No org upgrade / transfer / leave accidentally added | ✅ none added (deferred — §7) |
| No account-scoped URL scheme accidentally added | ✅ none added (deferred — §7) |
| Team member cap enforced before UI exposure | ✅ member-limit guard (`059c61c80`) precedes Team page UI |
| Credential sharing policy documented + enforced across execution/offboarding/builder/AI | ✅ 22A/22B/22C + 22D-1/2/3 shipped (`9abab5385` / `57116df28` / `a209e3996`) |

> ☐ = must be confirmed by running §10 in this checkout (status not asserted by this
> docs-only slice). ✅ = behavioral invariant already established by the landed arcs.

---

## 7. Known launch limitations / deferred

Intentionally **not** built for this launch:

- **Outbound invite email** — invites are copy-link only today.
- **Paid Team / Stripe / Personal Pro downgrade flow.**
- **Organization upgrade** (Team → Org; must preserve `account_id` when built).
- **Owner transfer / leave Team.**
- **DB ≥1-owner trigger** (database-level guarantee that an account always has ≥1 owner).
- **Account-scoped URL scheme.**
- **Team workflow builder support** (UI/UX) — the credential policy it depends on is now in
  place (22D-1/2/3); the builder surface itself is the next track.
- **Active-account connect-path decision** — does connecting a provider while a team is active
  land on the team account or stay personal? (Prerequisite for *useful* personal-provider
  connections in a team context; the policy is safe either way.)
- **Explicit credential-sharing UI** (per-node connection ownership + owner opt-in).
- **Per-resource roles / ACLs** — intentionally **not planned** for launch.
- **Team rename** — not currently supported (if confirmed unsupported, treat as deferred).
- **Team deletion / transfer details** — beyond the existing account-deletion lifecycle
  (§2), Team-specific deletion/transfer affordances are not built.

---

## 8. Must-not-regress guardrails

- **The account remains the ownership root.**
- **Team and Organization are account *types*, not parent objects above accounts.**
- **A Personal account never auto-converts to Team / Org.**
- **Team → Organization upgrade must preserve `account_id`.**
- **No silent double-charging.**
- **Team members do not require Personal Pro.**
- **No per-seat billing at launch.**
- **The credential-sharing policy must stay enforced** across execution, builder options, AI
  options, and AI context (22A/22B/22C + 22D-1/2/3). Specifically, DO NOT: reintroduce a
  co-member fallback for personal providers; let options/AI surface another member's personal
  label/email/resource metadata to a non-creator; or change the unknown-provider default away
  from **personal**. (The active-account flip already shipped *with* this policy — that is why
  the prior "do not flip options/AI" blocker is lifted.)

---

## 9. Recommended next work after closeout

- **Next track after this closeout: Team workflow support (builder UI/UX).** The
  credential-consistency prerequisite is **done** — 22D-1 `9abab5385`, 22D-2 `57116df28`,
  22D-3 `a209e3996` (see [team-credential-access-closeout.md](./team-credential-access-closeout.md)).
- **Recommended starting points for the Team workflow track:**
  1. **Team workflow builder surface** — expose the builder for team-account workflows, relying
     on the now-enforced options/AI policy (non-creator editors get typed owner-gated states for
     personal-provider config; account providers resolve the shared team credential).
  2. **Active-account connect-path decision** — where a new OAuth connection lands when a team is
     active (team account vs personal). Unblocks *useful* personal-provider connections in a team.
  3. **Explicit credential-sharing UI** (later) — per-node connection ownership + owner opt-in,
     so collaborative personal-provider editing becomes first-class.
- The credential policy is no longer a blocker — but it **must not regress** (see §8).

---

## 10. Verification commands (run before final local push / PR)

```bash
npm run typecheck
npm run lint
npm run lint:structure
npm run lint:migrations
npx jest                       # full suite
# relevant gated DB suites if DB credentials are available
#   (account deletion / ledger anonymization / identity / RLS)
git status --short             # confirm clean / intended changes only
git log --oneline              # sanity-check local arc order matches §2
```

---

## Status

- **Team / account launch foundation: COMPLETE locally** (account ownership, billing
  rescope, deletion, switcher foundation, Team creation/invites/membership, member-limit
  guard, Team page UI, credential execution + offboarding fixes).
- **Team workflow builder support: NOT STARTED — intentionally next**, gated on
  22D-1/2/3.
- **This closeout: docs only.** No source, schema, migration, or test changes.
</content>
</invoke>
