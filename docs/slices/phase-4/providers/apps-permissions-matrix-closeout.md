# 4.APPS-PERM — Apps Permissions Matrix — Arc Closeout

**Type:** Closeout + consistency audit (docs-only). Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Arc:** APPS-PERM-1 → APPS-PERM-2 → APPS-PERM-3 (this doc).
**Related:** [workflow-run-edit-permission-closeout.md](../workflow-run-edit-permission-closeout.md)
(the run/edit "duplicate to use your own connection" gate) ·
[explicit-private-connection-sharing-closeout.md](../explicit-private-connection-sharing-closeout.md)
(CONN-SHARE share/unshare).

> **STATUS: ARC COMPLETE — matrix locked, backend/DTO/UI verified consistent.**
> No code change in this slice; the audit found **no inconsistency**. APPS-PERM-1
> and APPS-PERM-2 are committed locally (see chain below). Not pushed.

---

## 1. Summary

- **APPS-PERM-1** tightened the backend + DTO: account/service-provider **connect**
  (and connect-another) is **owner/admin only**; personal-provider **reconnect** is
  **connector-only** (an intentional asymmetry with disconnect); the Apps DTO split
  `canReconnect` from `canDisconnect` and role-gated `canConnect`.
- **APPS-PERM-2** made the tightened policy legible to members: a server-derived
  `restrictedToAdmins` DTO boolean drives explanatory copy on the Apps card so a
  member never sees a silently-blank/broken account-provider card.
- **APPS-PERM-3** (this doc): locks the final permissions matrix and audits every
  Apps action for consistency across backend route/service, DTO, and UI. **Result:
  consistent — no fix required.**

---

## 2. Completed commit chain

- `edf7c2ead` — feat(integrations): gate account-provider connect to owner/admin; personal reconnect connector-only (APPS-PERM-1) _(2026-06-14)_
- `4a4dd8d6f` — feat(apps): explain owner/admin-only account-provider connect/manage to members (APPS-PERM-2) _(2026-06-14)_
- _(this doc)_ — docs(apps): Apps permissions matrix closeout (APPS-PERM-3) _(2026-06-14)_

> A parallel AI chat sharing this worktree interleaved its own commit
> (`8a408c64b` AI-REPAIR-CLEANUP-1) between APPS-PERM-1 and APPS-PERM-2. It touches
> no Apps/integration code; `edf7c2ead` remains an ancestor of HEAD. This arc's
> files are unaffected by it.

---

## 3. Final permissions matrix

**Provider classes** — the single source of truth is
[core/integrations/credentialSharing.ts:47-78](../../../../core/integrations/credentialSharing.ts).
Unknown providers default to **personal** (fail-safe).

- **Account/service** (shared org resource): `slack`, `notion`, `stripe`, `shopify`,
  `hubspot`, `mailchimp`.
- **Personal** (acts as the connecting human): `gmail`, `microsoft-outlook`,
  `microsoft-outlook-calendar`, `google-calendar`, `google-drive`, `google-sheets`,
  `google-docs`, `google-analytics`, `microsoft-onedrive`, `microsoft-onenote`,
  `microsoft-excel`, `microsoft-teams`, `dropbox`, `discord`, `github`, `facebook`,
  `airtable`, `trello`, `monday`.

### 3.1 Account/service providers

| Action | owner | admin | member (connector or not) | non-member / cross-account |
|---|---|---|---|---|
| Connect | ✅ | ✅ | ❌ `forbidden` 403 | `403` (no-leak) |
| Connect another | ✅ | ✅ | ❌ `forbidden` 403 | `403` (no-leak) |
| Reconnect | ✅ | ✅ | ❌ `forbidden` 403 | `not_found` 404 |
| Disconnect | ✅ | ✅ | ❌ `forbidden` 403 | `not_found` 404 |
| Share / Unshare | n/a — `account_provider_not_shareable` 422 | n/a | n/a | `not_found` 404 |
| View connected rows | ✅ | ✅ | ✅ (read) | not in scope (account-scoped) |

### 3.2 Personal providers

| Action | owner (non-connector) | admin (non-connector) | connector | non-connector member | non-member |
|---|---|---|---|---|---|
| Connect (own identity) | ✅ | ✅ | ✅ | ✅ | n/a |
| Reconnect | ❌ `forbidden` | ❌ `forbidden` | ✅ | ❌ `forbidden` | `not_found` 404 |
| Disconnect | ✅ (safety) | ✅ (safety) | ✅ | ❌ `forbidden` | `not_found` 404 |
| Share | ❌ `forbidden` | ❌ `forbidden` | ✅ | ❌ `forbidden` | `not_found` 404 |
| Unshare | ✅ (admin-safety, audited) | ✅ (admin-safety, audited) | ✅ | ❌ `forbidden` | `not_found` 404 |
| View connected rows | ✅ | ✅ | ✅ | ✅ | n/a |

> **The one intentional asymmetry:** for a personal connection, owner/admin may
> **disconnect** it (a safety action) but may **not reconnect** it — only the
> connecting human can re-authorize their own identity. Reconnecting owner/admin
> would be blocked by the callback identity-match anyway; authorizing the *start*
> would be a misleading affordance.

### 3.3 Per-action — backend / DTO / UI consistency (every cell verified first-hand)

| Action | Backend (authoritative) | DTO flag | UI surface |
|---|---|---|---|
| Connect / Connect-another | [connect/route.ts](../../../../app/api/integrations/oauth/[provider]/connect/route.ts) — `requireAccountRole(['owner','admin'])` for account providers in the non-reconnect branch | `canConnect` ([_shared.ts](../../../../app/apps/_shared.ts) `computeCanConnect`) | [AppCard.tsx](../../../../features/apps/AppCard.tsx) top-level **Connect** + expanded **Connect another**, both keyed on `canConnect`; `restrictedToAdmins` note when hidden |
| Reconnect | [reconnect.ts:89-100](../../../../services/integrations/reconnect.ts) — account ⇒ owner/admin; personal ⇒ connector-only | `canReconnect` (`computeCanReconnect`) | per-row **Reconnect** keyed on `canReconnect` |
| Disconnect | [disconnect.ts:121-129](../../../../services/integrations/disconnect.ts) — account ⇒ owner/admin; personal ⇒ owner/admin OR connector | `canDisconnect` (`computeCanDisconnect`) | per-row **Disconnect** keyed on `canDisconnect` |
| Share | [connectionSharing.ts:115-117](../../../../services/integrations/connectionSharing.ts) — connector only | `canShare` | `app-card-share` |
| Unshare | [connectionSharing.ts:118-121](../../../../services/integrations/connectionSharing.ts) — connector OR owner/admin (distinct `admin_unshared` audit) | `canUnshare` | `app-card-unshare` |
| View connected rows | account-scoped list ([page.tsx](../../../../app/apps/page.tsx) + [_shared.ts](../../../../app/apps/_shared.ts)) | safe row fields only | expanded accounts list |
| Duplicate / use-own-connection | **near workflows, not Apps** — `403 WORKFLOW_USES_PRIVATE_CREDENTIAL` ([app/api/workflows/_shared.ts:434](../../../../app/api/workflows/_shared.ts)) | `usesPrivateCredential` / `viewerCanRunEdit` | `PrivateConnectionBadge` / `HeaderRunControls` (closed out separately) |

The DTO mirror functions (`computeCanConnect` / `computeCanReconnect` /
`computeCanDisconnect` / `computeSharingFields` / `restrictedToAdmins`) re-derive the
**same** rule the routes enforce, evaluated for UI gating only — the routes
re-authorize authoritatively, so a stale `true` can never bypass anything.

---

## 4. Security / no-leak guarantees (verified)

- **No existence/ownership oracle.** Non-member / cross-account / unknown id →
  `not_found` (404) on reconnect, disconnect, and share/unshare services; the connect
  route collapses `not_member` and `forbidden` to a single **403** with no account id
  in the body. A caller who can't act can't learn the row exists.
- **No silent impersonation.** Owner/admin cannot **share** a member's personal
  identity (connector-only); they can only **unshare** as a framed, separately-audited
  `admin_unshared` safety action.
- **DTO carries no secrets.** The Apps DTO emits booleans + a safe scope enum + opaque
  row id + display name only — never tokens, scopes, `provider_account_id`,
  `account_metadata`, `connected_by_user_id`, or the raw `integration_sharing_scope`.
  `restrictedToAdmins` is a bare boolean (no role/provider-class/identity).
- **Service-role writes behind authz.** All mutations go through the service chokepoints
  (`resolveAndAuthorize` / `resolveReconnectTarget` / `setIntegrationSharingScope`)
  after frozen + membership + role/connector checks.
- **Frozen account fails safe.** `pending_deletion` blocks connect (`account_frozen`
  409), reconnect, disconnect, and share **before** any mutation. The OAuth callback
  re-verifies account-operational + membership against the signed state.
- **Disconnected rows** are never mutated; share collapses them to `not_found`;
  disconnect is idempotent.

---

## 5. Data / RLS / model notes

- **No tables added or changed in this arc. No migration. `db:push` not run.**
- Account-scoped throughout: integration rows are owned by `account_id`; role is read
  from `account_memberships` (`getRole` session-client for the page/connect gate;
  `getRoleServiceRole` inside the services). Roles are `owner | admin | member`,
  **uniform across Team / Business / Enterprise** — plan tier gates limits/capabilities,
  never Apps permissions.
- Pre-APPS-PERM-1 account-provider rows whose `connected_by_user_id` is a plain member
  remain valid: that member can **view** but not reconnect/disconnect them (owner/admin
  only), and `restrictedToAdmins` explains why. **No data migration needed.**

---

## 6. UI behavior

- **Owner/admin and personal-provider behavior is unchanged** — Connect /
  Connect-another / Reconnect / Disconnect / Share / Stop-sharing render exactly as
  before APPS-PERM-1/2.
- **Members on account/service providers** no longer see a blank/broken card:
  - **Not connected:** a full-width note below the header — *"Only an owner or admin
    can connect this app for the team."*
  - **Connected (expanded):** a note in the accounts section — *"Only an owner or
    admin can reconnect or disconnect this team connection."*
- No fake/unsupported controls shipped; hidden actions are always accompanied by an
  explanation for the common member case. Notes are responsive full-width rows reusing
  the existing muted-note styling.

---

## 7. Deferred / known limitations (non-blocking)

- A **connected** account-provider card shows the restriction note only once expanded;
  collapsed it reads "N accounts connected" + a chevron (informative, not blank). Safe
  to leave.
- **No request-to-admin workflow** ("ask an admin to connect this") — out of scope;
  APPS-PERM-2 is copy/UX only, not notifications.
- Share/unshare cells are live only when **`ENABLE_CONNECTION_SHARING`** is set
  (`process.env... === "true"`). **Default OFF in code**; when OFF the DTO sharing
  fields are `not_applicable` and the service returns `not_enabled`. (Enabled locally
  via `.env.local` during the CONN-SHARE arc; production go-live sets the env var.)

---

## 8. Verification baseline

**All newly measured THIS session (2026-06-14) at HEAD `4a4dd8d6f` — not inherited:**

| Check | Command | Result |
|---|---|---|
| Apps/integrations/oauth/accounts test sweep | `npx jest tests/unit/app/apps tests/unit/features/apps tests/unit/services/integrations tests/unit/app/api/integrations tests/unit/app/api/accounts tests/unit/services/oauth tests/unit/app/AppsPage.test.tsx` | ✅ **590 passed / 56 suites** |
| Typecheck | `npm run typecheck` | ✅ 0 errors |
| Lint | `npm run lint` | ✅ 0 errors (19 pre-existing warnings, none in Apps/integration files) |
| Structure lint | `npm run lint:structure` | ✅ OK |
| Build | `npm run build` | **Not run this session** — docs-only slice, no source/UI/import change. (Last run green in APPS-PERM-2.) |

Coverage map (existing suites that pin the matrix — not duplicated by this slice):
- Route gate: [connect-route-account-binding.test.ts](../../../../tests/unit/app/api/integrations/oauth/connect-route-account-binding.test.ts), [connect-route-reconnect.test.ts](../../../../tests/unit/app/api/integrations/oauth/connect-route-reconnect.test.ts).
- Reconnect authz: [reconnect.test.ts](../../../../tests/unit/services/integrations/reconnect.test.ts).
- Disconnect authz: [disconnect.test.ts](../../../../tests/unit/services/integrations/disconnect.test.ts) + integration-disconnect.route.test.ts.
- Share/unshare: [connectionSharing.test.ts](../../../../tests/unit/services/integrations/connectionSharing.test.ts) + integration-sharing.route.test.ts.
- DTO matrix: [_shared.test.ts](../../../../tests/unit/app/apps/_shared.test.ts) (`canConnect`/`canReconnect`/`canDisconnect`/`restrictedToAdmins`/sharing/no-leak/exact key-list).
- UI: [AppCard.test.tsx](../../../../tests/unit/features/apps/AppCard.test.tsx) + AppsDashboard/AppsStatCards.
- Provider classification coverage: every registered provider deliberately classified (credentialSharing coverage test).

No new tests were added — the matrix is already covered cell-by-cell across the suites
above; adding a consolidated re-assertion would duplicate without raising coverage.

---

## 9. Recommended next tracks

- **Move to a new product area.** The Apps/integration permission model is locked and
  consistent; this is a clean stopping point.
- **(Optional, small)** Surface a one-line restriction hint on the *collapsed*
  connected account-provider card, if member feedback shows the expand step is missed.
- **(Optional, larger — needs product decision)** A lightweight "request an owner/admin
  to connect this app" flow. Explicitly out of scope here (would be notifications, not
  copy).

---

## 10. Closeout confirmation

Docs-only. Nothing pushed. No `db:push`, no migration, no AI/MCP/billing change.
Doc path: `docs/slices/phase-4/apps-permissions-matrix-closeout.md`.
