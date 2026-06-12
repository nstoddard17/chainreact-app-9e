# 4.APPS-DISCONNECT — Connected App Disconnect Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-11
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — every file below was read for this plan):**
[repositories/integrations.ts](../../../repositories/integrations.ts) (`markDisconnected`, `softDisconnectPersonalForMember`, `upsertActive`, ownership model, RLS note) ·
[services/oauth/dispatcher.ts](../../../services/oauth/dispatcher.ts) (`revokeProviderToken`, `refresh`) ·
[core/workflows/lifecycle.ts](../../../core/workflows/lifecycle.ts) (state machine, `selectWorkflowsToDisable`, `selectWorkflowsEligibleToResume`) ·
[contracts/workflow.ts](../../../contracts/workflow.ts) (`WorkflowState`, `WorkflowDisabledReason` incl. `integration_revoked`) ·
[contracts/accounts.ts](../../../contracts/accounts.ts) (`AccountType`, `MembershipRole`) ·
[services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts) (`requireAccountRole`) ·
[services/accounts/membership.ts](../../../services/accounts/membership.ts) (`removeMember`, `getMemberWorkflowImpact`, structured audit events) ·
[app/api/accounts/[id]/members/[userId]/route.ts](../../../app/api/accounts/%5Bid%5D/members/%5BuserId%5D/route.ts) (DELETE authz + typed failures) ·
[app/api/accounts/[id]/members/[userId]/workflow-impact/route.ts](../../../app/api/accounts/%5Bid%5D/members/%5BuserId%5D/workflow-impact/route.ts) (advisory impact GET) ·
[app/apps/page.tsx](../../../app/apps/page.tsx) + [app/apps/_shared.ts](../../../app/apps/_shared.ts) (active-account scoping, no-leak DTO) ·
[contracts/apps.ts](../../../contracts/apps.ts) (`AppCatalogItem` DTO) ·
[features/apps/AppCard.tsx](../../../features/apps/AppCard.tsx) (Reconnect shipped; Disconnect absent) ·
[app/api/account/_shared.ts](../../../app/api/account/_shared.ts) (`requireAuthedUserId`, `parseAccountBody`).

---

## 1. Context

The **Connected App Recovery UX** arc (commit `694af4077`,
[connected-app-recovery-ux.md](./connected-app-recovery-ux.md)) shipped **Reconnect** on
connected app cards and explicitly **deferred Disconnect**, noting:

> No API route exists under `app/api/integrations/`; `markDisconnected()` is repo-only
> dead code with no caller. Requires: authz, provider-side token revoke, handling of
> affected workflows/runs, lifecycle transitions, and no-leak + RLS/GRANT review. Design it
> as its own security-reviewed slice.

This doc is that design. It fits the V2 account-ownership arc
([account-model-foundation-plan.md](./account-model-foundation-plan.md)) and the
credential-sharing / offboarding work (22B/22C, surfaced in
[team-workflows-credential-sharing-plan.md](./team-workflows-credential-sharing-plan.md)).
The member-removal offboarding flow is the **direct analog** and most of this design reuses
its proven shape.

**Goal:** a real disconnect — local soft-disconnect + best-effort provider revoke +
workflow lifecycle cascade + audit + role-gated UI — **never** a UI-only removal.

---

## 2. Current codebase findings (verified)

### 2.1 The integrations row + soft-disconnect already exists

[repositories/integrations.ts](../../../repositories/integrations.ts):

- **Ownership (post 4.ACCOUNT-MODEL-6):** `account_id` is the authoritative owner;
  `connected_by_user_id` is provenance ("who connected it"); **there is no `user_id`
  column.** RLS is account-membership; INSERT/UPDATE/DELETE go through service-role for the
  OAuth dispatcher and offboarding (lines 16–23).
- **`disconnected_at TIMESTAMPTZ` already exists** on the row (`IntegrationRecord.disconnectedAt`,
  line 40). Soft-disconnect is the established pattern; there is **no hard-delete path**.
- **`markDisconnected(integrationId)`** (lines 430–437) sets `disconnected_at` via the
  **SSR session (RLS) client** and has **no caller** — confirmed dead code. It does **not**
  revoke the provider token, null token columns, touch workflows, or write an audit event.
- **`softDisconnectPersonalForMember`** (lines 379–428) is the offboarding cascade:
  service-role, scoped to `(account_id, connected_by_user_id)`, **personal-credential
  providers only** (account/service providers stay connected), idempotent via
  `disconnected_at IS NULL`. This is the closest existing "disconnect" behavior.
- **Reconnect interaction:** `upsertActive` (lines 121–183) refreshes the existing **active**
  row; if only a *disconnected* row exists it **inserts a new row** (preserves disconnect
  history). The unique active index `integrations_account_active_unique` on
  `(account_id, provider, provider_account_id) WHERE disconnected_at IS NULL` (line 105)
  enforces at-most-one active row, so a soft-disconnected row never collides with a later
  reconnect.
- **`updateTokens`** filters `id = $ AND disconnected_at IS NULL` (line 289): **a
  disconnected row can never be re-tokened.** Tokens left on a disconnected row are
  therefore dead — relevant to the "null tokens on disconnect" decision (§6).

### 2.2 Provider token revoke already exists (purge-only today)

[services/oauth/dispatcher.ts](../../../services/oauth/dispatcher.ts) `revokeProviderToken(provider, token)`
(lines 399–415): looks the provider up in the OAuth **and** token-ingest registries, calls
its `revoke(token)`; unknown providers no-op. It **does not swallow errors** — the caller
owns the best-effort + retry policy (used by account purge, 10c). It **never logs the
token**. Per-provider `revoke()` implementations exist broadly (grep: airtable, discord,
dropbox, facebook, github, gmail, google-*, hubspot, mailchimp, … each `integrations/*/oauth.ts`).

### 2.3 Workflow lifecycle already models this

[contracts/workflow.ts](../../../contracts/workflow.ts):
- Six states: `draft, active, paused, disabled, eligible_to_resume, deleted` (lines 28–36).
- **`WorkflowDisabledReason` already includes `integration_revoked`** (lines 38–44) — the
  exact reason a disconnect cascade needs. It was anticipated; nothing consumes it yet.

[core/workflows/lifecycle.ts](../../../core/workflows/lifecycle.ts):
- `selectWorkflowsToDisable(workflows, unhealthyIntegrationIds)` — disables only **active**
  or **paused** workflows that depend on an affected integration (lines 145–161).
- `selectWorkflowsEligibleToResume(...)` — only `disabled` → `eligible_to_resume`, and only
  when **all** deps are healthy; **never auto-resumes** (lines 171–188). This is the rule
  the prompt insists on.
- **Gap:** both predicates are **pure and have no production caller** (verified: grep for
  `selectWorkflowsToDisable` / `WorkflowDependencyView` / `requiredIntegrationIds` across
  `services/`, `repositories/`, `app/` returns nothing outside this file). The
  integration→workflow dependency *view* is **not assembled anywhere today.** The disconnect
  cascade is the feature that finally wires them.

[services/workflows/lifecycleOrchestrator.ts](../../../services/workflows/lifecycleOrchestrator.ts):
`LifecycleOrchestrator` exposes a `disable({ reason })` transition (verified via export grep:
`DisableInput { reason: WorkflowDisabledReason }`, lines ~72–187). The cascade should drive
disables through this orchestrator, not raw repo writes.

### 2.4 The authz + advisory-impact pattern is already built for member removal

- [services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts):
  `requireAccountRole(userId, accountId, allowed[])` → `{ok, role}` | `{ok:false,
  reason:'not_member'|'forbidden'}`. Membership-role RBAC; account is the single ownership
  root (no per-resource ACLs).
- [app/api/accounts/[id]/members/[userId]/route.ts](../../../app/api/accounts/%5Bid%5D/members/%5BuserId%5D/route.ts):
  `DELETE` = `requireAuthedUserId()` → `requireAccountRole(["owner","admin"])` → service →
  typed failure mapping (`memberMgmtFailure`). **This is the route template to copy.**
- [app/api/accounts/[id]/members/[userId]/workflow-impact/route.ts](../../../app/api/accounts/%5Bid%5D/members/%5BuserId%5D/workflow-impact/route.ts):
  advisory **read-only** GET that returns **only an integer** `affectedWorkflowCount` —
  same gate as DELETE, so an unauthorized caller never learns the count. **This is the
  "show affected workflows" template to copy.**
- [services/accounts/membership.ts](../../../services/accounts/membership.ts) `removeMember`
  (lines 88–146): order is **revoke node-credential grants → soft-disconnect personal
  integrations → delete membership**, each emitting a structured audit event. `getMemberWorkflowImpact`
  (lines 161–173) applies the SAME gate before returning the count.

### 2.5 Audit convention = structured logs, not a table

There is **no dedicated audit table / generic `logAdminAction` helper** in V2 (grep for
`logAdminAction|auditLog|recordAudit` returns nothing in `services/`, `lib/`, `repositories/`).
The convention is **structured `console.info(JSON.stringify({ event: "account.…", … }))`**
(11 such events in `services/accounts/`, e.g. `account.member.offboard.personal_integrations_disconnected`
with `count` + `providers` but **no token/displayName**). Disconnect audit follows this.

### 2.6 Apps page is account-scoped and no-leak

[app/apps/page.tsx](../../../app/apps/page.tsx) resolves the caller's **active account**
(`resolveActiveAccount`, falling back to `ensurePersonalAccount`) and lists
`integrationsRepo.listActiveByAccount(account.id)`. The DTO
([contracts/apps.ts](../../../contracts/apps.ts) + [_shared.ts](../../../app/apps/_shared.ts))
deliberately **omits tokens, `providerAccountId`, `accountMetadata`, and scopes**; the only
per-account identifier exposed is the **integration row UUID** (`AppAccountSummary.id`),
which is safe and is exactly the handle a disconnect route needs. `AppCard` renders
**Reconnect** but no Disconnect/Manage today.

---

## 3. Product / model decision

**What disconnect IS:** a user-initiated, role-gated teardown of **one active integration
row** (`integrationId`) that (a) makes the credential immediately unusable by soft-setting
`disconnected_at`, (b) best-effort revokes the provider token, (c) clears the encrypted
token columns on that dead row, (d) cascades **dependent active/paused workflows** to
`disabled` with reason `integration_revoked`, and (e) writes structured audit events.

**What disconnect is deliberately NOT:**
- **Not a hard delete.** The row is retained (soft-disconnect) for history/provenance and
  to keep run/step FKs intact.
- **Not auto-resume.** Reconnect later moves dependent workflows `disabled →
  eligible_to_resume` **only when all deps are healthy**, and the user resumes explicitly.
  Disconnect never schedules a resume.
- **Not a member/account removal.** It targets a credential, not a person.
- **Not a cross-account action.** It is scoped to the caller's account by `account_id`;
  a different account's integration is invisible (404/no-leak).

**Account-model anchoring:**
- The integration is owned by `account_id`. Authorization is **account-role based**
  (`requireAccountRole`) — there are no per-resource ACLs.
- **Account/service providers** (slack, notion, stripe, shopify, hubspot, mailchimp — per
  [core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts))
  are **shared org resources**: disconnecting one affects every member → **owner/admin only**.
- **Personal-credential providers** (everything else; unknown → personal) are connected by a
  specific member (`connected_by_user_id`): the **connector may disconnect their own**, and
  owner/admin may disconnect any. This mirrors the 22B/22C provenance rules.

---

## 4. Recommended approach (end to end)

**Entry points (two endpoints, account-scoped, mirroring members/):**

1. `GET /api/accounts/[id]/integrations/[integrationId]/workflow-impact` — advisory,
   read-only. Returns `{ affectedWorkflowCount: number, isShared: boolean }`. Same authz gate
   as DELETE; an unauthorized caller never learns the count.
2. `DELETE /api/accounts/[id]/integrations/[integrationId]` — performs the disconnect.
   Returns `{ ok: true, disabledWorkflowCount: number, providerRevoked: boolean }`.

**Service flow (`services/integrations/disconnect.ts`, NEW), in retry-safe order:**

1. **Authz (service-level gate):** resolve the integration row by `(accountId,
   integrationId)` via service-role (need the row + provider + `connected_by_user_id` +
   encrypted token). If not found / different account → `not_found` (mapped to 404). Then:
   - account/service provider → require `owner|admin`;
   - personal provider → require `owner|admin` **OR** `connected_by_user_id === callerUserId`.
2. **Cascade-first lifecycle:** compute dependent active/paused workflows on the account and
   `disable` each via `LifecycleOrchestrator` with `reason: integration_revoked`. Do this
   **before** revoke so a revoke outage never leaves workflows running on a dead credential.
   (Disabling is idempotent — a re-run re-selects nothing.)
3. **Local soft-disconnect:** set `disconnected_at` on the row (service-role, guarded by
   `disconnected_at IS NULL` → idempotent). After this the credential is unusable
   (`getActiveForExecution` and `updateTokens` both filter it out).
4. **Best-effort provider revoke:** call `revokeProviderToken(provider, decryptedToken)`
   inside a try/catch. Failure → audit `provider_revoke_failed` and set
   `providerRevoked:false`; **never** block the disconnect, **never** surface the raw
   provider error.
5. **Clear token columns:** null `access_token_encrypted` / `refresh_token_encrypted` /
   `access_token_expires_at` on the dead row (defense-in-depth — the row can never be
   re-tokened anyway, §2.1). Keep `scopes`/`account_metadata` minimal or also clear (open
   question §10).
6. **Audit:** structured events (§Q7).

**UI:** a role-gated **Disconnect** control on `AppCard` (per-account in the expanded
section, since a card can have multiple accounts), opening a confirm dialog that first calls
the impact endpoint and renders the affected-workflow count + shared-resource warning copy
(§Q8). The control is **not rendered** when the caller lacks permission — the DTO gains a
per-account `canDisconnect: boolean` (no token/role leak; just a boolean).

---

## 5. Alternatives considered

| Dimension | **A. Soft-disconnect + cascade + best-effort revoke (recommended)** | B. Hard delete row | C. UI-only "hide" (no backend) | D. Soft-disconnect, **block** on revoke failure |
|---|---|---|---|---|
| Security / no-leak | ✅ row retained, tokens nulled, revoke attempted | ⚠️ tokens gone but history/provenance lost | ❌ credential still live & usable — fake | ✅ but worse availability |
| Honors prompt ("no UI-only") | ✅ | ✅ | ❌ explicitly forbidden | ✅ |
| Workflow correctness | ✅ deps → `disabled(integration_revoked)`; reconnect → `eligible_to_resume` | ✅ but FK churn on runs/steps | ❌ workflows keep failing at runtime | ✅ |
| Reconnect story | ✅ `upsertActive` inserts fresh row; disabled→eligible_to_resume | ⚠️ no disconnect history | n/a | ✅ |
| Migration cost | ✅ **none** (`disconnected_at` + `integration_revoked` exist) | ⚠️ FK `ON DELETE` review on runs/steps | ✅ none | ✅ none |
| Offboarding consistency | ✅ same shape as `softDisconnectPersonalForMember` | ❌ diverges | ❌ diverges | ⚠️ diverges (purge is best-effort) |
| Availability | ✅ provider outage can't block disconnect | ✅ | n/a | ❌ provider outage strands the user |

**Rejected:** B (loses audit/provenance, FK risk, no recovery), C (the failure mode this
slice exists to fix), D (contradicts the established best-effort revoke philosophy in
`revokeProviderToken` / purge). **Chosen: A.**

---

## 6. Security / data model

- **No migration required (proven):** `integrations.disconnected_at` exists; token columns
  are nullable; `WorkflowDisabledReason.integration_revoked` exists. Nulling tokens and
  setting `disconnected_at` use existing columns. **A migration is only needed if** we add
  optional audit columns (`disconnected_by_user_id`, `disconnect_reason`) — recommended
  **deferred** (the structured-log audit suffices for v1), so this slice ships migration-free.
- **RLS / GRANT:** no new table → no new GRANT. The read+write path uses **service-role**
  (consistent with offboarding), because step 4 must **decrypt** a token and the writes
  touch a row keyed by account, not by the caller. Authorization is enforced **in the service
  before any write** via `requireAccountRole` + provenance, exactly like `removeMember`.
  (`markDisconnected`'s current RLS-session-client form is insufficient here because it can't
  decrypt for revoke; the new service path supersedes it — `markDisconnected` is
  refactored or replaced.)
- **No-leak invariants (must be tested):**
  - Route bodies and audit logs contain **no** token, `providerAccountId`, scopes, or
    `accountMetadata` — only ids, counts, provider slug, account id.
  - Raw provider revoke errors are caught and reduced to `providerRevoked:false`; the
    client never sees a provider error string.
  - Cross-account / unknown `integrationId` → **404** with no hint that the row exists
    elsewhere; impact endpoint returns the gate failure, never the count.
  - `canDisconnect` is a boolean derived server-side; the client is never told *why* it's
    false (no role/provenance disclosure beyond the boolean).
- **Sensitivity:** this slice handles OAuth tokens, account membership, and a service-role
  write path → **it must be implemented under the `chainreactv2-security-review` skill**, not
  the default slice executor.

---

## 7. API / service / UI expectations (described, not built)

**`GET /api/accounts/[id]/integrations/[integrationId]/workflow-impact`**
→ `200 { affectedWorkflowCount: number, isShared: boolean }` ·
gate failures `403 NOT_ACCOUNT_MEMBER|FORBIDDEN`, `404 INTEGRATION_NOT_FOUND`.

**`DELETE /api/accounts/[id]/integrations/[integrationId]`**
→ `200 { ok: true, disabledWorkflowCount: number, providerRevoked: boolean }` ·
`403 ACCOUNT_PENDING_DELETION` (frozen account refuses, mirroring member mgmt) ·
`403 NOT_ACCOUNT_MEMBER|FORBIDDEN` · `404 INTEGRATION_NOT_FOUND` · idempotent (already
disconnected → `200 { ok:true, disabledWorkflowCount:0, providerRevoked:false }`).

**Service:** `services/integrations/disconnect.ts` — `disconnectIntegration({ accountId,
integrationId, callerUserId })` and `getIntegrationWorkflowImpact({ accountId,
integrationId, callerUserId })`, returning discriminated unions like `RemoveMemberResult`.

**Repository additions** (`repositories/integrations.ts`):
- `getByIdForAccountServiceRole(accountId, integrationId)` — row+token lookup for the
  service (decrypt + provenance check).
- `disconnectByIdServiceRole(integrationId)` — set `disconnected_at` + null tokens, guarded
  by `disconnected_at IS NULL`.
- a **provider-scoped** dependent-workflow count/list (see §10 risk — may extend the
  existing member-impact query rather than add new).

**UI:** `features/apps/DisconnectButton.tsx` (NEW) + a confirm dialog; `AppCard` renders it
per-account in the expanded section when `account.canDisconnect`. **No fake controls** —
the button only appears when the backend will honor it. Disconnect is visually **destructive
secondary** (distinct from the new non-destructive Reconnect and the primary Connect).

---

## 8. Confirmation copy (Q8)

**Personal-credential provider, N>0 affected:**
> **Disconnect {ProviderName}?** This removes ChainReact's access to this {ProviderName}
> account. **{N} workflow(s)** that use it will be **disabled** and won't run until you
> reconnect — they will **not** resume automatically. You can reconnect anytime from Apps.

**Account/service (shared) provider:**
> **Disconnect {ProviderName} for your whole team?** {ProviderName} is shared across this
> account. Disconnecting it affects **every member**, and **{N} workflow(s)** will be
> **disabled** until it's reconnected (no automatic resume).

**N=0:**
> **Disconnect {ProviderName}?** No active workflows use this connection. You can reconnect
> anytime from Apps.

Copy never shows the token, email/displayName beyond what the card already shows, scopes, or
provider error detail.

---

## 9. API route shape decision (Q9)

**Recommended:** account-scoped `DELETE /api/accounts/[id]/integrations/[integrationId]`
(+ sibling `…/workflow-impact` GET). Rationale: the integration is account-owned, and this
mirrors the **already-shipped** `/api/accounts/[id]/members/[userId]` template (same gate,
same typed-failure mapping, same advisory-impact sibling) — minimal new surface, maximal
consistency.

**Alternative considered & rejected:** `POST /api/integrations/[integrationId]/disconnect`
(action-style, account implicit). Rejected — it hides the ownership scope that authz depends
on and diverges from the established account-routing convention.

---

## 10. Risks / open questions (each with a recommendation)

1. **Provider-scoped dependency scan may not exist.** `selectWorkflowsToDisable` is unwired,
   and `countImpactedWorkflowsForMember` (member.ts) is **member+personal-provider scoped**,
   not **integration/provider scoped** — *unverified whether it can be reused as-is.*
   **Recommendation:** in CD-2, build a small provider-scoped query
   (`account workflows whose definition references provider P`) and finally wire
   `selectWorkflowsToDisable`. Confirm by reading `countImpactedWorkflowsForMember` before
   coding.
2. **Null tokens on disconnect?** A disconnected row can never be re-tokened (§2.1), so
   tokens on it are dead weight. **Recommendation: null them** (defense-in-depth). Open: also
   clear `scopes`/`account_metadata`? Lean yes for metadata (may hold PII), keep `scopes`
   for diagnostics — confirm with security review.
3. **Shared-provider disconnect scope.** Owner/admin disconnecting Slack kills it for all
   members. **Recommendation:** allow owner/admin (matches member-mgmt power) but make the
   shared-resource copy explicit (§8). Open: should it be **owner-only**? Defer to product;
   default owner/admin.
4. **Single account row vs all rows.** DELETE targets one `integrationId` (one provider
   account). Disconnecting *all* accounts for a provider is just N calls. **Recommendation:**
   keep per-row; no bulk endpoint in v1.
5. **`markDisconnected` fate.** It's dead, RLS-client, and can't decrypt for revoke.
   **Recommendation:** replace it with the service-role `disconnectByIdServiceRole`; delete
   the old function (git keeps history) to avoid two divergent disconnect paths.
6. **Frozen (`pending_deletion`) account.** **Recommendation:** refuse with
   `ACCOUNT_PENDING_DELETION`, mirroring member mgmt — purge handles teardown there.

---

## 11. Acceptance criteria

**For this planning slice:** doc exists under `docs/slices/phase-4/`, every "current state"
claim cites a file that was read, no source/test/migration/UI changed, docs-only local
commit, nothing pushed. ✅

**For the implementation arc (later):**
- A connected app can be disconnected by an authorized caller; the row is soft-disconnected,
  tokens nulled, provider revoke attempted best-effort, dependent active/paused workflows
  `disabled(integration_revoked)`.
- Revoke failure never blocks disconnect; raw provider errors never reach the client.
- Reconnect later moves dependent workflows `disabled → eligible_to_resume` only when all
  deps are healthy; **no auto-resume**.
- Cross-account/unknown id → 404 no-leak; unauthorized → 403; impact count gated.
- No token/scope/metadata in any response body or audit log.
- Disconnect is behind `ENABLE_INTEGRATION_DISCONNECT` (default OFF) until verified.

---

## 12. Hard boundaries (what this slice did NOT change)

No source, repositories, services, routes, contracts, migrations, schema, tests, or UI were
modified. `markDisconnected` is still unwired dead code. No `db:push`, no migration, no
provider/OAuth/billing behavior change. The only artifact is this doc. Nothing pushed.

---

## 13. Implementation slice breakdown (recommended order)

- **CD-1 — Service + repository core (NO UI, flag OFF).** `services/integrations/disconnect.ts`
  (`disconnectIntegration`): service-role row lookup, authz (role + provenance),
  soft-disconnect + null tokens, best-effort `revokeProviderToken`, structured audit. Replace
  `markDisconnected`. Flag `ENABLE_INTEGRATION_DISCONNECT` (`services/integrations/flags.ts`,
  default OFF). Tests: authz matrix, idempotency, no-leak, revoke-failure-doesn't-block.
- **CD-2 — Workflow cascade + advisory impact.** Provider-scoped dependent-workflow
  query; wire `selectWorkflowsToDisable` → `LifecycleOrchestrator.disable(integration_revoked)`;
  `getIntegrationWorkflowImpact`. Tests: cascade selects only active/paused dependents;
  draft/disabled untouched; no auto-resume.
- **CD-3 — API routes.** `DELETE …/integrations/[integrationId]` +
  `GET …/workflow-impact`, copying the members route's gate + typed failures. Tests: route
  authz, cross-account 404, frozen-account refusal, response shape.
- **CD-4 — UI.** `DisconnectButton` + confirm dialog on `AppCard` (per-account, role-gated
  via `canDisconnect` DTO boolean), impact count + copy. Tests: control renders only when
  permitted; dialog shows count/copy; calls DELETE; no fake behavior.
- **CD-5 — Reconnect → eligible_to_resume verification.** Confirm/wire the recovery
  transition so post-reconnect dependents become `eligible_to_resume` (not auto-resumed).
  May partly exist via the recovery arc — verify before building.

**Likely files touched (by the arc, not this slice):**
[repositories/integrations.ts](../../../repositories/integrations.ts) ·
`services/integrations/disconnect.ts` (NEW) · `services/integrations/flags.ts` (NEW) ·
[services/oauth/dispatcher.ts](../../../services/oauth/dispatcher.ts) (reuse/export revoke) ·
[services/workflows/lifecycleOrchestrator.ts](../../../services/workflows/lifecycleOrchestrator.ts) ·
[core/workflows/lifecycle.ts](../../../core/workflows/lifecycle.ts) (wire predicates) ·
`app/api/accounts/[id]/integrations/[integrationId]/route.ts` (NEW) ·
`app/api/accounts/[id]/integrations/[integrationId]/workflow-impact/route.ts` (NEW) ·
[contracts/apps.ts](../../../contracts/apps.ts) (`canDisconnect` boolean) ·
[app/apps/_shared.ts](../../../app/apps/_shared.ts) (compute `canDisconnect`) ·
[features/apps/AppCard.tsx](../../../features/apps/AppCard.tsx) + `features/apps/DisconnectButton.tsx` (NEW) ·
tests across all of the above.

---

## 14. Recommended next step

Pick up **CD-1** under the **`chainreactv2-security-review`** skill (token + authz +
service-role write path). Before coding CD-2, read `countImpactedWorkflowsForMember` to
decide reuse-vs-new for the provider-scoped dependency query (risk §10.1).
