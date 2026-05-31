# ChainReact V1 — Workspace / Team / Organization Business-Rules Audit

**Slice:** 4.ORG-WORKSPACE-BUSINESS-RULES-AUDIT-1
**Audit date:** 2026-05-30
**Repos audited:**
- V1 (primary): `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
- V2 (factual snapshot only): `c:\Users\marcu\source\repos\ChainReactV2`
**Scope:** docs-only. No source / schema / RLS / auth / billing / workflow / integration ownership changes were made.
**Source convention used throughout:** every flow section separates four layers — **Intended (product-implied) rule** | **Actual code behavior** | **Gap / contradiction / risk** | **File & code references**. Critical findings are stated as facts, not softened.

---

## 1. Executive Summary

V1 carries an aspirational multi-tenant model (users → personal workspaces, teams, organizations, with role-based access and shared integrations) but the *executed* code only partially realises that intent. The schema describes shared billing scopes and team-level quotas; the runtime collapses them back onto a single owning user. Several authorization checks are asymmetric across entry paths, several "tables" the code queries are not present in active migrations, and several user-facing flows (workflow ownership transfer, run history visibility, payment-failed handling) are simply absent.

V2 has none of this infrastructure at all — it is a strict per-user model today, with `auth.uid() = user_id` RLS on every table and zero workspace/team/org code.

**Top five business-rule findings — stated as facts:**

1. **`/api/workflows/execute` does not enforce workflow ownership for authenticated users.** It only matches `workflow.user_id` against the request when an `x-user-id` header is present (webhook path). A normal authenticated POST hits the workflow row directly with the route-handler client, gets `userId` from the session, and proceeds. No call to `authorizeWorkflowAccess` is made on this path. The sister route `/api/workflows/execute-stream` does call it. Any authenticated user who knows a workflow ID can POST and trigger execution that bills the workflow owner. (See §6, §13.)

2. **Billing scope is static and always resolves to a single user account.** `billing_scope_*` columns let workflows declare scope `user | team | organization`, but `scopeToBillingUser` resolves team scope to "team owner's user_id" and organization scope to "organizations.owner_id". Tasks are deducted from `user_profiles` of that resolved user. The `teams.tasks_limit` / `teams.tasks_used` columns in schema are never read by the billing path. The file even carries a comment: "DELETE THIS when scope-native subscriptions exist (Phase 6)." So team / org billing is a label; the actual debit is always a personal-user debit. (See §9, §10.)

3. **There is no workflow ownership transfer.** `workflows.user_id` is permanent. If the creator leaves a team or organization, their workflows remain attributed to them and may be effectively orphaned from a team perspective. Org ownership transfer exists (`/api/organizations/[id]/transfer-ownership`). Workflow ownership transfer does not. (See §12, §13.)

4. **Integration workspace context is captured at OAuth-URL generation time, not at callback time.** If the user switches workspace context (localStorage-driven) in another tab between clicking "Connect" and the provider callback firing, the integration lands in whatever workspace was active when "Connect" was clicked — which may not be where the user *thinks* they are. (See §7.)

5. **Signup creates no `workspaces` row.** New users get a `user_profiles` row, a free-plan billing window, and JWT claims — but no `workspaces` insert. "Personal" workflows live with `workspace_type='personal'` and `workspace_id=null`. The `workspaces` table exists (it was dropped then restored in Jan 2026) but is not populated by the signup pipeline. (See §3.)

**Additional important findings flagged in body:** `workflow_shares` is queried by `authorizeWorkflowAccess.ts` but was dropped in the `20260128044221` migration and not restored — so personal-workflow sharing silently returns no rows (§6). `organization_members` is queried by the same file but `ORGANIZATION_ROLES_MIGRATION.md` declares it "PLANNED BUT NOT IMPLEMENTED" — so every org-scoped authorization check fails the `not_member` branch unless the live DB diverges from active migrations (§5, §15). DELETE workflow is hard, not soft, despite `deleted_at` existing (§12). Webhook-triggered runs use the workflow owner's identity for integration access, which can fail mid-execution for team-shared workflows (§8). Subscription `past_due` status is not blocked by the execute gate (§9).

**V2 snapshot (factual, no comparison verdict):** V2 has zero workspace / team / organization tables, zero sharing tables, zero RBAC matrix code. Every table uses `auth.uid() = user_id` RLS. Workflows, integrations, and billing are all `user_id`-keyed. The decision space for V2 is therefore wide open. (See §16.)

---

## 2. Business-Rule Map — Who Owns What

```
auth.users (Supabase)
   │
   ├─→ user_profiles (1:1)
   │     • plan, tasks_used, tasks_limit, billing_period_*
   │     • overage_enabled, task_pack_balance, auto_buy_packs
   │     • stripe_subscription_item_id  ← Stripe customer is per-user
   │     • notification_preferences, admin_capabilities
   │
   ├─→ subscriptions (1:N, but practically 1:1 per user)
   │     • user_id, organization_id?, team_id?  ← all optional, columns coexist
   │     • plan_id → plans
   │
   ├─→ workspaces (0:N — table exists but rarely populated)
   │     • owner_id, name, slug, settings
   │     • workspace_memberships (N:N viewer/editor/owner)
   │     ⚠ Not auto-created on signup
   │
   ├─→ teams (0:N as created_by; N:N as member via team_members)
   │     • name, slug, organization_id?, created_by
   │     • tasks_limit, tasks_used  ← schema columns; not read at runtime
   │     • suspended_at, grace_period_ends_at, suspension_reason
   │     • team_members.role ∈ {owner, admin, manager, hr, finance, lead, member, guest}
   │
   ├─→ organizations (0:N as owner_id)
   │     • name, slug, owner_id, billing_email
   │     • teams.organization_id → orgs
   │     • organization_members  ⚠ querid by code; "NEVER IMPLEMENTED" per .md docs
   │
   ├─→ workflows (1:N as user_id)
   │     • workspace_type ∈ {personal, team, organization}
   │     • workspace_id (NULL for personal)
   │     • billing_scope_type ∈ {user, team, organization}
   │     • billing_scope_id  ← the entity that ultimately resolves to a user_profiles row
   │     • deleted_at  ← column exists; DELETE endpoint ignores it (hard delete)
   │
   └─→ integrations (1:N as user_id, plus connected_by)
         • workspace_type, workspace_id  ← captured from OAuth URL gen state
         • sharing_scope ∈ {private, team, organization}
         • integration_shares (N:N) for explicit grants
         • health_check_status, last_notification_milestone, refresh_lock_* etc.
```

**Cardinality summary:**
- One user can be in many teams; teams can belong to at most one org (`organization_id` nullable).
- A workflow belongs to exactly one workspace context (personal | team | org) and one billing scope. Billing scope drives debiting; workspace context drives membership-based access.
- An integration is owned by either one user (personal) or one workspace (team/org with `user_id=null` and `connected_by` set).
- A subscription has columns for `user_id`, `team_id`, and `organization_id`; in practice only `user_id` is populated and the billing path treats subscriptions as per-user.

---

## 3. End-to-End Signup / Default Ownership Flow

### Intended (product-implied)

A new user signs up, gets a free-plan account, gets a billing window, and can immediately create workflows in their personal space. The restored `workspaces` schema (`20260129200000_restore_workspace_tables.sql`) implies that each user should have a personal workspace row to attach memberships, locales, and timezones to.

### Actual code behavior

1. `POST /api/auth/signup` creates an `auth.users` row via `serviceClient.auth.admin.createUser({ email_confirm: false })`, then sends a Resend confirmation email itself ([app/api/auth/signup/route.ts:68-73](app/api/auth/signup/route.ts#L68-L73)).
2. It then calls `ensureUserProfile(serviceClient, userId, ...)` which is **idempotent** — `SELECT` first, `INSERT` on miss, with a `23505` race fallback that re-`SELECT`s the winner ([lib/auth/ensureUserProfile.ts:80-225](lib/auth/ensureUserProfile.ts#L80-L225)).
3. Defaults written into the new `user_profiles` row (via `buildDefaultProfileFields` in [lib/utils/profile-defaults.ts:10-20](lib/utils/profile-defaults.ts#L10-L20)):
   - `plan: 'free'`
   - `tasks_used: 0`, `tasks_limit: <from plans table>`
   - `billing_period_start: now`, `billing_period_end: now + 30 days`
   - `provider: 'email'`, `role: 'free'`
4. `syncAccessClaims(userId)` writes `plan` + `admin_capabilities` into JWT `app_metadata` ([lib/auth/ensureUserProfile.ts:197-201](lib/auth/ensureUserProfile.ts#L197-L201)).
5. No `workspaces` row is inserted. No trigger on `auth.users` does this either (no such trigger found in active migrations).
6. No team or organization is created.
7. No `subscriptions` row is created — the user_profiles row IS the billing record.
8. Profile-creation failure is **swallowed** at the signup route: the `try/catch` logs the error and lets signup succeed anyway ([app/api/auth/signup/route.ts:95-98](app/api/auth/signup/route.ts#L95-L98)). A safety-net call exists at `/api/auth/callback/route.ts:154-163` to repair the profile on next login.

### Gap / contradiction / risk

- **`workspaces` table exists but is never populated for personal scope.** New users have no row in `workspaces`; workflows are created with `workspace_type='personal'` and `workspace_id=null`. The unified workflows fetch path explicitly treats `workspace_type IN ('personal', 'user', NULL)` as personal ([app/api/workflows/route.ts:29-32](app/api/workflows/route.ts#L29-L32)). It is unclear whether the restored `workspaces` table was intended to back personal scope or only to support standalone-team scope. Either reading is internally consistent; the schema and the runtime disagree.
- **Profile creation can silently fail and the user can sign up with no profile row.** The safety-net repair on first login will recover most cases, but `tasks_limit` and `billing_period_*` only become correct after that repair runs. A user who signs up, never logs in via callback, and POSTs directly to an API route could in theory hit `user_profiles` lookup misses. The `ensureUserProfile` safety net is called frequently enough that this is a low-probability gap, but it is a gap.
- **No personal subscription / Stripe customer is created on signup.** The Stripe customer is created lazily, on first checkout. So a new user has no `stripe_customer_id` until they purchase. This means Stripe webhooks for `customer.subscription.created` are the first time the user's billing identity exists in Stripe — fine in steady state, but the ownership chain is "lazy", not eagerly established.

### Files & references

- [app/api/auth/signup/route.ts:23-157](app/api/auth/signup/route.ts#L23-L157)
- [lib/auth/ensureUserProfile.ts:80-225](lib/auth/ensureUserProfile.ts#L80-L225)
- [lib/utils/profile-defaults.ts:10-20](lib/utils/profile-defaults.ts#L10-L20)
- [supabase/migrations/20260129200000_restore_workspace_tables.sql](supabase/migrations/20260129200000_restore_workspace_tables.sql)
- [app/api/workflows/route.ts:29-32](app/api/workflows/route.ts#L29-L32)

---

## 4. Workspace / Team / Org Creation and Switching

### Intended

Users should be able to create teams and (on the Business / Organization plan) organizations. There should be a clear "current workspace" indicator and a switcher; that current workspace should determine which workflows the user sees and what scope a newly created workflow is born into.

### Actual

**Team creation — [app/api/teams/route.ts:70-162](app/api/teams/route.ts#L70-L162):**
- Gated by entitlement `'teamSharing'` (line 80–82).
- Generates a unique slug; inserts a `teams` row with `created_by = user.id`; inserts a `team_members` row for the creator with `role='owner'`; returns `member_count: 1, user_role: 'owner'`.

**Organization creation — [app/api/organizations/route.ts:315-451](app/api/organizations/route.ts#L315-L451):**
- Gated by plan in `{'business', 'organization'}` (line 326–335).
- Inserts an `organizations` row with `owner_id = user.id`.
- Auto-creates a default "General" team in the org.
- Inserts `organization_members` row for the creator with `role='owner'` (line 401-412). **This insert targets a table that `ORGANIZATION_ROLES_MIGRATION.md` declares "NEVER IMPLEMENTED"** — see §15 reconciliation.
- Adds creator to default team with `role='admin'`.

**"Current workspace" mechanic — [hooks/useWorkspaceContext.ts:21-183](hooks/useWorkspaceContext.ts#L21-L183):**
- Storage layer is `localStorage` keys: `current_workspace_type`, `current_workspace_id`, `current_workspace_name`.
- Default on first mount: `{ type: 'personal', id: null, name: 'Personal', isPersonal: true }`.
- Cross-component switching uses a `CustomEvent('organization-changed')` bus; the hook listens, updates localStorage, and pushes the new context into `workflowStore` and `integrationStore`.
- The current workspace is **only used at creation time** for new workflows / new integrations. The default workflows-list fetch is a unified view (see §6).

**URL → context binding:**
- Routes `/org/[slug]` and `/teams/[slug]` exist for org and team settings, but the workflows page and integrations page do not read the URL slug to set the current workspace context. The slug only scopes the settings UI it serves.

### Gap / contradiction / risk

- **Cross-device / fresh-session reset.** localStorage is per-device, per-browser. Logging in on a new machine resets to personal. If the user expects to "land where they left off in workspace X", they won't.
- **Tab-switching race during OAuth.** If the user clicks "Connect Gmail" from workspace A, then in another tab switches to workspace B, the OAuth state captured at URL generation reflects workspace A and the integration lands in A. The user sees themselves in B when the callback completes and may not understand where the integration went. (See §7 for the OAuth state mechanism.)
- **Organization creation writes to `organization_members` — which the migration docs say does not exist.** Either the doc is stale and the table actually exists in the live DB, or the org create endpoint has been silently failing on that insert step for unknown amount of time. The audit cannot determine which from code alone. **This needs manual DB verification.**
- **No "default workspace on next login" persisted in DB.** `user_profiles.default_workspace_id` and `default_workspace_type` columns exist (per schema), but no signup or login code path writes to them.

### Files & references

- [app/api/teams/route.ts:70-162](app/api/teams/route.ts#L70-L162)
- [app/api/organizations/route.ts:315-451](app/api/organizations/route.ts#L315-L451)
- [hooks/useWorkspaceContext.ts:21-183](hooks/useWorkspaceContext.ts#L21-L183)
- [stores/workflowStore.ts:269-374](stores/workflowStore.ts#L269-L374)
- [supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md](supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md)

---

## 5. Membership / Role / Invitation Flow

### Intended

Two distinct invitation channels exist in schema — `team_invitations` (user-ID based) and `organization_invitations` (email/token based) — implying two intended flows: invite an *existing user* to a team, or invite an *email address* (known or unknown) to an organization.

### Actual

**Team invitation send — [app/api/teams/[id]/members/route.ts:102-293](app/api/teams/%5Bid%5D/members/route.ts#L102-L293):**
- Inviter must have `owner | admin | manager` role in the team (line 144).
- Inviter's plan must be Pro+ (line 126–133) — free-tier users cannot invite at all.
- Insert into `team_invitations` (with `invitee_id`, not email — invitee must already exist in auth.users).
- Insert into `notifications` with `type='team_invitation'`, `action_url`, `metadata` (line 225–256).
- Send email via Resend (line 267–276).

**Org invitation send — [app/api/organizations/[id]/invite/route.ts:8-189](app/api/organizations/%5Bid%5D/invite/route.ts#L8-L189):**
- Inviter must be `admin` of at least one team within the organization (line 35–46).
- Accepts an **email address** (not a user_id) and an opaque `token`.
- Insert into `organization_invitations(organization_id, email, role, token, expires_at=now+7d, invited_by)`.
- **Code carries a comment warning** about a possible schema mismatch on a `team_id` column (line 122–123) — the inserted invitation may or may not record which team the invitee should land in. The acceptance path attempts to use `invitation.team_id` and falls back to "General" team / first team if it is null.

**Accept — team invite [app/api/teams/invitations/[id]/route.ts:45-137](app/api/teams/invitations/%5Bid%5D/route.ts#L45-L137):**
- Verify status is `pending`; if expired, mark `expired` and reject.
- Insert `team_members(team_id, user_id, role)` with role from the invitation.
- Update invitation `status='accepted'`, `responded_at=now`.
- Mark related notification read.

**Accept — org invite [app/api/invitations/accept/route.ts:7-140](app/api/invitations/accept/route.ts#L7-L140):**
- Look up `organization_invitations` by `token`.
- Verify not expired.
- Determine target team: `invitation.team_id` if present; otherwise find "General" team; otherwise the first team; 500 if none.
- Insert `team_members(team_id, user_id, role)` with role from the invitation.
- Update `organization_invitations.accepted_at`, `accepted_by`.

**Member remove / leave — [app/api/teams/[id]/members/[userId]/route.ts:7-83](app/api/teams/%5Bid%5D/members/%5BuserId%5D/route.ts#L7-L83):**
- Non-owners can self-leave freely.
- Owners can self-leave only if they're the sole member; otherwise must transfer ownership first.
- Admin / manager / owner can remove a non-owner; cannot remove the owner; cannot remove themselves; cannot leave the team without an owner.

**Ownership transfer — orgs only:**
- `POST /api/organizations/[id]/transfer-ownership` ([app/api/organizations/[id]/transfer-ownership/route.ts:11-111](app/api/organizations/%5Bid%5D/transfer-ownership/route.ts#L11-L111)): demotes current owner → `admin`, promotes new owner → `owner`, updates `organizations.owner_id`, rolls back on failure.
- Teams: no dedicated transfer endpoint found.
- Workflows: **no transfer endpoint exists at all**.

### Gap / contradiction / risk

- **Token-based org invites do not validate email at accept time.** The accept endpoint matches on `token`, not email. If the invited email is `alice@x.com` but the recipient signs up as `bob@y.com` and gets the link forwarded, Bob can claim the invite. This is a security finding stated as a fact — see §15.
- **`team_id` schema-mismatch warning in code.** The comment at [app/api/organizations/[id]/invite/route.ts:122-123](app/api/organizations/%5Bid%5D/invite/route.ts#L122-L123) is explicit about uncertainty. Whether the live DB has the column is unknown from code alone.
- **No cron cleanup of expired invitations.** `expire_old_team_invitations()` SQL function exists per schema audit but no cron route was found that invokes it; expired rows accumulate.
- **`organization_members` insert at organization create.** Per `ORGANIZATION_ROLES_MIGRATION.md`, this table was "NEVER IMPLEMENTED". The org create endpoint inserts into it anyway (see §4). Either the doc is wrong or org creation has a silent insert failure step.
- **Team-invitation send requires the invitee to already exist as a user.** It uses `invitee_id`, not email. So inviting someone who has never signed up is impossible via this flow — the org invite token flow is the only path for net-new users, and that flow has the email-validation gap above.

### Files & references

- [app/api/teams/[id]/members/route.ts:102-293](app/api/teams/%5Bid%5D/members/route.ts#L102-L293)
- [app/api/organizations/[id]/invite/route.ts:8-189](app/api/organizations/%5Bid%5D/invite/route.ts#L8-L189)
- [app/api/teams/invitations/[id]/route.ts:45-137](app/api/teams/invitations/%5Bid%5D/route.ts#L45-L137)
- [app/api/invitations/accept/route.ts:7-140](app/api/invitations/accept/route.ts#L7-L140)
- [app/api/teams/[id]/members/[userId]/route.ts:7-83](app/api/teams/%5Bid%5D/members/%5BuserId%5D/route.ts#L7-L83)
- [app/api/organizations/[id]/transfer-ownership/route.ts:11-111](app/api/organizations/%5Bid%5D/transfer-ownership/route.ts#L11-L111)
- [app/invite/page.tsx:1-307](app/invite/page.tsx#L1-L307)

---

## 6. Workflow Ownership and Access Flow

### Intended

- Personal workflows: owned by creator, optionally shareable view+execute to specific users.
- Team workflows: accessible to all team members with role-gated actions (view / edit / execute / manage).
- Org workflows: accessible to all org members with role-gated actions.
- The action-based matrix at [lib/workflows/authorizeWorkflowAccess.ts:13-45](lib/workflows/authorizeWorkflowAccess.ts#L13-L45) declares this intent cleanly:

| Scope | Owner / Admin | Manager | Lead / Member | HR / Finance | Guest |
|---|---|---|---|---|---|
| Team | view / edit / execute / manage | view / edit / execute | view (+ execute for member) | — | view |
| Org | view / edit / execute / manage | view / edit / execute | — | view | — |
| Personal | owner: all; shared user: view / execute | — | — | — | — |

### Actual — by operation

**List workflows — [app/api/workflows/route.ts:51-272](app/api/workflows/route.ts#L51-L272):**
- Default: unified view. Fetches all workflows the user has access to in one query path: personal (where user is owner), team (where user is `team_members`), org (where user is `organization_members`). Returns them merged, sorted by `updated_at` desc.
- With `?filter_context=personal | team | organization` and optional `workspace_id`, returns only that scope.

**Read workflow — [app/api/workflows/[id]/route.ts:45-48](app/api/workflows/%5Bid%5D/route.ts#L45-L48):**
- Uses `authorizeWorkflowAccess(user.id, workflow, 'view')`. Correct.

**Update workflow — [app/api/workflows/[id]/route.ts:143-168](app/api/workflows/%5Bid%5D/route.ts#L143-L168):**
- Inline ownership check: `user_id === user.id` OR team membership OR org membership.
- Does not go through the central `authorizeWorkflowAccess` matrix on this endpoint — uses an ad-hoc check.

**Delete workflow — [app/api/workflows/[id]/route.ts:689-748](app/api/workflows/%5Bid%5D/route.ts#L689-L748):**
- Only checks `user_id === user.id`. **Team / org context is not considered.** A user who is `owner` of a team workspace cannot delete a workflow created by another team member through this endpoint, because that workflow's `user_id` is the creator's, not theirs. Conversely, the workflow's creator can always delete it regardless of team/org policy.
- Hard delete (`DELETE FROM workflows ...`), despite `workflows.deleted_at` column existing (added in `20251121050700`). No trash retention, no restore.
- Cascades via DB FK: `workflow_nodes`, `workflow_edges`, `workflow_files`, `workflow_variables`, `trigger_poll_state` etc. **Does NOT cascade** to `workflow_executions` / `workflow_execution_sessions` / `task_billing_events` — those become orphaned by workflow_id.

**Activate workflow** — handled inline in update; rate-limited via `max_executions_per_hour` etc.

**Run workflow — [app/api/workflows/execute/route.ts:165-300](app/api/workflows/execute/route.ts#L165-L300) (critical):**
- Two branches based on `x-user-id` header presence.
  - **Webhook branch (header present):** fetch via service client; verify `workflow.user_id === headerUserId` (line 288–291). 403 on mismatch.
  - **Authenticated user branch (no header):** fetch via route-handler client; `userId = (await supabase.auth.getUser()).data.user.id` (line 294–299). **No workflow ownership check is performed**. The function flows directly into the billing gate.
- The team-suspension block at line 239–276 checks `workspace_type='team'` and looks up `teams.suspended_at` — but it checks suspension, not membership.
- **There is no call to `authorizeWorkflowAccess` on the `/execute` route.** Confirmed by reading the file in full from line 1 onward and from the imports.

**Run workflow (HITL stream) — [app/api/workflows/execute-stream/route.ts:160-167](app/api/workflows/execute-stream/route.ts#L160-L167):**
- This route DOES call `authorizeWorkflowAccess(user.id, workflow, 'execute')`.
- So an authenticated user blocked from `/execute-stream` (e.g. not a team member) can still hit `/execute` to trigger the same workflow.

**View run history — [app/api/workflows/[id]/executions/route.ts:11-96](app/api/workflows/%5Bid%5D/executions/route.ts#L11-L96):**
- Filters by `workflow_id = X AND user_id = authenticatedUser`. Returns only the requesting user's own runs.
- No `authorizeWorkflowAccess` call. Any authenticated user can query any workflow ID; the `user_id` filter ensures they only see their own runs, but this also means team members cannot see runs triggered by other members.

### Gap / contradiction / risk — stated directly

- **Critical: `/execute` is not gated by workflow ownership for authenticated users.** Any authenticated user who knows a workflow ID can POST and trigger execution. The workflow runs as the requesting user, but the billing debit lands on the workflow owner's account (via `scopeToBillingUser`, §9). This is a factual finding; severity is high; remediation is out of scope for this audit.
- **Authorization-matrix table queries reference tables that may not exist in the active schema:**
  - `workflow_shares` (line 72-77 of `authorizeWorkflowAccess.ts`) — dropped in `20260128044221_drop_unused_tables.sql:16`. Personal-workflow shared access therefore returns `null` and always falls through to `denied()`. Personal-workflow sharing is silently broken everywhere `authorizeWorkflowAccess` is used.
  - `organization_members` (line 118-123) — per `ORGANIZATION_ROLES_MIGRATION.md`, was "NEVER IMPLEMENTED". If the doc is correct, every org-scoped authorization check fails at the `not_member` branch unless the requesting user is the workflow's `user_id` (which is checked separately for the personal-scope branch only). This means org workflows may be effectively only-accessible-to-creator through this matrix.
- **`workflows.deleted_at` exists in schema but DELETE endpoint hard-deletes.** Either soft-delete was abandoned or never wired. Trash / restore UX is not present.
- **Workflow execution history is orphaned on workflow deletion.** `workflow_execution_sessions` / `execution_steps` / `session_side_effects` / `task_billing_events` have no FK cascade tied to the workflow. Compliance audit paths preserved across `userDeletionService.ts` waves don't apply on workflow delete.
- **Run history is per-user, not per-workflow.** Team / org members cannot see each other's runs. No team-level audit trail is exposed.

### Files & references

- [lib/workflows/authorizeWorkflowAccess.ts](lib/workflows/authorizeWorkflowAccess.ts)
- [app/api/workflows/route.ts:51-272](app/api/workflows/route.ts#L51-L272)
- [app/api/workflows/[id]/route.ts:45-48](app/api/workflows/%5Bid%5D/route.ts#L45-L48), [143-168](app/api/workflows/%5Bid%5D/route.ts#L143-L168), [689-748](app/api/workflows/%5Bid%5D/route.ts#L689-L748)
- [app/api/workflows/execute/route.ts:165-300](app/api/workflows/execute/route.ts#L165-L300)
- [app/api/workflows/execute-stream/route.ts:160-167](app/api/workflows/execute-stream/route.ts#L160-L167)
- [app/api/workflows/[id]/executions/route.ts:11-96](app/api/workflows/%5Bid%5D/executions/route.ts#L11-L96)
- [supabase/migrations/20260128044221_drop_unused_tables.sql:16](supabase/migrations/20260128044221_drop_unused_tables.sql#L16)
- [supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md](supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md)

---

## 7. Integration / OAuth Ownership and Sharing Flow

### Intended

Integrations should belong to the workspace the user was in when they clicked "Connect". Personal integrations are private to the user. Team / org integrations are accessible to members of that workspace. The `integration_shares` table (added in `20251121170000`) plus `sharing_scope` column enable explicit per-team or per-user grants on top of the workspace default.

### Actual

**OAuth URL generation — [app/api/integrations/auth/generate-url/route.ts:87-108](app/api/integrations/auth/generate-url/route.ts#L87-L108):**
- Client POSTs `workspaceType` and `workspaceId` in the request body. These are baked into the `state` parameter and sent to the provider.

**OAuth callback — [lib/integrations/oauth-callback-handler.ts:410-689](lib/integrations/oauth-callback-handler.ts#L410-L689):**
- Decodes state to get `userId`, `workspaceType`, `workspaceId`.
- Personal: writes `integrations` row with `user_id=userId`, `workspace_type='personal'`, `workspace_id=null` (line 452–456).
- Team / org: writes `integrations` row with `user_id=null`, `workspace_type='team'|'organization'`, `workspace_id=team_id|org_id`, `connected_by=userId` (line 644–687).
- Auto-grants permissions on team/org integrations via `autoGrantPermissionsForIntegration()`.
- Multi-account support: `provider_account_id`, `email`, `username`, `account_name`, `display_name`; unique constraint is `NULLS NOT DISTINCT (user_id, provider, email, workspace_id)`.

**Listing integrations — [app/api/integrations/route.ts:69-272](app/api/integrations/route.ts#L69-L272):**
- Filters by `user_id === user.id` for personal scope, OR `workspace_type IN ('team','organization') AND workspace_id IN <user's workspaces>` for shared scope.
- Implicit permission grants: `connected_by === user.id` → `admin`; everyone else → `use` (line 193–213).

**Runtime access check — [lib/workflows/security/integrationAccessValidator.ts:80-124](lib/workflows/security/integrationAccessValidator.ts#L80-L124):**
- Calls Postgres RPC `can_user_use_integration(p_user_id, p_integration_id)` which evaluates: owner? + integration_shares (direct or by team) + workspace_type='organization' (shared org-wide).

**Picking an integration at workflow runtime — [lib/workflows/executeNode.ts:175-217](lib/workflows/executeNode.ts#L175-L217):**
- Workflow node config carries an `integrationId` chosen at design time.
- Runtime: `getDecryptedAccessTokenById(integrationId, { userId, trustedServerContext? })` validates access against the **current request's userId** (which is the workflow owner for webhook-triggered runs, or the authenticated user for user-clicked runs).

### Gap / contradiction / risk

- **Tab-switching during OAuth lands integrations in unintended workspace.** State is captured at URL generation, not at callback. User has no chance to confirm at callback time.
- **No "this integration is shared with team X" UI badge audit was performed.** `sharing_scope` is present on the table; visible in `ServiceConnectionSelector.tsx`; presence on the integrations list page itself was not confirmed by this audit.
- **`integration_shares` for share-with-another-user works but is heavyweight.** Each share row holds either `shared_with_user_id` OR `shared_with_team_id` (CHECK constraint). Mass-sharing is one row per recipient.
- **Disconnecting an integration leaves workflows broken silently.** Workflows referencing the integration are not flagged. Next execution will fail at the action handler when token decryption returns null.
- **Webhook-triggered runs require the workflow owner to have integration access.** If the workflow was created by Alice (using her Gmail integration), then Alice was removed from the team, then a webhook fires — the run executes as Alice's user_id (because that's `workflow.user_id`), and `can_user_use_integration(Alice, ...)` is still true if Alice still owns the integration. So this generally works for webhooks. The asymmetric failure mode is the *opposite*: for a team-shared workflow where the integration was connected by a different user, the workflow owner may not have access to that integration unless explicitly shared. (See §8 for execution-path details.)

### Files & references

- [app/api/integrations/auth/generate-url/route.ts:87-108](app/api/integrations/auth/generate-url/route.ts#L87-L108)
- [lib/integrations/oauth-callback-handler.ts:410-689](lib/integrations/oauth-callback-handler.ts#L410-L689)
- [app/api/integrations/route.ts:69-272](app/api/integrations/route.ts#L69-L272)
- [lib/workflows/security/integrationAccessValidator.ts:80-124](lib/workflows/security/integrationAccessValidator.ts#L80-L124)
- [lib/workflows/executeNode.ts:175-217](lib/workflows/executeNode.ts#L175-L217)
- [supabase/migrations/20251121170000_add_integration_sharing.sql](supabase/migrations/20251121170000_add_integration_sharing.sql)

---

## 8. Workflow Execution / Run Ownership

### Intended

When a workflow runs, the run should be attributed to a user identity (for audit and integration-access purposes) and the cost should be debited from the entity that "owns" the workflow's billing scope. Both manual and trigger-fired runs should follow the same rules with reasonable variations.

### Actual

**Manual user-clicked run** — see §6. `userId = auth.getUser().data.user.id`. The run row's `user_id` is the requesting user. No workflow-ownership gate.

**Trigger-fired (webhook) run — [lib/webhooks/execute.ts:146-320](lib/webhooks/execute.ts#L146-L320) and [lib/webhooks/processor.ts:87-89](lib/webhooks/processor.ts#L87-L89):**
- Webhook processor finds matching workflows and dispatches `executeWebhookWorkflow({ workflowId, userId, ... })`.
- `userId` passed in is the **workflow's owner** (`workflow.user_id` from the match query).
- v1 dispatch (`/api/workflows/execute` with `x-user-id` header) hits the route at [app/api/workflows/execute/route.ts:278-300](app/api/workflows/execute/route.ts#L278-L300), which verifies `workflow.user_id === headerUserId` and proceeds.
- v2 dispatch (when `ENABLE_V2_LIVE_EXECUTION` is on AND owner is opted in) goes via `WorkflowExecutionService.executeWorkflow` directly.

**Run row attribution:**
- `workflow_execution_sessions.user_id` is the executing user (workflow owner for webhook runs, authenticated user for manual runs).
- `root_execution_id` + `workflow_definition_hash` are set for retry-lineage tracking.

**Billing at run time:** see §9.

**Integration credentials at run time:**
- The integration_id baked into the node config is the one used.
- Access is validated against the executing user (the run's `user_id`).
- For webhook-triggered runs, this is the workflow owner — usually fine because the workflow owner is who originally configured the integration.
- For *team-shared workflows*, if the workflow node references an integration owned by a different team member, the workflow owner (whose `user_id` becomes the run identity) needs explicit access via `integration_shares` — otherwise the action handler will fail mid-run when token decryption returns null.

### Gap / contradiction / risk

- **`/execute` has the auth gap from §6 — runs can be triggered by any authenticated user on any workflow ID.**
- **Team-shared workflows + cross-member integrations are fragile.** Works only when integrations are explicitly shared at the right grain.
- **No run-level "who triggered" record beyond `user_id`.** For webhook runs, the run row carries the workflow owner's user_id. There is no distinct "trigger source" field on the run that records "Slack message webhook from Bob" — the trigger context lives in `webhookEvent` metadata blob on the execution session, not as queryable columns.
- **`payment_failed` / `past_due` does not pause executions.** The execute gate only blocks on `insufficient_balance` and `subscription_inactive`. A `past_due` subscription continues to run workflows.

### Files & references

- [lib/webhooks/execute.ts:146-320](lib/webhooks/execute.ts#L146-L320)
- [lib/webhooks/processor.ts:87-89](lib/webhooks/processor.ts#L87-L89)
- [app/api/workflows/execute/route.ts:278-300](app/api/workflows/execute/route.ts#L278-L300), [449](app/api/workflows/execute/route.ts#L449), [458-466](app/api/workflows/execute/route.ts#L458-L466)
- [lib/services/workflowExecutionService.ts](lib/services/workflowExecutionService.ts) (v2 dispatch entry)

---

## 9. Billing / Subscription Ownership Flow

### Intended

`subscriptions` carries `user_id`, `team_id`, `organization_id` columns — implying that subscriptions can be owned by any of the three. The `billing_scope_*` columns on `workflows` imply runtime debits should land on the entity that owns the workflow's scope.

### Actual

**Subscription ownership in writes:**
- Stripe webhook handler at [app/api/webhooks/stripe-billing/route.ts](app/api/webhooks/stripe-billing/route.ts) extracts `user_id` from session metadata or customer email and writes to `subscriptions` with `user_id` populated. `team_id` / `organization_id` are not populated by the live webhook flow.
- Cancel endpoint [app/api/billing/subscriptions/[id]/cancel/route.ts:24-29](app/api/billing/subscriptions/%5Bid%5D/cancel/route.ts#L24-L29) gates on `user_id === user.id`. Team / org subscription holders can't cancel via this endpoint.

**Runtime debit chain — confirmed by direct file read:**
1. Workflow row carries `billing_scope_type` + `billing_scope_id` (set at workflow create time from current workspace context, never changed).
2. `runBillingGate` ([lib/billing/executionBillingGate.ts](lib/billing/executionBillingGate.ts)) calls `resolveBillingScope(workflow)` → `{ scopeType, scopeId }`.
3. `scopeToBillingUser(scope)` ([lib/billing/scopeToBillingUser.ts:14-71](lib/billing/scopeToBillingUser.ts#L14-L71)):
   - `scopeType='user'` → returns `scopeId` directly.
   - `scopeType='team'` → SELECT `team_members.user_id WHERE team_id=scopeId AND role='owner' LIMIT 1`. Throws "Billing integrity failure" if no owner found.
   - `scopeType='organization'` → SELECT `organizations.owner_id WHERE id=scopeId`. Throws if missing.
4. `deductTasksAtomic(billingUserId, amount, ...)` calls the Postgres RPC `deduct_tasks_if_available(p_user_id, p_amount)` which is keyed on the user_profiles row.

**Crucially**, the file [lib/billing/scopeToBillingUser.ts:7-13](lib/billing/scopeToBillingUser.ts#L7-L13) carries this comment verbatim:

> Maps a canonical billing scope to the user_profiles row for the current billing backend. This exists because subscriptions currently live on user_profiles, not on scopes directly. **DELETE THIS when scope-native subscriptions exist (Phase 6).**

So the divergence is explicit: the schema *intends* scope-native subscriptions; the code documents that the implementation is a shim until Phase 6 (which has not landed).

**Stripe subscription / payment failure events:**
- `customer.subscription.deleted` ([app/api/webhooks/stripe-billing/route.ts:592-641](app/api/webhooks/stripe-billing/route.ts#L592-L641)): marks subscription `status='canceled'`, downgrades user role to `'free'`, and starts a 5-day grace period on teams owned by the user (`grace_period_ends_at = now + 5 days`, `suspension_reason='owner_downgraded'`).
- `invoice.payment_failed`: handler is registered but the implementation is short / not visibly blocking. Subscription status likely becomes `past_due`. The execute-gate path does not check for `past_due`.
- Team suspension is set later by the cron at [app/api/cron/check-team-suspensions/route.ts](app/api/cron/check-team-suspensions/route.ts), which observes `grace_period_ends_at < now() AND suspended_at IS NULL` and sets `suspended_at`.
- `/execute` enforcement: at line 251 it rejects workflows whose team is suspended; at line 266 it allows execution during grace period with a warning log only.

### Gap / contradiction / risk

- **Subscription ownership and runtime debit ownership diverge from the schema's stated multi-entity intent.** Schema columns `subscriptions.team_id` and `subscriptions.organization_id` exist; writes don't populate them; reads / cancellation don't honor them.
- **Team / org workflows always charge a human's quota.** A workflow with `billing_scope_type='team'` debits the team-owner's `user_profiles.tasks_used`. The team owner's personal usage and the team's "official" usage are the same counter. `teams.tasks_limit` / `teams.tasks_used` columns from the schema are not read by the runtime billing path.
- **`past_due` Stripe status does not pause executions.** Only `subscription_inactive` (no active subscription at all) and `insufficient_balance` (out of quota) block. A user past-due on payment can continue running workflows until the next billing-period reset triggers a quota recompute.
- **Auto-buy on insufficient balance is fire-and-forget.** [lib/billing/executionBillingGate.ts:167-188](lib/billing/executionBillingGate.ts#L167-L188) triggers `triggerAutoBuyIfEnabled` but does not await it. The current execution still returns 402. The user has to retry after the auto-buy charge settles. If the charge requires 3DS (SCA) or fails, the user is blocked until they resolve it manually.

### Files & references

- [lib/billing/resolveBillingScope.ts](lib/billing/resolveBillingScope.ts)
- [lib/billing/scopeToBillingUser.ts:14-71](lib/billing/scopeToBillingUser.ts#L14-L71)
- [lib/billing/executionBillingGate.ts:113-206](lib/billing/executionBillingGate.ts#L113-L206)
- [lib/workflows/taskDeduction.ts](lib/workflows/taskDeduction.ts)
- [app/api/billing/subscriptions/[id]/cancel/route.ts:24-29](app/api/billing/subscriptions/%5Bid%5D/cancel/route.ts#L24-L29)
- [app/api/webhooks/stripe-billing/route.ts:592-641](app/api/webhooks/stripe-billing/route.ts#L592-L641)
- [app/api/cron/check-team-suspensions/route.ts](app/api/cron/check-team-suspensions/route.ts)
- [supabase/migrations/20260504000004_rpc_v3_packs.sql](supabase/migrations/20260504000004_rpc_v3_packs.sql)

---

## 10. Usage / Task-Limit Flow

### Intended

The schema models task quotas at multiple levels: `plans.tasks_per_month`, `user_profiles.tasks_used / tasks_limit`, `teams.tasks_used / tasks_limit`. Implies that teams have an independent budget.

### Actual

- Runtime quota debits exclusively go to `user_profiles.tasks_used` of the billing user resolved per §9.
- `teams.tasks_used` and `teams.tasks_limit` columns are not read by the runtime billing path; this audit did not locate any call site that increments / decrements them.
- Pack purchases (`pack_purchases`) and overage events (`task_overage_events`) are all per-user as well.
- The denormalized cache `user_profiles.task_pack_balance` is per-user.
- Period reset is per-user (`billing_period_start` / `billing_period_end` columns on `user_profiles`); the `deduct_tasks_if_available` RPC auto-resets expired periods inline per code comments.

### Gap / contradiction / risk

- **Team / org "shared quota" is a label, not a reality.** A team owner who is also a heavy personal user will share their personal quota with all team workflows.
- **No per-member usage attribution within a team.** All team-workflow runs are debited to the team owner; there is no record of which team member triggered which run from a billing perspective (the run row carries the triggering user, but the billing event is keyed to the team owner).
- **Pack balance not transferrable between users.** If the team owner buys a pack, only their `user_profiles.task_pack_balance` increments. Team members can't buy packs that benefit team workflows.

### Files & references

- [lib/billing/taskDeduction.ts](lib/workflows/taskDeduction.ts) (and `lib/workflows/taskDeduction.ts`)
- [lib/billing/scopeToBillingUser.ts:14-71](lib/billing/scopeToBillingUser.ts#L14-L71)
- [supabase/migrations/20260504000003_add_task_packs.sql](supabase/migrations/20260504000003_add_task_packs.sql)
- [supabase/migrations/20260504000001_add_overage_columns.sql](supabase/migrations/20260504000001_add_overage_columns.sql)

---

## 11. Settings / Navigation Flow

### Intended

Distinct settings surfaces per entity: per-user account settings; per-team settings + members; per-org settings + teams + billing + SSO; subscription / packs / overage management.

### Actual

- **Navigation config — [lib/navigation/nav-config.ts:37-155](lib/navigation/nav-config.ts#L37-L155):** sidebar entries for Workflows, Templates, Connections, Assistant, Analytics, Organization, Teams, Billing, Settings, Admin. App shell pattern is IconRail + NavPanel + UnifiedSidebar.
- **Account settings — `/settings`** ([app/(app)/settings/page.tsx](app/(app)/settings/page.tsx)) — profile, notifications, 2FA, sessions, theme.
- **Org settings — `/org/[slug]/settings/[[...section]]`** with sub-sections General / Apps / Teams / Members / Billing / SSO.
- **Team settings — `/teams/[slug]`** + `/teams/[slug]/members`.
- **Subscription — `/subscription`** ([app/(app)/subscription/page.tsx](app/(app)/subscription/page.tsx)) — plan comparison, current plan, overage toggle, task packs.
- **Admin — `/admin/billing`** read-only view across users.
- **Workspace switcher — `OrganizationSwitcher` component** dispatches `'organization-changed'` event consumed by `useWorkspaceContext`.

### Gap / contradiction / risk

- **No URL → workspace-context binding.** Sitting on `/org/acme` does not set the current workspace; you still rely on the switcher click to update localStorage.
- **No "workspace switcher" badge on the Workflows or Connections pages confirming "you are viewing X."** This audit did not confirm the absence in component bodies; flagging as "unverified".
- **Settings pages and the actual data they configure are not always aligned in scope.** For example, `/settings` configures per-user notifications, but workflow notifications are also configured per-workflow under workflow settings — discovery is split.

### Files & references

- [lib/navigation/nav-config.ts:37-155](lib/navigation/nav-config.ts#L37-L155)
- [components/app-shell/AppShell.tsx](components/app-shell/AppShell.tsx)
- [components/app-shell/UnifiedSidebar.tsx](components/app-shell/UnifiedSidebar.tsx)
- [app/(app)/settings/page.tsx](app/(app)/settings/page.tsx)
- [app/(app)/org/[slug]/settings/[[...section]]/page.tsx](app/(app)/org/%5Bslug%5D/settings/%5B%5B...section%5D%5D/page.tsx)
- [app/(app)/teams/[slug]/members/page.tsx](app/(app)/teams/%5Bslug%5D/members/page.tsx)

---

## 12. Deletion / Leave / Transfer Flow

### Intended

Standard SaaS deletion semantics: deleting a workflow / team / org should clean up dependent records and either preserve or remove related history per policy. Members leaving should not orphan resources. Ownership transfers should be possible.

### Actual

**Delete workflow** — hard delete. See §6. Execution sessions are orphaned. Soft-delete column unused.

**Delete integration** — no dedicated DELETE endpoint located in this audit. Disconnect (token revocation) happens via OAuth disconnect flows; physical row removal happens via the user-deletion service Wave 3 or via integration_shares cleanup.

**Delete team** — no dedicated DELETE endpoint located. Wave-based deletion happens in `userDeletionService.ts` when the team's creator is deleted.

**Delete organization** — [app/api/organizations/[id]/route.ts:194-285](app/api/organizations/%5Bid%5D/route.ts#L194-L285):
- Deletes `organization_invitations`.
- For each team in the org, deletes its `team_members`.
- Deletes `audit_logs` (if present).
- Deletes the `organizations` row (cascades to `sso_configurations`).
- **Does not move team workflows to trash, does not detach team workflows from the org-scoped workspace.** Those workflows remain in the `workflows` table with `workspace_type='organization', workspace_id=<deleted_org_id>`.

**Delete workspace** — no dedicated DELETE endpoint located. Schema `ON DELETE CASCADE` from `workspaces` to `workspace_memberships`.

**Delete user** — [lib/services/userDeletionService.ts](lib/services/userDeletionService.ts), 6-wave model:
- Wave 1: deepest children (executions, triggers, ai chat history, workflow_nodes/edges/files/variables, notifications).
- Wave 2: mid-level (workflow_folders, team_activity, team_invitations, team_members, subscriptions, api_keys).
- Wave 3: high-level parents (integrations, workflows, flow_v2_definitions).
- Wave 4: top-level (organization_members, workspace_memberships, teams created_by, organizations owner_id, workspaces).
- Wave 5: audit logs — ANONYMIZED (not deleted) for compliance.
- Wave 6: `user_profiles` deleted.
- Modes: `full | partial | anonymize`.

**Ownership transfer:**
- Organizations: explicit endpoint, see §5.
- Teams: not located.
- Workflows: **does not exist** — searched for `transferOwnership`, `transfer_ownership`, `change_owner`; no results in workflow paths.

**Team / org / workspace suspension:**
- `teams.suspended_at`, `teams.grace_period_ends_at`, `teams.suspension_reason` exist.
- `/api/cron/check-team-suspensions/route.ts` flips `suspended_at` when grace expires and emits suspension notification via `create_suspension_notification` RPC.
- Suspension enforcement at execute path: line 251 (suspended → 403). Grace period: warning logged, execution allowed.

### Gap / contradiction / risk

- **No workflow ownership transfer.** When the workflow creator leaves a team / org, the workflow remains attributed to them by `user_id`. From the team/org perspective the workflow is owned by an outsider.
- **Org delete orphans team workflows.** They sit pointing at a deleted org_id.
- **User delete is not atomic across waves.** A mid-wave failure can leave partial state. The service does retry / log, but transactional rollback across all 6 waves is not present.
- **Hard workflow delete + orphaned execution history is a data-loss / audit gap.** Run history for the workflow becomes detached from any workflow row; UI surfaces that query by workflow_id will simply show empty.
- **No "leave team" UX preserves the user's workflows.** If a user leaves a team, their workflows that were created with `workspace_type='team', workspace_id=teamId` remain in the team — they can no longer access them via team-scoped routes, but the workflows still exist there.

### Files & references

- [app/api/workflows/[id]/route.ts:689-748](app/api/workflows/%5Bid%5D/route.ts#L689-L748)
- [app/api/organizations/[id]/route.ts:194-285](app/api/organizations/%5Bid%5D/route.ts#L194-L285)
- [app/api/organizations/[id]/transfer-ownership/route.ts:11-111](app/api/organizations/%5Bid%5D/transfer-ownership/route.ts#L11-L111)
- [lib/services/userDeletionService.ts](lib/services/userDeletionService.ts)
- [app/api/cron/check-team-suspensions/route.ts](app/api/cron/check-team-suspensions/route.ts)
- [supabase/migrations/20251121050700_add_deleted_at_to_workflows.sql](supabase/migrations/20251121050700_add_deleted_at_to_workflows.sql)

---

## 13. Operation-by-Operation Permission Matrix

| Operation | Schema owner | API check actually performed | RLS | UI assumption | Inconsistency / risk |
|---|---|---|---|---|---|
| List workflows | `user_id` + workspace context | Unified: `user_id=me` OR member of team/org workspace | Service role (no RLS) | Sidebar "Workflows" returns all accessible | None significant |
| Read workflow | `user_id` + workspace context | `authorizeWorkflowAccess(view)` matrix | Service role | Owner / member | Org-scope queries `organization_members` which may not exist (§15) |
| Update workflow | `user_id` + workspace context | Ad-hoc: `user_id=me` OR team member OR org member | Service role | Per-role matrix from settings | Bypasses central matrix on `/[id]` PUT |
| Delete workflow | `user_id` + workspace context | `user_id=me` only | Service role | Owner only | Team owners cannot delete team-mate workflows |
| Activate workflow | Inline with update | Same as update | Service role | Per-role matrix | Same gap as update |
| Run workflow `/execute` | `billing_scope_id` (debited) | **Webhook:** `workflow.user_id=headerUserId`. **Auth:** no ownership check at all. | Service role / route handler | Per-role matrix from settings | **HIGH: any authenticated user can run any workflow ID. Bills owner.** |
| Run workflow `/execute-stream` | `billing_scope_id` | `authorizeWorkflowAccess(execute)` matrix | Route handler | Per-role matrix | Asymmetric vs `/execute` |
| List integrations | `user_id` + workspace context | `user_id=me` OR member of workspace + integration_shares | Service role | Owner / shared list | UI badge for sharing scope not audited |
| Connect integration | None at create — set on OAuth callback | Workspace context from request body, baked into state | n/a | Whatever current workspace UI shows | Tab-switch race → wrong workspace |
| Disconnect integration | `user_id` or workspace | Per-provider; no general DELETE endpoint located | Service role | Owner | Workflows referencing it break silently |
| List members | `team_id` / `organization_id` | `requireTeamRole(me, team, allowed)` / `hasOrgPermission` | Service role | Per-role matrix | Org checks against possibly-nonexistent table (§15) |
| Invite member | `team_id` / `organization_id` | `requireTeamRole(['owner','admin','manager'])` for teams; org-admin for orgs | Service role | Per-role matrix | Org invites have email-validation gap (§5) |
| Remove member | `team_id` / `organization_id` | Cannot remove owner; cannot remove self via admin path | Service role | Per-role matrix | Owner-must-be-last-to-leave assertion is sole owner-loss guard |
| Manage billing | `user_id` (in practice) | `user_id=me` only | Service role | Subscription owner | Team / org subscriptions unreachable through cancel endpoint |
| Cancel subscription | `user_id` (in practice) | `user_id=me` only | Service role | Subscription owner | Same as above |
| View usage | `user_id` | Self only | Service role | Per-user | No team-level aggregated view located |
| View run history | `workflow_id` | `workflow_id=X AND user_id=me` — and **no** workflow-access check | Service role | Per-workflow run list | Per-user silo; no team audit trail; no workflow-access gate |

---

## 14. Intended vs Actual Behavior Table (per major flow)

| Flow | Product-implied intent | Code actual | Divergence |
|---|---|---|---|
| Signup → personal workspace | Personal workspace row created for each user | No `workspaces` insert | `workspaces` exists but is unpopulated for personal scope |
| Current workspace persistence | Last-used workspace remembered across sessions | localStorage only, per-device | Fresh device / browser → reset to personal |
| Workflow ownership transfer | Possible (sister to org transfer) | No endpoint exists | Creator is permanent owner |
| Workflow access on /execute | Role-matrix gated | Webhook: owner-match. Auth: no gate. | Asymmetric vs /execute-stream |
| Workflow access on /executions (history) | Workflow-access gated | `workflow_id + user_id=me` only | Per-user silo, no team audit |
| Workflow soft-delete | `deleted_at` indicates intent | Hard delete | Column unused; no trash UX |
| Org delete cascades | Team workflows cleaned up or detached | Org row deleted; team workflows orphaned | No cleanup of `workspace_type='organization'` workflows |
| Personal workflow sharing | `workflow_shares` table used | Table dropped (20260128044221); query returns null | Sharing silently nonfunctional |
| Org-scope authorization | `organization_members` queried for role | Migration doc says table NEVER IMPLEMENTED | Either doc is stale OR every org-scope auth check fails |
| Team billing | Team has own quota | Team scope resolves to team-owner user_profiles | Schema columns `teams.tasks_*` unused at runtime |
| Org billing | Org has own quota | Org scope resolves to org-owner user_profiles | Same; columns unused |
| Subscription cancel | Team / org owner can cancel team subscription | `user_id=me` only | Multi-entity subscription is schema-only |
| `past_due` payment | Pauses workflows / blocks runs | Not checked in execute gate | Workflows continue to run while past-due |
| Auto-buy unblocks current execution | Synchronous top-up | Fire-and-forget; current run still 402s | User must retry after charge settles |
| Org invite email validation | Recipient email must match | Token-based accept; email not re-checked | Whoever has the token + a fresh signup can claim |
| Integration workspace context | Where user is at callback time | Captured at URL-gen time | Tab-switch race → wrong workspace |
| Integration access for team workflows | Workflow-owner's integrations work everywhere | Webhook runs use workflow-owner identity; team-mate's integration may not be accessible | Cross-member integration use needs explicit grants |

---

## 15. Contradictions and Missing Rules (facts only)

### Authorization contradictions

- **`/execute` vs `/execute-stream` authorization asymmetry.** /execute does not call `authorizeWorkflowAccess`; /execute-stream does. Same workflow can be unreachable via stream but executable via /execute by any authenticated user.
- **DELETE workflow ignores team / org policy.** Only `user_id` match. Team owners cannot delete team-mate workflows; workflow creators can always delete regardless of team/org role.
- **Subscription cancellation ignores team / org subscription owners.** Multi-entity subscription rows are unreachable through the cancel endpoint.

### Schema-vs-code contradictions

- **`workflow_shares` queried but dropped.** [lib/workflows/authorizeWorkflowAccess.ts:72-77](lib/workflows/authorizeWorkflowAccess.ts#L72-L77) reads from `workflow_shares`. The table was dropped in [supabase/migrations/20260128044221_drop_unused_tables.sql:16](supabase/migrations/20260128044221_drop_unused_tables.sql#L16) and never restored. **In live DB this query returns null, every time, silently.** Personal-workflow sharing is therefore broken anywhere that goes through this matrix.
- **`organization_members` queried but possibly never created.** [lib/workflows/authorizeWorkflowAccess.ts:118-123](lib/workflows/authorizeWorkflowAccess.ts#L118-L123) reads from `organization_members`. [supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md](supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md) explicitly states "Organization-level roles (`organization_members` table) were NEVER implemented." If the doc is correct, every org-scope authorization check fails at the `not_member` branch. The `migrations_backup/20251103000006_create_organization_members_and_leave_functionality.sql` file exists, but it lives in `migrations_backup/`, not active `migrations/`. **The audit cannot determine from code alone whether the live DB actually has this table.** This is the single most important open question for verification.
- **`teams.tasks_limit` / `teams.tasks_used` columns exist; never read by billing path.** Schema declares team-level quotas; runtime ignores them.
- **`workflows.deleted_at` column exists; DELETE endpoint hard-deletes.** Soft-delete intent abandoned or never wired.
- **`subscriptions.team_id` and `subscriptions.organization_id` columns exist; never populated by writes.** Multi-entity subscription model is schema-only.
- **`user_profiles.default_workspace_id` / `default_workspace_type` columns exist; not written by signup or login.** Default-workspace persistence is not wired.

### Migration-state ambiguity

- **`migrations_backup/` vs active `migrations/` divergence.** A large drop+restore migration sequence in late Jan 2026 dropped 24 tables ([20260128044221_drop_unused_tables.sql](supabase/migrations/20260128044221_drop_unused_tables.sql)) and restored only `workspaces` + `workspace_memberships` ([20260129200000_restore_workspace_tables.sql](supabase/migrations/20260129200000_restore_workspace_tables.sql)). The `migrations_backup/` directory contains earlier migrations including teams / team_members / organizations / team_invitations / organization_members / organization_invitations creates. Whether those backup migrations ever ran in production is **not determinable from code**. `types/database.types.ts` lists types for many of these tables but generated types reflect whatever was in the DB at the time of generation, not necessarily the active migration set.
- **`WORKSPACE_MIGRATION_README.md` describes a 6-step migration where Step 6 (BREAKING) was "NOT YET RUN".** So V1 may be in a half-migrated state where old and new schemas coexist.

### Missing rules / endpoints

- **No workflow ownership transfer endpoint.**
- **No team ownership transfer endpoint.** (Org transfer endpoint exists; team does not.)
- **No team-deletion endpoint.** Teams are cleaned up via user-deletion service waves only.
- **No team-level run history / audit view.**
- **No team-level usage / billing summary.**
- **No cron cleanup of expired `team_invitations` / `organization_invitations`.**
- **No `past_due` → workflow pause logic.**
- **No "your integration is being used in a team workflow" notification on disconnect.**

### Security findings (factual)

- **Authenticated users can trigger execution of any workflow they know the ID of via `/execute`.** Bills the owner. (§6, §13.)
- **Org-invite tokens can be claimed by an unrelated email.** Token-based accept does not re-validate the email matches the invite. (§5.)
- **Team-suspension grace-period workflows continue to execute.** Five days of free runtime after subscription cancellation. (§9.)

---

## 16. Current V2 Factual Ownership / Flow Snapshot

Verified by direct glob and read of V2 migrations + V2 API surface.

**Migrations present in V2 (`c:\Users\marcu\source\repos\ChainReactV2\supabase\migrations\`):**
`initial_helpers`, `user_profiles`, `integrations`, `workflows` (+ `workflow_revisions`), `trigger_resources_and_dedup`, `workflow_runs`, `user_billing`, `oauth_states`, `notifications`, `workflow_runs_notification_dedup`, `hubspot_app_subscriptions` (+ refs), `workflow_files`, `workflow_runs_test_mode`, `notifications_high_risk_audit_types`, `task_usage_events`, `ai_cost_events`, `reserve_reconcile_billing`, `billing_shadow_comparisons`, `workflow_runs_pre_run_lifecycle`, `builder_agent_threads`, `workflow_run_stats_view`.

**Notably absent:** no `workspaces`, no `teams`, no `organizations`, no `workspace_members` / `team_members` / `organization_members`, no `team_invitations` / `organization_invitations`, no `integration_shares`, no `workflow_shares`, no subscriptions table (V2 uses `user_billing` directly).

**Ownership in V2:**

| Entity | Owner column | RLS |
|---|---|---|
| `user_profiles` | `id` (= auth.users.id) | `auth.uid() = id` |
| `integrations` | `user_id` | `auth.uid() = user_id` |
| `workflows` | `user_id` | `auth.uid() = user_id` |
| `workflow_revisions` | `user_id` | `auth.uid() = user_id` (insert-only after) |
| `workflow_runs` | `user_id` | `auth.uid() = user_id` |
| `user_billing` | `user_id` (PK) | `auth.uid() = user_id` read-only; writes via SECURITY DEFINER RPC `deduct_tasks_if_available(p_user_id, p_amount)` |
| `notifications` | `user_id` | `auth.uid() = user_id` |
| `builder_agent_threads` | `user_id` | `auth.uid() = user_id` |

**API surface in V2 (`app/api/`):** integrations OAuth (`/connect`, `/callback`, `/ingest`), cron (`/poll-triggers`, `/release-expired-reservations`, `/run-scheduled-triggers`), webhooks (`/slack`, `/discord`, `/gmail`, etc.). No `/workspaces`, `/teams`, `/organizations`, `/invitations`, or sharing routes.

**Sharing / multi-tenancy in V2:** none. No mechanism for one user to access another user's workflow, integration, or run.

**Billing in V2:** `user_billing(user_id, tasks_limit, tasks_used, period_started_at)`; atomic deduct via RPC. No subscription table; subscription/Stripe state may be tracked elsewhere (this audit did not exhaustively trace it).

V2 is intentionally a pure per-user model today. No comparison verdict offered.

---

## 17. Open Questions for Marcus / ChatGPT

These are neutral, decision-shaped questions surfaced by the audit. They do not propose answers.

1. **Should V2 carry any concept of shared workspaces / teams / organizations at all, or remain pure per-user?** V1's complexity is real; V2's simplicity is also real.
2. **If shared ownership exists in V2, what is the single ownership column on workflows / integrations / runs / billing?** (account_id? workspace_id? user_id only with a separate sharing table?)
3. **If shared ownership exists, who owns the subscription?** Per-user, per-account, per-workspace? Should subscriptions be scope-native from day one (the thing `scopeToBillingUser` exists as a shim against)?
4. **Should workflow ownership transfer exist?** V1 has it for orgs but not workflows.
5. **What is the intended behavior when a member leaves a workspace/team/org?** Do their workflows go with them? Stay with the workspace? Get transferred to an admin?
6. **Should integration credentials be personal-only, workspace-shared, or both?** V1 attempts both; the wiring is fragile.
7. **For trigger-fired runs in a shared model, whose identity executes the run?** Workflow creator? Workspace service identity? "First admin"?
8. **Should billing block on `past_due`, or only on missing subscription / quota?** V1 currently only blocks the latter two.
9. **Is auto-buy expected to unblock the current execution, or only the next one?** V1 chose the latter; user-visible UX impact is non-trivial.
10. **Should workflow run history be per-user or per-workflow (visible to all who can access the workflow)?** V1 silos per-user.
11. **Should soft-delete + trash be wired for workflows?** Column exists; semantics not used.
12. **Should there be a "current workspace" persisted in DB (not just localStorage), and should URL routes set it?**
13. **For org invitations, should email-match be enforced at accept time, or is the token-only model acceptable?**
14. **Should there be a team-level usage summary and a team-level audit trail?**
15. **What's the migration story for V1 users into whatever V2 ownership model is decided?** (Audit does not propose; flags as a decision.)

---

## 18. Files / Code References Audited

Auth / session / signup:
- [app/api/auth/signup/route.ts](app/api/auth/signup/route.ts)
- [app/api/auth/callback/route.ts](app/api/auth/callback/route.ts)
- [lib/auth/ensureUserProfile.ts](lib/auth/ensureUserProfile.ts)
- [lib/utils/profile-defaults.ts](lib/utils/profile-defaults.ts)
- [lib/auth/session.ts](lib/auth/session.ts)
- [lib/auth/getAuthHeader.ts](lib/auth/getAuthHeader.ts)
- [middleware.ts](middleware.ts)

Workflow ownership / access:
- [lib/workflows/authorizeWorkflowAccess.ts](lib/workflows/authorizeWorkflowAccess.ts)
- [app/api/workflows/route.ts](app/api/workflows/route.ts)
- [app/api/workflows/[id]/route.ts](app/api/workflows/%5Bid%5D/route.ts)
- [app/api/workflows/execute/route.ts](app/api/workflows/execute/route.ts)
- [app/api/workflows/execute-stream/route.ts](app/api/workflows/execute-stream/route.ts)
- [app/api/workflows/[id]/executions/route.ts](app/api/workflows/%5Bid%5D/executions/route.ts)
- [hooks/useCreateAndOpenWorkflow.ts](hooks/useCreateAndOpenWorkflow.ts)
- [stores/workflowStore.ts](stores/workflowStore.ts)
- [supabase/migrations/20260412000005_create_workflow_atomic.sql](supabase/migrations/20260412000005_create_workflow_atomic.sql)

Integration ownership / sharing:
- [lib/integrations/oauth-callback-handler.ts](lib/integrations/oauth-callback-handler.ts)
- [app/api/integrations/auth/generate-url/route.ts](app/api/integrations/auth/generate-url/route.ts)
- [app/api/integrations/route.ts](app/api/integrations/route.ts)
- [lib/workflows/security/integrationAccessValidator.ts](lib/workflows/security/integrationAccessValidator.ts)
- [lib/workflows/executeNode.ts](lib/workflows/executeNode.ts)
- [supabase/migrations/20251121160000_enable_multi_account_integrations.sql](supabase/migrations/20251121160000_enable_multi_account_integrations.sql)
- [supabase/migrations/20251121170000_add_integration_sharing.sql](supabase/migrations/20251121170000_add_integration_sharing.sql)

Billing / usage:
- [lib/billing/resolveBillingScope.ts](lib/billing/resolveBillingScope.ts)
- [lib/billing/scopeToBillingUser.ts](lib/billing/scopeToBillingUser.ts)
- [lib/billing/executionBillingGate.ts](lib/billing/executionBillingGate.ts)
- [lib/billing/buildWorkflowScopeFields.ts](lib/billing/buildWorkflowScopeFields.ts)
- [lib/workflows/taskDeduction.ts](lib/workflows/taskDeduction.ts)
- [app/api/billing/subscriptions/[id]/cancel/route.ts](app/api/billing/subscriptions/%5Bid%5D/cancel/route.ts)
- [app/api/webhooks/stripe-billing/route.ts](app/api/webhooks/stripe-billing/route.ts)
- [app/api/cron/check-team-suspensions/route.ts](app/api/cron/check-team-suspensions/route.ts)
- [supabase/migrations/20260504000001_add_overage_columns.sql](supabase/migrations/20260504000001_add_overage_columns.sql)
- [supabase/migrations/20260504000003_add_task_packs.sql](supabase/migrations/20260504000003_add_task_packs.sql)
- [supabase/migrations/20260504000004_rpc_v3_packs.sql](supabase/migrations/20260504000004_rpc_v3_packs.sql)

Memberships / invitations / orgs / teams:
- [app/api/teams/route.ts](app/api/teams/route.ts)
- [app/api/teams/[id]/members/route.ts](app/api/teams/%5Bid%5D/members/route.ts)
- [app/api/teams/[id]/members/[userId]/route.ts](app/api/teams/%5Bid%5D/members/%5BuserId%5D/route.ts)
- [app/api/teams/invitations/[id]/route.ts](app/api/teams/invitations/%5Bid%5D/route.ts)
- [app/api/teams/[id]/invitations/route.ts](app/api/teams/%5Bid%5D/invitations/route.ts)
- [app/api/organizations/route.ts](app/api/organizations/route.ts)
- [app/api/organizations/[id]/route.ts](app/api/organizations/%5Bid%5D/route.ts)
- [app/api/organizations/[id]/invite/route.ts](app/api/organizations/%5Bid%5D/invite/route.ts)
- [app/api/organizations/[id]/transfer-ownership/route.ts](app/api/organizations/%5Bid%5D/transfer-ownership/route.ts)
- [app/api/invitations/accept/route.ts](app/api/invitations/accept/route.ts)
- [lib/utils/permissions.ts](lib/utils/permissions.ts)
- [lib/services/userDeletionService.ts](lib/services/userDeletionService.ts)

Webhooks / triggers / run execution:
- [lib/webhooks/execute.ts](lib/webhooks/execute.ts)
- [lib/webhooks/processor.ts](lib/webhooks/processor.ts)
- [lib/services/workflowExecutionService.ts](lib/services/workflowExecutionService.ts)
- [lib/execution/advancedExecutionEngine.ts](lib/execution/advancedExecutionEngine.ts)
- [lib/execution/v2LiveExecutionDispatch.ts](lib/execution/v2LiveExecutionDispatch.ts)

Navigation / UI:
- [lib/navigation/nav-config.ts](lib/navigation/nav-config.ts)
- [components/app-shell/AppShell.tsx](components/app-shell/AppShell.tsx)
- [components/app-shell/UnifiedSidebar.tsx](components/app-shell/UnifiedSidebar.tsx)
- [hooks/useWorkspaceContext.ts](hooks/useWorkspaceContext.ts)
- [app/(app)/settings/page.tsx](app/(app)/settings/page.tsx)
- [app/(app)/subscription/page.tsx](app/(app)/subscription/page.tsx)
- [app/(app)/org/[slug]/settings/[[...section]]/page.tsx](app/(app)/org/%5Bslug%5D/settings/%5B%5B...section%5D%5D/page.tsx)
- [app/(app)/teams/[slug]/members/page.tsx](app/(app)/teams/%5Bslug%5D/members/page.tsx)
- [app/invite/page.tsx](app/invite/page.tsx)
- [app/invite/signup/page.tsx](app/invite/signup/page.tsx)
- [components/teams/TeamMembersContent.tsx](components/teams/TeamMembersContent.tsx)
- [components/organizations/OrganizationMembersManager.tsx](components/organizations/OrganizationMembersManager.tsx)

Schema-state docs / migrations:
- [supabase/migrations/20260128044221_drop_unused_tables.sql](supabase/migrations/20260128044221_drop_unused_tables.sql)
- [supabase/migrations/20260129200000_restore_workspace_tables.sql](supabase/migrations/20260129200000_restore_workspace_tables.sql)
- [supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md](supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md)
- [supabase/migrations/WORKSPACE_MIGRATION_README.md](supabase/migrations/WORKSPACE_MIGRATION_README.md)
- [supabase/migrations_backup/](supabase/migrations_backup/) (entire directory — historical creates for teams / orgs / org_members)
- [types/database.types.ts](types/database.types.ts) (generated types — may reflect schema state at generation time, not active migrations)

V2 snapshot:
- `c:\Users\marcu\source\repos\ChainReactV2\supabase\migrations\` (22 migration files; none mention workspaces / teams / orgs)
- V2 `app/api/` (no workspace / team / org routes)

---

**End of audit.** Single deliverable, docs-only. No source / schema / RLS / auth / billing / workflow / integration ownership changes were made.
