# Rule: V2 Account Ownership Model

## Executive summary

In ChainReact V2, **Account** is the permanent owner of every business-critical asset: workflows, integrations, workflow runs, billing/usage, templates, custom providers, and custom nodes. **User** is an actor — a human who accesses one or more Accounts through memberships — and is never itself the owner of business assets.

Every user gets a default **personal account** at signup. Creating a team or organization creates a **new** account of that type; it does **not** upgrade, convert, or transfer the user's personal account. A user simultaneously belongs to their personal account and to any team/org accounts they have been invited to or created.

Workflows can only use integrations from their own account. Billing always charges the account that owns the workflow being run, never the user who clicked Run and never the user who originally authored the workflow. When a user leaves a team/org account, every asset that user created inside that account stays with the account; nothing follows the user out.

This is the canonical ownership model. Every Phase 4+ implementation slice cites this document.

## Why V1 is not the blueprint

V1 attempted a personal/team/org/workspace model but shipped it inconsistently. V2 does not port V1's data model. Specifically:

- **V1's workspace context was localStorage-only.** Active-workspace selection lived in the browser, so the server could not authoritatively answer "which workspace is this request scoped to?" → V2: account selection is server-state, durable per user, gates every API call.
- **V1's signup did not create a workspace row.** New users had a UI selector for workspaces that didn't exist in the database. → V2: signup atomically creates one personal account + one owner membership before the session is issued.
- **V1's workflows had `user_id` plus workspace/billing-scope fields applied unevenly.** Ownership was ambiguous; different code paths checked different columns. → V2: a single `account_id` foreign key is the only ownership column. `user_id` survives only as `created_by_user_id` (provenance, not authority).
- **V1's team/org billing collapsed back to a single `user_profile`.** Plans, packs, overage, and Stripe customer IDs all lived on the user, not the team. → V2: every billing artifact lives on `account_billing(account_id)`.
- **V1's workflow ownership transfer did not exist.** Once a user owned a workflow, the only way to "transfer" it was to copy-paste. → V2: ownership is account-scoped from day one; intra-account author handoff is implicit (any account member with role permits it); inter-account transfer is a deliberate future capability.
- **V1's integrations were sometimes personal and sometimes workspace-shared with no clear rule.** Two users in the same workspace might unknowingly use the same Stripe key, or might each connect their own duplicate. → V2: integrations are always account-owned; the same external identity connected to two different accounts is two separate records.
- **V1's run history was per-user.** A team member could not see runs of workflows authored by a teammate even though both used the same integrations. → V2: runs belong to the workflow's account; any member with sufficient role sees them.
- **V1's authorization checks were asymmetric.** Some endpoints checked `user_id`, some checked workspace membership, some checked both, some checked neither. → V2: every access check resolves through `account_memberships`. RLS enforces it at the database. There is exactly one shape of authorization across the codebase.

V1 is the source of truth for *what users actually use*; V1 is not the source of truth for *how to model ownership*.

## Final V2 ownership decision

> Every workflow, integration, run, billing event, template, custom provider, and custom node has an `account_id`. Access is granted via `account_memberships`. `user_id` survives only as provenance (`created_by_user_id`, `connected_by_user_id`, `triggered_by_user_id`) and never as authority.

The Account is the durable boundary for ownership, billing, security, and data residency. Users come and go; accounts persist. This is the model the rest of V2 (Phase 4 teams/orgs, Phase 7 billing, Phase 6 engine, every future workflow/integration slice) is built against.

## Core entity model

The minimum entity set required for the model to function. Column types are illustrative; the migration template lives in [`database-security.md`](./database-security.md).

- **`accounts`** — `id uuid PK`, `type ('personal'|'team'|'organization')`, `name`, `owner_user_id uuid` (the single root owner — distinct from membership rows; see §13), `created_at`, `updated_at`. One row per account.

- **`account_memberships`** — `account_id uuid FK accounts`, `user_id uuid FK auth.users`, `role ('owner'|'admin'|'member')`, `invited_by_user_id uuid?`, `joined_at`. Composite PK on `(account_id, user_id)`. One row per (account, user) pair.

- **`workflows`** — `account_id uuid FK accounts` (the owner), `created_by_user_id uuid` (provenance — the human who first created it), plus existing workflow columns. The `user_id` column is removed; nothing else changes about workflow semantics.

- **`integrations`** — `account_id uuid FK accounts` (the owner), `connected_by_user_id uuid` (provenance — the human who completed the OAuth flow), `provider`, `external_account_label` (e.g. `marcus@company.com`, `acme-shop.myshopify.com`), plus existing integration columns (encrypted tokens, scopes, health). The `user_id` column is removed.

- **`workflow_runs`** — `account_id uuid FK accounts` (denormalized from `workflows.account_id` for query speed and for survivorship if a workflow is ever moved between accounts), `workflow_id`, `triggered_by_user_id uuid?` (nullable — null for webhook/polling/cron-triggered runs, populated for manual runs and retries), plus existing run columns.

- **`account_billing`** — `account_id uuid PK FK accounts`, `plan_id`, `task_pack_balance`, `overage_enabled`, `overage_cap_multiplier`, Stripe customer ID, plus the parity-invariant counters per the V1 billing model. Replaces V1's `user_billing(user_id)`.

- **`templates`**, **`custom_providers`**, **`custom_nodes`** — same pattern: `account_id` for account-owned; nullable `account_id` (or a separate `is_platform` boolean) for platform-published / public-read rows.

No SQL beyond the column-list intent. The migration template, RLS policies, GRANT statements, audit columns, and trigger pattern are governed by [`database-security.md`](./database-security.md) and are written there once, applied here.

## Account types

Three account types ship. They differ in what membership and lifecycle operations are allowed, not in how ownership works.

- **`personal`** — exactly one membership: the owner. Cannot be transferred or left. Exists for the lifetime of the user record and is deleted only through the user / account deletion flow, subject to retention and billing rules. Created atomically at signup. Every user has exactly one personal account. A personal account is the home for solo work — workflows the user builds for themselves, integrations connected to their personal accounts, billing they pay personally.

- **`team`** — supports multiple memberships, roles, invitations, ownership transfer, and members leaving. Created on demand via "Create Team". Independent billing. Independent integrations. Independent workflows. A team account is the home for a working group of any size where the team — not any individual — is the durable owner.

- **`organization`** — same membership/role/invite/transfer mechanics as `team`, plus the future option of internal grouping (departments, projects) as a structure *inside* the account. For launch, behaves identically to `team`; the type distinction exists to anchor the future-fit (see §15).

These are account *types*, not separate ownership systems. A workflow on a personal account and a workflow on a team account are the same row shape with a different `account_id`.

## Account switching behavior

A user with memberships in multiple accounts has an **active account** at any given moment. The active account is server-side state used for durable UI defaults — landing page after sign-in, "no account in URL" route resolution, dashboard scope when the user opens a bare path, persisted across sign-out / sign-in.

The active account is a **default**, not the sole scoping mechanism. Account-scoped URLs and APIs carry an explicit account id or slug wherever it is practical to do so, and every request verifies the caller's membership of the referenced account on the server:

- **URLs** include the account id or slug for account-scoped pages (e.g. `/accounts/<id>/workflows`, `/accounts/<id>/integrations`, `/accounts/<id>/runs`). Bare paths like `/workflows` resolve through the user's active account as a default; deep links and shared URLs identify the account explicitly.
- **APIs** that read or write account-scoped resources accept the account id explicitly (as a path segment, query parameter, or request-body field — whichever fits the route shape). Active-account is not a hidden side channel.
- **Server-side membership check on every request.** Independent of how the account id arrived (URL, body, or active-account default), the route handler verifies the caller has a membership row for that account *before* the request reaches the repository layer. RLS enforces this in the database; the application layer enforces it as defense-in-depth and to produce clean 403s instead of empty result sets.
- **Switching active account** updates the server-side active-account record and is reflected in subsequent default-scoped requests. URLs that already carry an explicit account id are unaffected by the switch — they continue to refer to whatever account they name.
- **Background work** (cron, polling, webhook, scheduled triggers) does not consult active-account state. It operates on the account that owns the workflow / integration / subscription it is firing for. Active-account is only for interactive UI sessions.

Active-account default + explicit account id in URLs/APIs + server membership verification on every request is the contract. None of the three are sufficient on their own: the default fails for shared links and concurrent tabs, an id in the URL with no membership check is a hole, and a membership check with no explicit account id forces every endpoint to silently resolve through user state.

A user can be a member of N accounts. The active account is exactly one of them at a time. Any number of those accounts may be referenced by explicit id in URLs / APIs concurrently — the active-account default applies only when no explicit id is provided.

## Personal vs team/org account creation behavior

This is the most important rule to internalize because it inverts V1's mental model:

- **Signup** → exactly one personal account is created atomically with the user. The user is the owner. No other accounts exist for them yet.
- **"Create Team"** → a **new** `accounts` row with `type = 'team'` is created. The creating user is added as `role = 'owner'` via a new `account_memberships` row. The user's personal account is **untouched**: it still exists, still owns whatever workflows/integrations/runs/billing it had before, and the user can still switch back to it.
- **"Create Organization"** → identical to Create Team, with `type = 'organization'`.
- **No conversion.** Personal accounts never become team accounts. Team accounts never become organization accounts. There is no "upgrade your personal account to a team" path. If a solo user later wants a team, they create a new team account alongside their personal account.
- **No migration of resources between accounts at creation time.** Creating a team account does not copy or move the user's personal-account workflows / integrations into the team. If the user wants a workflow on the team, they build (or in a future capability, transfer) it there.

The mental model: an account is permanent. Users join and leave accounts. Accounts do not change identity.

## Workflow ownership rules

- A workflow belongs to exactly one account via `workflows.account_id`. This is the authoritative owner.
- `workflows.created_by_user_id` is provenance only. It identifies the human who first created the workflow and is preserved for audit and display. It is **not** consulted for authorization. Any account member with sufficient role can edit, run, or delete the workflow.
- A workflow's account never changes implicitly. The `account_id` column is set at creation and stays the same for the workflow's lifetime.
- Moving a workflow between accounts requires explicit transfer (a future capability — not launch scope). Transfer rewrites `account_id` and re-validates that the destination account has all integrations referenced by the workflow (see §9 — workflows can only use integrations from their own account, which constrains valid transfer targets).
- Removing a member from an account does **not** delete, reassign, or hide the workflows that member created. Those workflows still belong to the account; the `created_by_user_id` reference remains as historical provenance even though the referenced user is no longer a member.

## Integration credential rules

- An integration belongs to exactly one account via `integrations.account_id`. This is the authoritative owner.
- `integrations.connected_by_user_id` is provenance only. It identifies the human who completed the OAuth flow (or pasted the API key) and is preserved for audit, display, and reconnection deep-links. It is **not** consulted for authorization.
- Personal-account integrations and team/org-account integrations are **separate records**, even if they point to the same external email or workspace. A user who has connected `marcus@company.com` to both their personal ChainReact account and their team account has two distinct rows in the `integrations` table.
- The selected integration on a workflow node determines which external identity that action runs as. There is no implicit fall-through from the account's integrations to the connecting user's personal integrations.

Within a team or organization account, integration records fall into two practical patterns. **Both are equally account-owned** — the distinction below is descriptive, not a separate ownership model:

- **Account-owned shared service integrations.** Examples: Stripe account, Slack workspace, HubSpot CRM, shared Google Drive, Shopify shop, Mailchimp account, GitHub organization. Connected once by some member of the account (recorded in `connected_by_user_id` for provenance); usable by every workflow on the account; the external identity is the *account / workspace / shop / organization* itself, not an individual person. If the connecting member later leaves, the integration stays.

- **Account-owned member-connected work identities.** Examples: Outlook–marcus@company.com, Outlook–nate@company.com, Gmail–jamie@company.com, individual Google Calendar feeds. Each is a separate `integrations` row on the team/org account, connected by that specific member through their own OAuth flow as the team's outbound identity for that mailbox / calendar. The external identity is the individual mailbox or profile.

Member-connected work identities live **inside the team/org account**, not inside the connecting member's personal ChainReact account. They are not pulled from, mirrored from, or shadowed against the member's personal account. A user's personal `Outlook–marcus@personal.com` connection on their personal ChainReact account is a *separate row* from their work `Outlook–marcus@company.com` connection on the team account, even when both happen to point at the same external email. When a member leaves the team account (see §14), the work-identity integration they connected stays with the team account; the team's owner / admin decides whether to keep it for historical workflows or disconnect and revoke it.

A team or organization account may therefore carry multiple integrations for the same provider — `Outlook–marcus@company.com`, `Outlook–nate@company.com`, `Outlook–jamie@company.com`, plus a shared `Slack–acme.slack.com` and a shared `Stripe–acme-payments` — all on one account.

## Team member business-email integration example

A 3-person team account, "Acme Workflows," has the following integration records, all with `account_id = <acme-team-account-id>`:

| Provider | external_account_label | connected_by_user_id | Pattern |
|---|---|---|---|
| outlook | marcus@company.com | marcus | member-connected work identity |
| outlook | nate@company.com | nate | member-connected work identity |
| outlook | jamie@company.com | jamie | member-connected work identity |
| slack | acme.slack.com | marcus | shared service |
| stripe | acme-payments | marcus | shared service |

A workflow on the Acme Workflows account that sends an email selects one of the three Outlook integrations as the outbound identity. Marcus could build a workflow that sends from `nate@company.com` — the workflow runs as Nate's external identity because the workflow's selected integration is Nate's. Authorization to *do* this depends on Marcus's role inside the Acme Workflows account, not on whether the integration was connected by him.

If Jamie later connects their personal `outlook–jamie@home.com` on their personal ChainReact account, that record lives under Jamie's personal account and is **invisible** to the Acme Workflows account. The Acme team's workflows cannot select it, see it, or use it. Likewise, Acme's `outlook–jamie@company.com` is invisible to Jamie's personal account's workflows.

If Jamie leaves the Acme Workflows team account, `outlook–jamie@company.com` remains on the Acme account. The team's owner decides whether to keep it (workflows that ran as Jamie continue to have a valid identity reference for run-history display) or revoke and delete it.

## Billing and usage rules

- Every charge attributes to `workflows.account_id`. Not to `triggered_by_user_id`. Not to `created_by_user_id`. Not to the account that the user is currently active in. The account that owns the workflow being run is the account being charged.
- Plan limits, task pack balance, overage budget, overage cap multiplier, Stripe customer ID, and the parity-invariant counters all live on `account_billing(account_id)`.
- Cost preview (`/api/workflows/[id]/preview-cost`) resolves the account from the workflow and computes against that account's billing state.
- Cost confirmation blocks runs that exceed the workflow's account's available budget — independent of which user clicked Run.
- A user who is a member of multiple accounts has no shared budget across them. Each account has its own plan, pack balance, and overage state.
- Personal accounts have personal billing. Team and organization accounts have team / organization billing. There is exactly one billing root per account.
- Stripe customer ID is attached to the account, not the user. A user who owns a personal account and is a member of a team account is associated with two distinct Stripe customer records (one per account that has paid billing configured).

## Run history rules

- Every workflow run row has an `account_id` equal to the owning workflow's `account_id` at run time.
- `triggered_by_user_id` is recorded for manual runs and retries. It is **null** for webhook-, polling-, cron-, or scheduled-trigger runs (those have no human caller).
- Access control on run history is account-membership, not `triggered_by_user_id`. Any account member with sufficient role sees every run of every workflow in the account, regardless of who (if anyone) triggered each run.
- A user who is a member of multiple accounts sees runs only for the currently active account in the UI.

## Membership and role rules

The minimum role set for launch:

- **`owner`** — full control. Can change account name, transfer ownership, add and remove members, change roles, manage all integrations and workflows, manage billing, delete the account. Personal accounts have exactly one owner (the user). Team and organization accounts must always have **at least one** owner (the last-owner-leaves transfer rule, §14).
- **`admin`** — can add and remove non-owner members, change non-owner roles, manage all integrations, manage all workflows, view all runs, view billing. Cannot transfer ownership. Cannot delete the account. Cannot change another admin's or the owner's role.
- **`member`** — can build, edit, and run workflows; can connect integrations they have permission to connect; can view runs of workflows on the account. Cannot manage other members. Cannot manage billing. Cannot delete the account.

Step-up authentication is required for destructive role-managed actions (delete account, change role on another owner, remove an owner) — same pattern as V1's admin step-up.

A personal account has exactly one `account_memberships` row, with `role = 'owner'`. The `accounts.owner_user_id` and the lone membership's `user_id` are the same value. The redundancy is intentional — `owner_user_id` answers "who owns this account?" in a single column without a join.

A team or organization account has one or more memberships. At all times, at least one of those memberships has `role = 'owner'`. This invariant is enforced at the database (CHECK / trigger) and re-validated in the service layer.

## Owner transfer and leaving rules

- **Transfer ownership** applies only to team and organization accounts. Transferring rewrites `accounts.owner_user_id` and updates the involved `account_memberships` rows (the old owner's role drops to admin or member at the old owner's choosing; the new owner's role becomes owner). Atomic, audit-logged, requires step-up auth. Personal accounts cannot be transferred — they are bound to the user that owns them.
- **Leaving an account** applies only to team and organization accounts. A member leaving deletes their `account_memberships` row for that account; the account's workflows, integrations, runs, and billing are unaffected. Specifically:
  - Workflows the leaving member created stay on the account; `created_by_user_id` continues to point at the (now-non-member) user.
  - Integrations the leaving member connected stay on the account (per §9); the owner / admin decides whether to keep or revoke.
  - Runs the leaving member triggered stay; `triggered_by_user_id` continues to point at them.
  - Billing is unaffected — it lives on the account, not on the leaving member.
- **The owner cannot leave** a team or organization account without first transferring ownership to another member. The "always ≥1 owner" invariant gates the leave operation.
- **Personal accounts cannot be transferred or left.** They exist for the lifetime of the user record and are deleted only through the user / account deletion flow, subject to retention and billing rules.
- **Deleting a user** (account deletion at the auth layer) cascades through `account_memberships` (the user's memberships in team/org accounts are removed), but the team/org accounts they were members of are untouched. The user's personal account follows the user / account deletion flow — actual row removal is subject to retention requirements (data-export grace period, legal holds) and billing wind-down (open invoices, refund pending, in-flight Stripe events) governed by the deletion flow rather than by an immediate cascade. If the deleted user was the sole owner of a team/org account, the team/org account must have had ownership transferred prior to deletion, or the deletion is blocked at the application layer.

## Templates, custom providers, custom nodes — future fit

- **Templates** (the self-growing pool from Phase 5): `account_id`-scoped for account-private templates; `account_id IS NULL` (or `is_platform = true`) for platform-published templates visible to everyone.
- **Custom providers** and **custom nodes** (a future capability — users / teams can author their own provider adapters and node types): account-scoped via `account_id`. A custom provider built inside a team account is usable by every workflow on that team account and invisible to other accounts. Platform-published custom providers (if introduced) are account-less.
- The same account-ownership rule applies uniformly. Templates, custom providers, and custom nodes inherit the same access-control join through `account_memberships`. No separate authorization model.

## RLS and security direction

This document owns the *business shape* of account ownership. The *mechanical pattern* of how Postgres RLS enforces it lives in [`database-security.md`](./database-security.md). The two docs together specify the security model:

- **Today (pre-Phase 4):** every user-data table's RLS policy is `auth.uid() = user_id`. The current state is correct for the current single-user model.
- **Phase 4 cutover:** every user-data table's RLS policy becomes membership-based. The canonical predicate is:
  ```
  EXISTS (
    SELECT 1 FROM account_memberships am
    WHERE am.user_id = auth.uid()
      AND am.account_id = <table>.account_id
  )
  ```
  Role-gated operations (delete account, manage members) add an `AND am.role IN ('owner','admin')` clause.
- The migration template that introduces `account_id` to existing tables (workflows, integrations, workflow_runs, etc.) is governed by `database-security.md`. The implementation slice that introduces accounts (Phase 4a) will update `database-security.md` in the same batch to add the membership-join pattern alongside the existing user-id pattern.
- Service-role boundaries are unchanged. Cron jobs and system writes continue to go through `repositories/supabase/serviceRoleClient.ts` with explicit reasons. Service-role access bypasses RLS by design and does not change.
- Token encryption is unchanged. Integrations' OAuth tokens and secrets remain AES-256-encrypted at the application layer before insert. The `account_id` column changes who can read the row; it does not change how the secret column is protected.

`database-security.md` will gain an "Account membership policy template" subsection in the Phase 4 foundation slice. This document does not duplicate that work — it states the direction so that future slice authors know what shape to land.

## Launch scope

What ships at v1.0 of the ownership model — the minimum that makes the model correct end-to-end:

- `accounts` table + `account_memberships` table.
- Every existing user gets exactly one personal account, created via backfill, with the user as the sole owner.
- Every existing `workflows.user_id` is replaced by `workflows.account_id` pointing at that user's personal account, plus `created_by_user_id` preserving the original user id.
- Every existing `integrations.user_id` is replaced by `integrations.account_id` pointing at that user's personal account, plus `connected_by_user_id` preserving the original user id.
- Every existing `workflow_runs.user_id` is replaced by `workflow_runs.account_id` (denormalized from the owning workflow) plus `triggered_by_user_id` preserving the original user id where applicable.
- Billing migrates: `user_billing(user_id)` becomes `account_billing(account_id)`, with rows backfilled to the corresponding personal account.
- RLS flips to membership-based on every re-scoped table.
- No team/org UI ships at launch. No "Create Team" button. No invitations. No role assignment UI. The only role that exists in data is `owner` (every personal-account membership).

This is a fully correct foundation: V2 ships single-user, but the data model is account-scoped from day one. Adding team/org accounts later is purely additive — no rescope of existing rows, no schema migrations on the hot tables.

## Later collaboration roadmap

Committed to fit cleanly on top of the launch model. Each item is its own future slice; none of them change the ownership model defined here.

- Invitations + accept flow (email invite, expiring token, accept-creates-membership).
- Role assignment UI + role-change audit log.
- Account-creation UI for team and organization types.
- Account switching UI (top-bar switcher + persisted active-account selection).
- Leaving an account (member-initiated; blocks last owner per §14).
- Ownership transfer (owner-initiated; step-up auth; atomic owner-role swap).
- Groups / departments / projects *inside* an organization account (a future structural layer below account, never replacing it).
- Account-level audit log surfaced in admin UI (every membership change, role change, integration connect/disconnect, workflow create/delete, billing event).
- Cross-account workflow transfer (deliberate, validates integration availability on destination, audit-logged).
- Per-resource ACLs *within* an account (out of launch — accounts default to uniform membership-gated access).

None of these introduce a new ownership root. They ride on top of `accounts` + `account_memberships`.

## Migration and implementation phases

High-level only. Each phase lands as its own slice with its own plan doc. No SQL or implementation details here.

- **Phase A — Foundation.** Create `accounts` + `account_memberships` tables with RLS, GRANT, and policy tests per [`database-security.md`](./database-security.md). Backfill one personal account per existing user. Add the `(account_id, user_id)` composite-PK membership rows. Wire the active-account server state. No re-scope of existing tables yet.

- **Phase B — Re-scope.** Add `account_id` to `workflows`, `integrations`, `workflow_runs`. Backfill from each row's existing `user_id` via the user's personal account from Phase A. Flip RLS on each table from `auth.uid() = user_id` to the membership-join template. Drop the old `user_id` ownership column once every consumer has been migrated to read `account_id`. Add `created_by_user_id` / `connected_by_user_id` / `triggered_by_user_id` provenance columns.

- **Phase C — Billing.** Introduce `account_billing(account_id)` mirroring V1's `user_billing` shape. Backfill from `user_billing(user_id)` via personal accounts. Re-point the billing gate, cost preview, task deduction RPC, and Stripe customer attachment from user-scoped to account-scoped. Update parity invariant queries.

- **Phase D — Team and organization accounts.** Allow `accounts.type` other than `'personal'`. Introduce roles beyond `owner`. Build the invitation + accept flow. Build the account creation, switching, and member-management UI. No data migration — purely additive.

- **Phase E — Transfer and leave.** Implement ownership transfer (team/org only) with step-up auth. Implement member-initiated leave. Enforce the "always ≥1 owner" invariant at database + service layer.

Each phase's exit condition gates the next phase's start. Phases A and B can land together if the slice plan justifies it; phases C–E are sequential.

## Explicit non-goals for launch

These are deliberately out of scope for the launch slice (Phase A + B + C). Each is listed so future slice authors do not assume otherwise:

- No team or organization account UI.
- No invitations or accept flow.
- No role hierarchy beyond `owner` (the only role that ships at launch on every personal-account membership).
- No per-resource ACLs *within* an account.
- No cross-account sharing or visibility.
- No workflow / integration / run transfer between accounts.
- No SAML / SSO.
- No user-facing audit log surface.
- No SCIM provisioning.
- No multi-currency or workspace-level invoice splitting.
- No groups / departments / projects as a structural layer inside organization accounts.

## Risks and open questions

Flagged for resolution in the phase that addresses each — not resolved here.

- **Backfill ordering when V1 data is asymmetric.** Some users in V1 have workflows that reference integrations connected by a different user (this exists because V1's workspace model was inconsistent). The Phase B backfill must canonicalize these rows before enforcing `account_id NOT NULL`. Open question: do we attribute orphan-referenced workflows to the workflow's `user_id`'s personal account and accept that they may break at run time (integration not on the same account), or do we copy / re-connect the integration into the workflow owner's personal account? **Resolve in the Phase B slice plan.**

- **Personal-account billing migration to Stripe.** Existing `user_billing` rows map 1:1 to personal accounts, but Stripe customer IDs are user-bound today. Open question: do we preserve the existing Stripe customer record and re-attach it to the personal account, or create a new Stripe customer per personal account and migrate subscriptions? **Resolve in the Phase C slice plan.** Implication: a one-time Stripe-side migration may be required.

- **Per-organization Stripe accounts.** Out of launch scope. Open question: does the schema we pick for `account_billing` constrain us if a future enterprise customer wants to be billed via their own Stripe Connect account? **Capture the answer in the Phase C plan even though it is not implemented.**

- **Template ownership at launch.** Templates do not ship in V2 launch. Open question: when templates land (Phase 5), are they `account_id`-scoped from day one, or do they reuse a user-scoped pattern and migrate later? **Default position: `account_id`-scoped from day one to avoid a second migration. Confirm in the templates slice plan.**

- **Workflows that span multiple accounts' integrations.** §15 future-fit assumes a workflow can only use integrations from its own account. Open question: is there ever a legitimate cross-account integration use case (e.g., a personal workflow that uses a team integration the user has access to)? **Default position: no — workflows are strictly account-scoped, and integration access does not leak across accounts. Re-open only with a concrete user-validated use case.**

- **Notifications scoping.** This document does not enumerate `notifications` in §4 because the launch model treats notifications as user-scoped (a notification is delivered to a person, not an account). Open question: do per-account notifications need a separate row shape (account-level activity feed) once teams ship? **Resolve in the Phase D slice plan.**
