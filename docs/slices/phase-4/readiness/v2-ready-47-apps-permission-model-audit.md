# V2-READY-47 — Apps / Integrations Permission Model: Audit + Enforcement Verification

**Type:** Security audit / threat note. **Docs-only — no source, migration, test, or UI
change in this slice. Nothing pushed.**
**Date:** 2026-06-16
**Branch:** `v2-main` (local/unpushed)
**Governing skill:** `chainreactv2-security-review`
**Builds on:** [`integration-permission-model-audit.md`](../integration-permission-model-audit.md)
(4.INTEG-PERM, 2026-06-12) · [`team-integration-credential-access-audit.md`](../team-integration-credential-access-audit.md)
(22A) · WF-RUNPERM run/edit policy (`6a02131ed`/`42fe1ce29`) · CONN-SHARE (flag-OFF).

---

## Executive summary (go / no-go)

The Apps/integrations **permission model is already implemented end-to-end and is correct** at
the application, route, service, options, and UI layers. Every Apps action (connect, reconnect,
disconnect/delete, "Connect another", expanded-row actions) is gated by a centralized service
chokepoint, re-authorized server-side, surfaced as no-leak `404/403`, and hidden in the UI when
forbidden — with the exact copy the direction asks for already present. **No app-layer
enforcement gap exists; there was nothing to add in code.**

**One genuine gap, at the database layer only:** `integrations` has a broad `authenticated`
`INSERT/UPDATE/DELETE` GRANT plus account-member-only write RLS. So a regular team member could
**bypass the service-layer owner/admin/connector gates via direct PostgREST/supabase-js writes**
(e.g. delete the team's shared Slack row, or overwrite a co-member's personal row). The app
itself never writes integrations via the authenticated client — all writes go through
service-role — so the authenticated write GRANT is **unused and safely revocable**.

**Fixing this requires a migration → STOP-AND-REPORT per the slice's own stop conditions.** No
migration was written or applied. Recommendation + exact change below; awaiting Marcus's approval.

---

## 1. Current behavior map (verified — every file below was read)

### 1.1 Connect / "Connect another" (account scoping + role)
[`app/api/integrations/oauth/[provider]/connect/route.ts`](../../../app/api/integrations/oauth/%5Bprovider%5D/connect/route.ts)
- Authenticates the session; resolves the **active account** via
  [`resolveActiveAccount`](../../../services/accounts/activeAccount.ts) — enforces membership +
  freeze, binds the account into the signed OAuth state (no silent Personal fallback).
- **APPS-PERM-1 (lines 157-177):** for `isAccountCredentialProvider(provider)` (slack/notion/
  stripe/shopify/hubspot/mailchimp) requires `requireAccountRole(owner|admin)` → else `403 forbidden`.
  Personal providers stay open to any member (they connect their **own** identity).
- "Connect another" reuses the same route/gate (UI just changes the label).

### 1.2 Reconnect ([`services/integrations/reconnect.ts`](../../../services/integrations/reconnect.ts) `resolveReconnectTarget`)
- frozen → exact `(account, id)` row scope → membership → class:
  **account ⇒ owner/admin only; personal ⇒ CONNECTOR-ONLY** (intentional asymmetry: owner/admin may
  *disconnect* a member's personal row for safety but may **not** re-authorize someone else's identity).
- Non-member / cross-account / unknown id / wrong-provider ⇒ uniform `not_found` (404). Typed
  mapping `{not_found:404, forbidden:403, account_frozen:409}`. Dispatcher callback identity-match is
  the hard guarantee a reconnect only refreshes the intended row.

### 1.3 Disconnect / delete + advisory impact ([`services/integrations/disconnect.ts`](../../../services/integrations/disconnect.ts) `resolveAndAuthorize`)
- Single chokepoint shared by DELETE
  [`.../integrations/[integrationId]/route.ts`](../../../app/api/accounts/%5Bid%5D/integrations/%5BintegrationId%5D/route.ts)
  and the advisory GET
  [`.../workflow-impact/route.ts`](../../../app/api/accounts/%5Bid%5D/integrations/%5BintegrationId%5D/workflow-impact/route.ts):
  frozen → exact `(account, id)` row scope → membership → class:
  **account ⇒ owner/admin only; personal ⇒ owner/admin OR connector.**
- A caller who can't disconnect can't learn the impact; every "can't see it" ⇒ uniform 404. Soft-
  disconnect + last-active-row cascade + best-effort revoke; never leaks a token/scope/label/raw error.

### 1.4 Connection sharing (CONN-SHARE — **DEFERRED; not touched this slice**)
[`.../sharing/route.ts`](../../../app/api/accounts/%5Bid%5D/integrations/%5BintegrationId%5D/sharing/route.ts)
→ [`setIntegrationSharingScope`](../../../services/integrations/connectionSharing.ts): flag
`isConnectionSharingEnabled()` (default OFF) → frozen → row scope → membership → disconnected guard
→ class → share=connector-only / unshare=connector-or-owner/admin. The `integration_sharing_scope`
column is schema-only and behavior-inert until the flag is on. **Left entirely untouched** (direction
says private connection-sharing stays deferred).

### 1.5 Options / dynamic-field loaders ([`app/api/options/[source]/route.ts`](../../../app/api/options/%5Bsource%5D/route.ts) → [`decideOptionsCredential`](../../../services/options/credentialPolicy.ts))
- `requireUser` → workflow context resolved via the **RLS-protected** `workflows.getById` (account-
  membership policy), so a non-member can't even seed a workflow context.
- **account provider ⇒ account-shared** (any member may load); **personal provider ⇒
  creator/effective-node-owner pinned**, else `NOT_WORKFLOW_OWNER` with **no lookup and no resolver
  call** — a co-member's personal credential + its resource labels are never fetched.
- Integration is resolved from the **workflow's own `account_id`** (server-resolved), never a
  client-supplied account/integration id. Tested in
  [`tests/unit/app/api/options/options-route.test.ts`](../../../tests/unit/app/api/options/options-route.test.ts).

### 1.6 OAuth callback + token-ingest (role is gated at connect-START)
[`.../callback/route.ts`](../../../app/api/integrations/oauth/%5Bprovider%5D/callback/route.ts) /
[`.../ingest/route.ts`](../../../app/api/integrations/oauth/%5Bprovider%5D/ingest/route.ts):
neither re-checks **role** — by design. The account is bound into the signed, single-use state at
connect-start, where APPS-PERM-1 (§1.1) already ran; the callback re-verifies **membership** + the
reconnect identity-match. A regular member therefore cannot mint a valid account-provider ingest/
callback state without passing the connect-start owner/admin gate. **Transitively safe today**, but
a defense-in-depth role re-check is not present at these routes (see §4 note).

### 1.7 UI — controls hidden when forbidden ([`features/apps/AppCard.tsx`](../../../features/apps/AppCard.tsx) + [`app/apps/_shared.ts`](../../../app/apps/_shared.ts))
- The server derives per-item / per-account booleans (`canConnect`, `canDisconnect`, `canReconnect`,
  `restrictedToAdmins`, share fields) from `callerRole` + the same class rules and emits a **safe DTO
  only** (no token, providerAccountId, scopes, accountMetadata, or connector id). The UI conditions on
  those booleans — it never makes an independent authz decision; the routes re-authorize.
- Copy already present: **"Only an owner or admin can connect this app for the team."** and **"Only an
  owner or admin can reconnect or disconnect this team connection."** Covered by
  [`tests/unit/app/apps/_shared.test.ts`](../../../tests/unit/app/apps/_shared.test.ts).

### 1.8 RLS + GRANT (the gap)
- **`integrations` RLS** (latest:
  [`20260531000006_account_deletion_lifecycle.sql`](../../../supabase/migrations/20260531000006_account_deletion_lifecycle.sql),
  policies `integrations_{select,insert,update,delete}_account_member`): every operation is gated by
  **account membership only** (`EXISTS account_memberships … AND account active`). RLS does **not**
  encode role or connector — i.e. it enforces the **account boundary** but **not** the owner/admin/
  connector permission model.
- **`integrations` GRANT**
  ([`20260619000000_backfill_data_api_grants.sql:29`](../../../supabase/migrations/20260619000000_backfill_data_api_grants.sql)):
  `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` (+ service_role; no anon).
- The existing gated proof
  [`tests/integration/security/integrations-rls.test.ts`](../../../tests/integration/security/integrations-rls.test.ts)
  asserts **non-member** cross-account read/write are no-ops — it does **not** cover **intra-account**
  role/connector enforcement, consistent with the finding.
- App writes never use the authenticated client: `repositories/integrations.ts` is server-only and all
  mutations (`upsertActive`, `disconnectByIdServiceRole`, `markNeedsReconnect`/`clearNeedsReconnect`)
  use **service-role**; a repo-wide grep finds only service-role (`admin.from('integrations')…`) writes.

---

## 2. Chosen permission rules (confirmed = as-built)

| Action | Account/service provider | Personal provider |
|---|---|---|
| Connect / Connect another | owner/admin only | any member (own identity) |
| Reconnect | owner/admin only | connector only |
| Disconnect / delete | owner/admin only | owner/admin **or** connector |
| Use in workflow (options/run) | account-shared (any member) | creator/owner-pinned; others blocked |
| Share / unshare (deferred) | n/a (already shared) | connector / connector-or-admin (flag OFF) |
| Personal account owner | full control of own integrations | unchanged |

These are exactly the direction's rules, and exactly what the code already enforces at the app layer.
No-leak: `404` when account/row/provider should not be revealed; `403` only when membership is known
and the action is forbidden; `409` for a frozen account.

---

## 3. Threat note (what's sensitive, who could see/forge what, what closes it)

- **Sensitive:** OAuth tokens (encrypted at rest), provider account labels/emails, scope lists,
  `accountMetadata`, the connect/reconnect/disconnect write surface.
- **Closed (app layer):** cross-account read/write (account-scoped row lookups + RLS account
  boundary); co-member personal-credential read through options/AI/builder (creator-pin +
  `not-owner`/`ownerControlled` redaction); destructive controls shown to users who can't act (UI
  booleans); raw token/scope/error leakage (safe DTOs + redacted error codes); existence inference
  (uniform 404).
- **OPEN (DB layer — the finding):** a regular **account member** can bypass the service-layer
  owner/admin/connector gates via **direct authenticated PostgREST/supabase-js**:
  - **Write bypass (higher severity):** directly `UPDATE`/`DELETE` any integration row in their
    account — e.g. delete the team's shared **Slack/Stripe** connection (an owner/admin-only action),
    or overwrite/disconnect a **co-member's personal** row they don't own. RLS permits it; only the
    (bypassed) service layer forbids it.
  - **Read over-exposure (lower severity):** directly `SELECT` co-member personal rows, exposing
    `scopes` / `provider_account_id` / `account_metadata` / (encrypted, non-usable) token columns that
    the Apps DTO would otherwise redact.
- **Not forgeable:** OAuth state (signed + single-use DB nonce); ingest/callback account binding;
  client-supplied owner/account ids are never trusted (server resolves).

---

## 4. Recommendation (requires migration + product sign-off — NOT done here)

**Primary (low-risk, no SQL re-encoding of the personal/account map):**
```sql
-- New migration (NOT written/applied in this slice — pending approval):
REVOKE INSERT, UPDATE, DELETE ON public.integrations FROM authenticated;
-- SELECT stays for the Apps-page read; service_role keeps full DML.
```
This makes **service-role the sole writer**, so every mutation is forced back through the existing
gated chokepoints (connect APPS-PERM-1, disconnect/reconnect `resolveAndAuthorize`). It does **not**
re-encode the `personal`/`account` classification in SQL (the security rule forbids that — the map
lives in [`core/integrations/credentialSharing.ts`](../../../core/integrations/credentialSharing.ts)).
Safe because no app path writes integrations via the authenticated client (§1.8).

**Optional hardening (bigger, separate slice):** close the read over-exposure by routing the Apps-page
read through service-role + the existing DTO redaction and `REVOKE SELECT … FROM authenticated` too.
This touches the read path, so it is its own change, not bundled here.

**Tests to land with the migration:** extend
[`integrations-rls.test.ts`](../../../tests/integration/security/integrations-rls.test.ts) to assert a
regular **member's** direct `INSERT/UPDATE/DELETE` on `integrations` is denied/no-op (today only the
non-member cross-account case is covered), plus a no-leak assertion on direct member SELECT if the
optional SELECT lockdown is taken.

**Defense-in-depth note (no migration):** the ingest/callback routes (§1.6) rely on the connect-start
role gate via the bound state. A future small hardening could resolve the account from the consumed
state and re-assert `requireAccountRole` for `isAccountCredentialProvider` at the callback/ingest
boundary. It is **not** a live gap today and is out of scope for this audit.

---

## 5. Stop-and-report triggers hit (why no code/migration shipped)

Per the slice's explicit stop conditions:
- **"Fixing this requires a migration."** ✅ The only residual gap is RLS/GRANT — a migration. The
  directive is "no db:push/migration unless a real schema gap is found **and Marcus approves**."
- **"The current schema cannot distinguish account-shared vs personal credential ownership cleanly."**
  ✅ At the SQL/RLS layer the personal/account distinction is **not** represented (it lives in TS), and
  re-encoding it in SQL is forbidden — so a fully role+connector-aware RLS *write* policy is not cleanly
  expressible. The pragmatic fix (revoke the authenticated write GRANT) is clean but is still a migration.
- **OAuth callback role enforcement:** safe today via connect-start gating; a callback-layer role
  re-check would be a broader change (resolve account from state) — deferred, not required.

No conflict with the WF-RUNPERM run/edit policy (that axis is unchanged and complementary).

---

## 6. What did NOT change (invariants preserved)

Docs-only. No source, route, service, UI, test, schema, RLS, GRANT, or migration change. No
connection-sharing work (deferred feature left untouched, flag OFF). No AI/MCP/billing behavior
change. No co-member credential fallback added; `created_by_user_id`/`connected_by_user_id` semantics,
the 22B creator-pin, 22D-2 option redaction, `toOwnerControlledView`, and disconnect/reconnect authz
all untouched. Nothing pushed; nothing deployed.

---

## 7. Recommended next step

Put the **`REVOKE INSERT, UPDATE, DELETE ON public.integrations FROM authenticated`** migration
(+ the member-write RLS no-leak test) to Marcus. On approval it lands as a one-migration slice
(`db:push` to the V2 dev DB after the RLS/GRANT review), closing the direct-PostgREST write bypass
without altering any app behavior. The optional SELECT lockdown and the ingest/callback defense-in-
depth re-check are separate, lower-priority follow-ups.
