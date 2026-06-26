# 4.APPS-RECOVERY-UX — Connected-Apps Recovery UX Audit + Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-26
**Branch:** `v2-main`

> **STATUS: SHIPPED (arc closed 2026-06-26, local/unpushed).** CS-APPS-RECOVERY-1
> (execution-seam reconnect-needed signal, `e7ba8bc33`) and CS-APPS-RECOVERY-2
> (collapsed-card discoverability, `e9bd83c36`) are implemented; CS-APPS-RECOVERY-3
> verified the arc green and closed it. See
> [connected-apps-recovery-ux-closeout.md](./connected-apps-recovery-ux-closeout.md).
> One deferred caveat: live revoke smoke is manual-QA-pending (no safe automated path).

**Source of truth (verified current state — files actually read for this audit):**
[app/integrations/page.tsx](../../../../app/integrations/page.tsx) (legacy `/integrations` → 308 redirect to `/apps`) ·
[features/integrations/IntegrationsList.tsx](../../../../features/integrations/IntegrationsList.tsx) (legacy connect-only list, no recovery actions) ·
[app/apps/_shared.ts](../../../../app/apps/_shared.ts) (`toAppCatalogItem`, `computeCanReconnect`/`computeCanDisconnect`/`computeCanConnect`/`computeSharingFields`, `needsReconnect` derivation) ·
[features/apps/AppCard.tsx](../../../../features/apps/AppCard.tsx) (per-row Reconnect L300-309, per-row Disconnect L314-328, "Connect another" L171-178, expand chevron L127-143) ·
[features/apps/AppStatusPill.tsx](../../../../features/apps/AppStatusPill.tsx) (Connected / Reconnect needed / Not connected) ·
[features/apps/DisconnectDialog.tsx](../../../../features/apps/DisconnectDialog.tsx) (impact fetch + confirm + safe errors) ·
[app/api/accounts/[id]/integrations/[integrationId]/route.ts](../../../../app/api/accounts/[id]/integrations/[integrationId]/route.ts) (`DELETE` → `disconnectIntegration`) ·
[app/api/accounts/[id]/integrations/[integrationId]/workflow-impact/route.ts](../../../../app/api/accounts/[id]/integrations/[integrationId]/workflow-impact/route.ts) (advisory impact) ·
[app/api/integrations/oauth/[provider]/connect/route.ts](../../../../app/api/integrations/oauth/[provider]/connect/route.ts) (plain connect / connect-another / `reconnect` bundle) ·
[services/integrations/disconnect.ts](../../../../services/integrations/disconnect.ts) (`disconnectIntegration`, `getIntegrationWorkflowImpact`, `resolveAndAuthorize`) ·
[services/integrations/reconnect.ts](../../../../services/integrations/reconnect.ts) (`resolveReconnectTarget`, connector-only asymmetry) ·
[services/oauth/dispatcher.ts](../../../../services/oauth/dispatcher.ts) (`connect`/`handleCallback`/`refresh`/`revokeProviderToken`; `markNeedsReconnect` at L735 on `RefreshAuthRequiredError`; `clearNeedsReconnect` at L755) ·
[services/oauth/refreshAndRetry.ts](../../../../services/oauth/refreshAndRetry.ts) (execution-time 401 path; throws `IntegrationActionRequiredError`; **does NOT mark needs_reconnect**) ·
[repositories/integrations.ts](../../../../repositories/integrations.ts) (`markNeedsReconnect` L237, `clearNeedsReconnect` L260, `upsertActive` clears L184, `needs_reconnect_at` column) ·
[services/integrations/slackHealthCheck.ts](../../../../services/integrations/slackHealthCheck.ts) (proactive Slack mark/clear) ·
[services/options/resolveOptionsSource.ts](../../../../services/options/resolveOptionsSource.ts) (builder option-load mark L295 / clear L270) ·
[core/integrations/credentialSharing.ts](../../../../core/integrations/credentialSharing.ts) (`isAccountCredentialProvider` / `isPersonalCredentialProvider`) ·
[repositories/notifications.ts](../../../../repositories/notifications.ts) (reconnect-needed in-app notification) ·
[contracts/apps.ts](../../../../contracts/apps.ts) + [contracts/integration.ts](../../../../contracts/integration.ts) (DTO + signal contract) ·
migrations [20260624000000_add_integration_needs_reconnect_at.sql](../../../../supabase/migrations/20260624000000_add_integration_needs_reconnect_at.sql), [20260625000000_notifications_integration_reconnect_needed_type.sql](../../../../supabase/migrations/20260625000000_notifications_integration_reconnect_needed_type.sql), [20260627000000_revoke_authenticated_integration_writes.sql](../../../../supabase/migrations/20260627000000_revoke_authenticated_integration_writes.sql) ·
rules [oauth-dispatcher.md](../../../rules/oauth-dispatcher.md), [account-ownership-model.md](../../../rules/account-ownership-model.md) ·
prior plans/audits [apps-page-plan.md](./apps-page-plan.md), [v2-ready-47-apps-permission-model-audit.md](../readiness/v2-ready-47-apps-permission-model-audit.md), [v2-ready-27-slack-connection-truth-audit.md](../readiness/v2-ready-27-slack-connection-truth-audit.md).

---

## 0. Headline finding (read this first)

**The connected-apps recovery feature the task describes as missing is, in
fact, already implemented and shipped.** The premises in the request
("No clear visible Reconnect action", "Disconnect needs real backend/API
behavior, not fake UI", "workaround has been Connect-another", "Reconnect is
global not per-row") describe a state that predates the `4.APPS-RECONNECT`,
`4.APPS-DISCONNECT`, and `V2-READY-28` slices. Each goal item is verifiably
present in the current `v2-main` (HEAD `e2352d212`):

| Task goal | Status today | Evidence |
|---|---|---|
| Reconnect an existing **per-row** integration | **Shipped** | `AppCard.tsx:300-309` `reconnect={{integrationId, accountId}}`; `connect/route.ts` `reconnect` bundle → `resolveReconnectTarget`; callback identity-match refuses a different account |
| Disconnect/revoke safely (real backend) | **Shipped** | `DELETE …/integrations/[id]` → `disconnectIntegration`: soft-disconnect → cascade → **best-effort `revokeProviderToken`** |
| Correct connected-app card actions | **Shipped** | `AppCard.tsx`: Connect / Connect-another (additive) / Reconnect (per-row) / Disconnect (per-row) / Share / Stop-sharing |
| Account/team credential rules intact | **Shipped (and stronger than asked)** | per-row `canConnect`/`canReconnect`/`canDisconnect` server-derived in `_shared.ts`; deliberate disconnect-vs-reconnect asymmetry (see §3) |
| Warning + workflow-disable on disconnect | **Shipped** | `getIntegrationWorkflowImpact` + `DisconnectDialog` count-aware copy + cascade to `disabled(integration_revoked)` |
| Reconnect per-account, not global | **Shipped** | targets `acc.id`; server `resolveReconnectTarget` scopes to one `(account, integrationId)` row |

**Therefore this is NOT a build-from-scratch slice.** The honest, useful output
is a small audit-driven plan that (a) closes the **one real correctness gap** in
the reconnect-needed *signal*, and (b) improves *discoverability* of the existing
controls. Everything else is verification, not construction. No counts were
inflated and no action was reclassified to manufacture work.

---

## 1. Context

`/integrations` is a permanent redirect to `/apps`
([app/integrations/page.tsx](../../../../app/integrations/page.tsx)); the legacy
`IntegrationsList` is dead UI for recovery (connect-only). The live surface is the
Apps dashboard (`/apps`, `features/apps/*`), built across `4.APPS-PAGE-1` →
`4.APPS-DISCONNECT` → `4.APPS-RECONNECT` → `APPS-PERM-1/2` → `V2-READY-28`. This
plan fits the same arc and assumes that surface as the baseline.

The user-reported symptom ("recovery still feels incomplete; people resort to
Connect-another") is real but its cause is narrower than "no reconnect exists":
the **Apps card can show green "Connected" while a connection is actually broken**,
because the `needs_reconnect_at` signal is not set on every auth-failure path. A
user who never sees "Reconnect needed" naturally falls back to Connect-another.

---

## 2. Current codebase findings (verified)

### 2.1 UI — the controls exist, per-row, in the expanded section
`AppCard.tsx` renders a collapsed provider row (icon, name, account count,
`AppStatusPill`) with an expand chevron. **Expanding** reveals per-account rows,
each with the controls the caller is authorized for:
- **Reconnect** (L300-309): `<ConnectButton variant="reconnect" reconnect={{integrationId: acc.id, accountId}}>`, shown when `acc.canReconnect && app.canConnect`. Per-row by construction.
- **Disconnect** (L314-328): opens `DisconnectDialog`, shown when `acc.canDisconnect`.
- **Connect another** (L171-178): additive, provider-level, in the accounts-section header for `supportsMultipleAccounts`.
- **Share / Stop sharing** (L264-293): personal-credential rows only, flag-gated.
- A per-row **"Reconnect needed"** chip + copy (L238-257) and provider-level `AppStatusPill` "Reconnect needed" (warning variant) render when `needsReconnect`.

**Key UX observation:** Reconnect/Disconnect live **only** inside the expanded
section. The collapsed card surfaces the *status* ("Reconnect needed" pill) but
**no direct recovery action** — the user must know to click the chevron. This is
the discoverability gap (§4-B).

### 2.2 Backend — disconnect, reconnect, impact all real and authorized
- **Disconnect** (`services/integrations/disconnect.ts`): `resolveAndAuthorize` (frozen → exact `(account,id)` row → role/connector) → soft-disconnect (`disconnected_at`, clear token cols, idempotent) → cascade ACTIVE/PAUSED dependents to `disabled(integration_revoked)` **only when this was the last active row for the provider** → best-effort `revokeProviderToken` (swallows all errors, never blocks/leaks). Returns `{disabledWorkflowCount, providerRevoked, alreadyDisconnected}`. No-leak: every "can't see it" collapses to `not_found` → single 404.
- **Reconnect** (`services/integrations/reconnect.ts`): `resolveReconnectTarget` shares the same gate, returns the bound `(accountId, integrationId, expectedProviderAccountId)` for the dispatcher to steer the provider sign-in; the **callback identity-match** is the hard guarantee a reconnect only refreshes the intended row.
- **Connect route** (`app/api/integrations/oauth/[provider]/connect/route.ts`): one POST handles plain connect (active account), Connect-another, per-tenant `providerHint` (Shopify), and the `reconnect` bundle. Account/service-provider connect/reconnect is owner/admin-gated (`APPS-PERM-1`).

### 2.3 Credential rules (V2 account model — correct and nuanced)
Per [account-ownership-model.md](../../../rules/account-ownership-model.md):
integrations are `account_id`-owned, `connected_by_user_id` is provenance used for
the **reconnect deep-link identity**. A team account legitimately holds multiple
rows per provider (member work identities + shared services). All recovery actions
are therefore **per-row**. `_shared.ts`/`disconnect.ts`/`reconnect.ts` encode:
- Account/service providers (Slack/Stripe/Notion/Shopify/HubSpot/Mailchimp): connect/reconnect/disconnect = **owner/admin**.
- Personal providers: **disconnect** = owner/admin OR connector; **reconnect** = **connector only** (an intentional asymmetry — owner/admin may revoke a member's personal connection for safety but cannot re-authorize someone else's identity; `reconnect.ts:95-106`).

### 2.4 The `needs_reconnect_at` signal — wired, but coverage is incomplete
Column added in `20260624000000`; read into the DTO as `needsReconnect` boolean
(`_shared.ts:213`). Writers/clearers (`repositories/integrations.ts`
`markNeedsReconnect`/`clearNeedsReconnect`, conditional NULL→now UPDATE so the
notify is one-shot). **Set** in exactly three places today:
1. `dispatcher.ts:735` — refresh path, **only** on typed `RefreshAuthRequiredError` (dead OAuth grant: revoked / consent-withdrawn) for **refreshable** providers.
2. `slackHealthCheck.ts:114` — proactive Slack `auth.test` failure (Slack is non-refreshable, so it gets a dedicated check).
3. `resolveOptionsSource.ts:295` — **builder** option-load auth failure (`PROVIDER_REAUTH_REQUIRED`) for any provider.

**Cleared** on: successful refresh (dispatcher), Slack `auth.test` ok, successful
option-load, and every `upsertActive` (re)connect. A NULL→set transition fires one
in-app notification (`repositories/notifications.ts`, migration `20260625000000`).

**The gap (verified in `refreshAndRetry.ts`):** the execution-time 401 path does
**not** call `markNeedsReconnect`. So:
- ❌ A **non-refreshable** provider (Discord / GitHub / Stripe / Shopify offline) whose token is revoked fails a *background* run with `IntegrationActionRequiredError(refresh_not_supported)` — but `needs_reconnect_at` stays NULL → Apps card still shows green "Connected".
- ❌ A **refreshable** provider where refresh *succeeds* but the retry still 401s (scope shrunk, account moved) throws `refresh_failed` — also **not** marked.
- ✅ Only refreshable + dead-grant, Slack (proactive), and builder option-loads currently flip the card to "Reconnect needed".

Net: a workflow that fails at runtime due to a revoked credential surfaces in the
run's error-classification + failure notification (the error-handling UX), but the
**Apps page itself can lie green** until the user opens the builder or it's Slack.
This is the precise reason recovery "feels incomplete."

### 2.5 Flag posture
Reconnect / Disconnect / Connect are **not** behind a feature flag (`_shared.ts`
`computeCanReconnect`/`computeCanDisconnect` have no flag check) — they are live in
prod. Only **Sharing** is gated (`isConnectionSharingEnabled()`). So the recovery
controls are shipped and visible to authorized callers today.

---

## 3. Product / model decision

What this feature **is**: per-connection (per integration *row*) self-service
recovery — Reconnect re-authorizes one identity in place; Disconnect removes one
identity with a real revoke + workflow-impact warning + lifecycle cascade; both
respect the V2 account model and the personal-vs-account credential split.

What it is **deliberately NOT** (confirmed against `apps-page-plan.md`): no
per-account "Manage" page (no endpoint); no workflows-per-account counts on cards
(would be fake until a real integration→workflow link exists); no provider-level
"reconnect everything" (reconnect must target one row); no auto-resume of disabled
workflows after reconnect (lifecycle requires manual resume). This plan does not
change any of those non-goals.

---

## 4. Recommended approach (small, additive)

Two surgical changes plus a verification pass. No schema change (the column,
notification, repo writers, DTO, and UI states already exist).

### A. Close the execution-time reconnect-needed signal gap (the real fix)
Make `refreshAndRetry` set the signal whenever it concludes the integration needs
human action, so the Apps card reflects reality for **all** auth-failure classes,
not just refreshable-dead-grant / Slack / builder-time.

- In `refreshAndRetry.ts`, at the two points that throw
  `IntegrationActionRequiredError` (reason `refresh_not_supported` **and**
  `refresh_failed`), call `markNeedsReconnect(row.id)` **best-effort** and, on the
  first transition, `notifyReconnectNeeded(row)` — exactly mirroring the existing
  `dispatcher.ts:733-739` idiom (idempotent conditional UPDATE = one-shot notify; a
  signal-write failure must never mask the run failure).
- Resolve the row id via the same pinned `getActiveForExecution` lookup already in
  the function (the `initialRow` / `refreshedRow` it holds), so no new query.
- **Do not** mark on transient/config/non-auth errors (those already propagate
  verbatim and never enter this branch) — preserves the current "transient ≠
  reconnect" precision the dispatcher comment calls out.

Outcome: a revoked Discord/GitHub/Stripe token, or a refresh-OK-retry-401, that
fails a background run now flips the Apps card to "Reconnect needed" and fires the
one-shot notification — the same recovery loop refreshable-dead-grant already gets.

### B. Make the existing per-row Reconnect discoverable from the collapsed card
When a provider card `needsReconnect`, surface a direct **Reconnect** affordance at
the collapsed level that deep-links to the flagged row instead of requiring the
user to discover the chevron:
- If exactly one account row needs reconnect → render a collapsed-card "Reconnect"
  button that reuses the existing per-row `ConnectButton reconnect={{…}}` for that
  row (no new endpoint, no new control type).
- If multiple rows need reconnect (multi-account provider) → the collapsed CTA
  **expands** the card and scrolls to the accounts list (the per-row buttons stay
  the action). Never a provider-level "reconnect all" (would violate the per-row
  rule).
- Gate identically to the per-row control (`acc.canReconnect && app.canConnect`).
  A caller who can't reconnect (e.g. a non-connector on a personal row) sees the
  status pill + existing explanatory copy, no dead button.

This is presentational reuse of shipped primitives; no backend change.

### C. Verification (no product change)
Confirm end-to-end: revoke a smoke-owned token for a non-refreshable provider, run
a dependent workflow, assert the row flips to `needs_reconnect_at` non-null, the
card shows "Reconnect needed", the one-shot notification fires, Reconnect clears it.

---

## 5. Alternatives considered

| Option | Security | UI complexity | Correctness | Verdict |
|---|---|---|---|---|
| **A+B (recommended)** — extend the existing signal at the execution seam + reuse per-row reconnect at card level | No new surface; reuses authorized primitives | Low (reuse) | Closes the green-while-broken hole | **Accepted** |
| Mark `needs_reconnect_at` from a *health-engine listener* on `IntegrationActionRequiredError` (the "future listener" the code comments anticipate) | Same | Medium (new listener wiring) | Same outcome, more moving parts now | Deferred — A is the minimal seam today; a listener is the right home if/when a health engine lands |
| Add a provider-level "Reconnect all" button | Would re-auth multiple identities in one click — violates per-row identity-match + owner/admin-vs-connector asymmetry | Low | **Wrong model** | Rejected |
| Rebuild reconnect/disconnect (treat task premises as literal) | Re-introduces solved problems; risk of regressing shipped auth gates | High | Net-negative | Rejected — the feature exists |
| Do nothing (signal stays builder-time only) | n/a | n/a | Leaves background failures invisible on the Apps page | Rejected — this is the user's actual complaint |

---

## 6. Security / data model

- **No schema change.** `needs_reconnect_at` exists; writers/clearers exist; the
  notification type exists; `20260627000000` already revokes authenticated
  integration writes so all mutations go through service-role repo fns. Nothing to
  migrate.
- **No-leak preserved.** `markNeedsReconnect` writes only a timestamp; the DTO
  emits only a boolean (`v2-ready-47c` confirms the raw timestamp is stripped). No
  token, scope, provider error, or identity is added anywhere by this plan.
- **Authorization unchanged.** Recovery controls keep their existing gates; the
  card-level CTA (B) inherits the exact per-row `canReconnect` rule. The execution
  seam (A) is server-side and account-pinned (it already resolves the correct row
  via the personal-credential provenance pin).
- **One-shot discipline.** Reuse the conditional NULL→now UPDATE so adding a second
  call site cannot double-notify (concurrent 401s already coalesce in the refresh
  lock).

---

## 7. API / service / UI expectations (described, not built)

- **No new routes or contracts.** `DELETE …/integrations/[id]`,
  `GET …/workflow-impact`, and `POST …/oauth/[provider]/connect` (reconnect bundle)
  stay as-is.
- **Service change (A):** `refreshAndRetry` gains best-effort
  `markNeedsReconnect` + one-shot `notifyReconnectNeeded` on its two
  action-required throw paths. Behavioral contract otherwise unchanged (still
  throws `IntegrationActionRequiredError`; the run still fails).
- **UI change (B):** `AppCard` renders a collapsed-card Reconnect affordance when
  `needsReconnect`, reusing the existing `ConnectButton` reconnect variant; no new
  prop on the DTO is strictly required (the card already has `app.accounts[]` with
  per-row `id`/`canReconnect`/`needsReconnect`). A small `needsReconnect`-row
  selector in the card is sufficient.

---

## 8. Tests required

- **A (unit, `tests/unit/services/oauth/refreshAndRetry.test.ts`):** non-refreshable
  401 → `markNeedsReconnect` called once + notify once + still throws
  `refresh_not_supported`; refresh-OK-retry-401 → marked + `refresh_failed`;
  transient/non-auth error → **not** marked; signal-write failure does not mask the
  run failure; concurrent 401s mark/notify once.
- **B (component, `tests/unit/features/apps/AppCard.test.tsx`):** collapsed card with
  `needsReconnect` + a single flagged row renders a Reconnect button bound to that
  `integrationId`; multi-row needsReconnect expands rather than acting; no button
  when `!canReconnect`; healthy card unchanged.
- **Regression:** `app/apps/_shared.ts` DTO-safety (no raw timestamp/token) stays
  green; disconnect/reconnect authz tests unchanged.
- **Verification (C):** focused live smoke against a smoke-owned connection (manual,
  not a new CI suite) — see §4-C.

---

## 9. Implementation slice breakdown (small, ordered)

- **CS-APPS-RECOVERY-1 — Execution-seam signal coverage (the fix).** `refreshAndRetry`
  marks/notifies on both action-required paths; unit tests in §8-A. Backend only;
  no flag (it strengthens an existing, always-on signal). *Smallest correctness
  win; do first.*
- **CS-APPS-RECOVERY-2 — Collapsed-card Reconnect discoverability.** `AppCard`
  surfaces the per-row Reconnect at card level when `needsReconnect`; component
  tests in §8-B. UI only; reuses shipped primitives.
- **CS-APPS-RECOVERY-3 — End-to-end verification + doc closeout.** Live smoke per
  §4-C; reconcile the apps runbook/closeout to "recovery loop closed for all
  auth-failure classes." Docs/verification only.

No new feature flag is warranted (no new public surface; A strengthens an existing
signal, B reuses an existing authorized control). If product wants the card-level
CTA staged, gate **B** behind a trivial `ENABLE_APPS_RECONNECT_CTA` (default OFF) —
**A should ship unflagged** as a correctness fix.

---

## 10. Risks / open questions

1. **Is option-load coverage "good enough"?** Today a broken connection self-marks
   the next time the user opens the builder. If product considers that acceptable,
   CS-1 is optional. **Recommendation:** ship CS-1 — background-only workflows never
   open the builder, so without it those users never see the prompt.
2. **Notification volume.** Adding a second mark site could, in theory, increase
   reconnect-needed notifications. **Mitigated** by the one-shot conditional UPDATE
   (only NULL→set notifies); net effect is "the same one notification, just fired
   from the run that actually failed." Confirm no double-notify in CS-1 tests.
3. **Health-engine future.** The code comments anticipate a health-engine listener
   as the eventual home for action-required→signal. CS-1's seam is compatible: when
   a listener lands, it can subsume the inline mark without changing the DTO/UI.
   **Recommendation:** keep CS-1 inline now; revisit when a health engine exists.
4. **Multi-row reconnect CTA semantics.** "Expand + scroll" vs "reconnect the first
   flagged row" for multi-account providers. **Recommendation:** expand + scroll —
   never auto-pick an identity to re-auth.

---

## 11. Acceptance criteria

**This planning slice:** the doc exists, every "current state" claim cites a file
read for the audit, no source/test/migration/UI changed, nothing pushed.

**The implementation slices must later prove:** (a) a revoked non-refreshable
credential failing a background run flips the Apps card to "Reconnect needed" + one
notification; (b) the per-row Reconnect is reachable from the collapsed card when a
connection needs it; (c) all existing reconnect/disconnect authz + no-leak +
DTO-safety tests stay green; (d) no schema change; (e) Reconnect clears the signal.

---

## 12. Hard boundaries (what this slice did NOT do)

No code, tests, migrations, schema, or UI were changed. No flags toggled. No push,
deploy, or db:push. The uncommitted WORKFLOW-EDITOR WIP and trash/probe scripts
were not touched. The audit only read files and wrote this doc.

---

## 13. Recommended next step

Pick up **CS-APPS-RECOVERY-1** (execution-seam signal coverage) — it is the single
highest-leverage, smallest change and closes the actual "green-while-broken"
recovery hole. CS-2 (discoverability) and CS-3 (verification) follow.
