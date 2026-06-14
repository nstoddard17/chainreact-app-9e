# 4.V2-READY-7 — Connection-Health / Reconnect-Needed Failure-UX Audit

**Type:** Audit + recommendation (docs-only). Nothing pushed. `db:push` NOT run. No source changed.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Parent risk:** [v2-existing-app-readiness-audit.md](../v2-existing-app-readiness-audit.md) §3 risk #2 ("No connection health/expiry signal" — HIGH) and backlog #10.

> **Verdict.** V2's connection-failure handling is **reactive and safe, but silent and
> inconsistent**. There is **no persistent connection-health state** anywhere — a
> revoked/expired token leaves the integration row marked "active" with no DB signal,
> no proactive prompt, and the next run just fails again. Failures are caught cleanly
> and the run always reaches a terminal state, but the *guidance* a user gets is uneven:
> the **builder's token-rejected ("needs-reconnect") path is good** (links to /apps),
> while the **builder's fully-disconnected path is opaque**, the **Apps page shows only
> connected/not-connected**, and a **failed-run reconnect notification fires only after a
> run fails** (no standalone alert). One **low-severity no-leak inconsistency** exists:
> the failure-notification body carries the raw identifier string that the run-detail API
> deliberately redacts. **No high-severity leak; no token/secret/other-user PII exposure.**
> The smallest safe win is **builder disconnected-arm parity + the notification-body
> redaction** — both pure, no health-system, no migration. The full Apps-page health
> surface is real scope creep and is listed under "do not build yet".

Source: four read-only sweeps of `c:\Users\marcu\source\repos\ChainReactV2`, with the
load-bearing no-leak chain re-verified directly (citations inline).

---

## 1. Files inspected

- **Refresh path:** [`services/oauth/refreshAndRetry.ts`](../../../../services/oauth/refreshAndRetry.ts), [`services/oauth/dispatcher.ts`](../../../../services/oauth/dispatcher.ts), `services/oauth/refreshLock.ts`, `integrations/_shared/google/oauth.ts`, `integrations/slack/oauth.ts`, `integrations/notion/oauth.ts`, [`core/integrations/credentialSharing.ts`](../../../../core/integrations/credentialSharing.ts).
- **Execution:** [`services/execution/engine.ts`](../../../../services/execution/engine.ts), `services/execution/engineTypes.ts`, `services/execution/runPersistence.ts`, `services/workflows/executionReadiness.ts`.
- **Error/diagnostics:** [`core/errors/humanizeActionError.ts`](../../../../core/errors/humanizeActionError.ts), [`app/api/workflows/_shared.ts`](../../../../app/api/workflows/_shared.ts) (`toSafeStepError`), `services/diagnostics/runReport.ts`, `services/diagnostics/integrationConnection.ts`.
- **Apps UI:** `features/apps/{AppCard,AppsDashboard,AppStatusPill,AppsStatCards,AppsToolbar}.tsx`, `app/apps/_shared.ts`, `contracts/apps.ts`.
- **Builder UI:** `features/workflow-builder/hooks/useOptionsSource.ts`, `.../fields/ComboboxField.tsx`, `.../canvas/adapters.ts` + `WorkflowNodeCard.tsx`, `CredentialOwnershipBadge.tsx`, `NodeConnectorBindingControl.tsx`, `HeaderRunControls.tsx`, `services/options/resolveOptionsSource.ts`.
- **Notifications:** `services/notifications/{notifyWorkflowFailure,buildWorkflowFailurePayload}.ts`, `services/notifications/channels/inApp.ts`, `repositories/notifications.ts`, `app/notifications/credentialRequestNotice.ts`.
- **Schema:** `supabase/migrations/20260505000002_integrations.sql`, `…_integrations_account_cutover.sql`, `…_add_integration_sharing_scope.sql`.
- **Tests:** `tests/unit/services/oauth/*`, `tests/unit/services/execution/engine.test.ts`, `tests/unit/features/apps/AppCard.test.tsx`, `tests/unit/services/diagnostics/*`, `tests/unit/app/api/workflows/_shared.test.ts`, `tests/unit/services/notifications/*`.

---

## 2. Current connection-health behavior

### 2.1 The single most important fact

**There is no persistent connection-health state in V2.** The `integrations` table has exactly **one** status-ish column — `disconnected_at timestamptz` (`IS NULL` = active). There is **no** `health_check_status`, `requires_reconnect`, `last_error_code`, `next_health_check_at`, etc. (the V1 health-state-machine columns named in `CLAUDE.md` do **not** exist in V2). `disconnected_at` is written **only** by explicit user/offboarding actions (`repositories/integrations.ts` `disconnectByIdServiceRole` / `softDisconnectPersonalForMember`) — **never** by a refresh failure. There is **no proactive health-check cron** and **no health-transition engine** in V2.

→ A revoked/dead token leaves a permanently-failing **"active"** integration with no DB signal and no proactive reconnect prompt.

### 2.2 Behavior table

| Area | Component | Current behavior |
|---|---|---|
| **Refresh** | `refreshAndRetry.ts` | On a handler 401 (`Unauthorized401Error`): refresh once → retry once. Refresh unsupported → `IntegrationActionRequiredError(reason: refresh_not_supported)`; refresh/2nd-401 fails → `…(reason: refresh_failed)`. Non-401 (403, 5xx, network) **propagates untouched** — no refresh attempt. Concurrent 401s coalesce (in-process lock). Personal providers pin lookup/refresh to the workflow creator; **never** falls back to a co-member. |
| **Refreshability** | per-provider `oauth.ts` | Decided **per provider** (refreshable → real `refreshToken`; non-refreshable → throws `RefreshNotSupportedError`). No central registry to query "is X refreshable". Non-refreshable in V2: Slack, Notion (V2 drops Notion refresh), Shopify, GitHub, Facebook, Mailchimp. |
| **Marking** | (none) | **No integration row is marked** on refresh failure. No health write. Next run retries from scratch. |
| **Engine** | `engine.ts` | No auth taxonomy. **Every** handler throw — missing connection, revoked token, 401-after-refresh, 403/scope, plain bug — collapses to one code `HANDLER_FAILED` + `message: (err as Error).message`. Run status is binary `succeeded`/`failed`; the failing step finalizes the run (never left `running` — tested). The rich `reason` survives only inside the message string. |
| **Readiness gate** | `executionReadiness.ts` | Validates graph integrity + required **config fields** only — **not credential presence**. A structurally-valid but unconnected workflow passes readiness and fails at handler time. |
| **Humanizer** | `humanizeActionError.ts` | `HANDLER_FAILED` → generic `"Workflow step failed"` with the raw message as description, **no reconnect CTA** — **except Slack**, whose message-prefix-matched auth codes (`invalid_auth`/`token_revoked`/`token_expired`/…) map to `"Slack needs to be reconnected"`, `action: "reconnect"`. **No equivalent for Gmail/Google/Microsoft/Stripe/Notion/etc.** |
| **Run-detail (client)** | `app/api/workflows/_shared.ts` `toSafeStepError` | **Safe.** Runs each persisted step error through the humanizer; if it hit the generic fallback (`title === GENERIC_ACTION_ERROR_TITLE`) returns the safe title, not the raw description; drops `details`. Strips ids/emails/tokens/scopes/provider bodies (V2-READY-2). |
| **Runs dashboard** | `features/runs/RunRow.tsx` | Renders the humanized error block (e.g. "Gmail token expired" / "Reconnect Gmail" text) but **deliberately renders no CTA button** (page guide forbids fake affordances). |
| **Apps page** | `AppCard.tsx` | **Binary only:** `data-state = connected | available`. **No "needs reconnect"/expired/action-required state.** Health-driven "Need attention" tile/tab/sort explicitly **deferred** (`AppStatusPill.tsx:10`, `AppsStatCards.tsx:8`, `AppsToolbar.tsx:11` — "needs a health field on the DTO"). A **Reconnect** button exists per-account (`app-card-reconnect`) but is shown on **every** connected account the caller may manage — never triggered by a detected-broken signal. Role gating: account/service providers → owner/admin; personal → original connector only. |
| **Builder (option pickers)** | `ComboboxField.tsx` + `useOptionsSource.ts` | **Richest surface.** Four connection states on async option fields: `needs-reconnect` (token rejected) → message + **link to /apps** (`combobox-reconnect-link`) ✅ good; `disconnected` (no row) → bare "Connect {provider} first to load options", **no message echo, no retry, no /apps link, no testid** ✗ opaque; `owner-must-connect` / `owner-gated` → inline disabled lock buttons. Distinct server codes: `INTEGRATION_DISCONNECTED` vs `PROVIDER_REAUTH_REQUIRED`. |
| **Builder (node card)** | `canvas/adapters.ts` | The node "Needs setup" badge = missing required **config fields** only — **not** connection status. No node-level "this app is disconnected" banner outside the option picker. |
| **Builder (team creds)** | `CredentialOwnershipBadge.tsx` etc. | Clearly states which connection a step uses ("Shared team connection" / "Runs under {creator}'s connection") — names only, no email/id. Non-creators who can't run see "…runs with the creator's private connection. **Duplicate it to use your own connection.**" — but **no Duplicate action exists** (`WorkflowActionsMenu.tsx:31` confirms it's intentionally unrendered; no `duplicate`/`clone` route). Guidance is currently a **dead end** (policy still enforced server-side with a typed 403). |
| **Notifications** | `inApp.ts` | **No dedicated connection/reconnect type.** Types: `workflow_failed`, `workflow_high_risk_*`, `account_invitation`, `api_key_*`. A reconnect alert surfaces **only** as a `workflow_failed` notification (when a run actually fails), with `metadata.action: "reconnect"` + CTA → `/apps`. **No standalone/proactive "your token expired" alert.** Recipient = the workflow **creator** only. |

---

## 3. User-visible failure examples

1. **Expired Google token, refresh succeeds** → transparent. Run **succeeds**, no failed step. (Best case, works.)
2. **Revoked Google token (refresh fails)** → run **failed**; step shows the sanitized **"Workflow step failed"** in run-detail (no reconnect CTA); the creator gets a `workflow_failed` in-app notification. **No Apps-page signal that Google needs reconnecting.** Next run fails identically.
3. **Slack token revoked** → run **failed**; humanizer recognizes the Slack code → run-detail/runs show **"Slack needs to be reconnected"** + the notification carries `action: reconnect` → `/apps`. (Slack is the one well-guided provider.)
4. **Provider not connected at all** (no row) → run **failed** with generic "Workflow step failed"; in the **builder**, the option picker shows the **opaque** "Connect {provider} first" with no /apps link.
5. **403 / insufficient scope** → run **failed**, generic message, **no refresh attempt, no scope-specific guidance** — indistinguishable from a generic bug.
6. **Personal connection broken on a team workflow** → a non-creator member sees only the sanitized **"Workflow step failed"** (the underlying "the workflow owner has no active connection" message is stripped before the client). **No "ask the creator to reconnect" guidance**; only the **creator** is notified.
7. **Builder, token rejected mid-config** → `needs-reconnect` arm shows a clear message + **"Reconnect {provider} in Apps"** link. (Good.)

---

## 4. No-leak assessment

**Strong, with one low-severity inconsistency.**

- **Refresh path logs nothing** — zero `console`/`logger` in `services/oauth/`; provider refresh helpers throw error **codes** (e.g. `invalid_grant`), never bodies or `error_description`. No token/secret/client-secret is logged anywhere in the refresh path. ✅
- **Run-detail client boundary** (`toSafeStepError`) deliberately redacts the identifier-bearing `IntegrationActionRequiredError` message and drops `details`; proven by `_shared.test.ts`. ✅
- **Run diagnostics** (`runReport.ts`) drops raw `steps[].error.message`/`details`, keeps only code + stored humanized classification; pinned by `runReport.test.ts` ("raw internals never appear"). ✅
- **Apps DTO + builder credential surfaces** emit display names only — never `connected_by_user_id`, `provider_account_id`, tokens, scopes, raw metadata; pinned by `_shared-dto-safety.test.ts`. Sharing pill shows only "Shared with team"/"Private to you". ✅

- **⚠️ LOW-severity inconsistency — failure-notification body is NOT redacted.** Verified chain: `IntegrationActionRequiredError.message` embeds `account=<uuid>, provider=<provider>, provider-account=<email|team_id>` (`refreshAndRetry.ts:88-93`) → caught as `HANDLER_FAILED` → humanizer **generic fallback** sets `description = raw message` (`humanizeActionError.ts:58-62`) → `inApp.ts:32` writes `body: buildPlainTextBody(errorClassification)` = `description` (`buildWorkflowFailurePayload.ts:94-96`). The in-app channel does **not** apply the `GENERIC_ACTION_ERROR_TITLE` redaction the run-detail route applies, so the `notifications.body` row carries the raw `account=<internal-uuid>, provider-account=<email|team_id>` string.
  - **Why it's LOW, not high:** the recipient is always the workflow **creator** (`notifyWorkflowFailure({ userId: createdByUserId })`). For personal providers `provider-account` is the creator's **own** email (self-exposure, not a leak); for account providers it's a non-secret `team_id`/`bot_id`. The only genuinely "internal" value exposed is the **account UUID**. **No token, no client secret, no other user's PII.** It is a *consistency* gap — the same string V2-READY-2 chose to strip from one surface survives on another — worth closing, not an incident.

---

## 5. Gaps (user-facing)

1. **No persistent reconnect signal.** A broken token is invisible until (and unless) a workflow runs and fails. The Apps page can't tell a user anything needs reconnecting (health DTO field deferred). [biggest gap — matches readiness risk #2]
2. **Builder `disconnected` arm is opaque** — no message, no retry, no /apps link, no testid; its sibling `needs-reconnect` arm is well-built. Easy parity win.
3. **Non-Slack auth failures get no reconnect CTA** — only Slack's message-prefix path maps to `action: reconnect`. Gmail/Google/MS/Stripe/Notion auth failures read as generic "Workflow step failed".
4. **Non-creator team members get no actionable guidance** when the creator's personal credential is broken (message sanitized away; only the creator is notified). No "ask the owner to reconnect" surface.
5. **"Duplicate to use your own connection" guidance is a dead end** — no Duplicate action/route exists.
6. **403 / insufficient-scope is silently generic** — bypasses refresh and is untested as a distinct case.
7. **Notification-body redaction inconsistency** (§4 — low severity).

**Test gaps:** no integration/e2e for connect→callback→DB-row→UI; reconnect/disconnect are unit-only; no Apps "needs-reconnect" render test (state doesn't exist); no builder node "missing connection" test (state doesn't exist); no direct test that a non-Slack auth failure does/doesn't get a reconnect CTA.

---

## 6. Recommended smallest safe implementation slice

**V2-READY-8 — "Reconnect guidance parity + notification-body redaction" (pure UI + one redaction; NO health system, NO migration, NO new notification type).** Two small, independent, high-confidence changes:

1. **Bring the builder `disconnected` option-picker arm to parity with `needs-reconnect`** (`ComboboxField.tsx`): render the server `message`, add the **"Reconnect {provider} in Apps"** `/apps` link, and a `combobox-disconnected` testid — mirroring the existing `needs-reconnect` arm. Closes gap #2 (the "opaque option-resolver disconnected error" the readiness audit named). Pure client UI; the server already returns the distinct `INTEGRATION_DISCONNECTED` code + message. ~1 component arm + 1 test.
2. **Redact the generic-fallback description before it reaches the notification body** — reuse the already-exported `GENERIC_ACTION_ERROR_TITLE` marker (the same guard `toSafeStepError` uses) in `buildPlainTextBody`/the in-app channel so a generic-fallback failure surfaces the safe title instead of the raw `account=/provider-account=` string. Closes gap #7. ~5 lines + 1 test. (Touches notification *content sanitation*, not a new notification system — within scope; no AI/MCP/billing.)

**Why this is the right "smallest":** it delivers real, safe reconnect guidance at the two points users actually hit (builder config + the failure feed) without the deferred health DTO, without marking integrations in the DB, and without a proactive cron — all of which are genuinely larger, riskier projects.

**Optional stretch (still bounded, but a judgment call — flag to Marcus):** map the non-Slack `IntegrationActionRequiredError(reason)` to `action: "reconnect"` in the humanizer so Gmail/Google/MS/Stripe/etc. auth failures get the same reconnect CTA Slack already does (gap #3). This needs the engine to preserve the error class/reason (today it collapses to `HANDLER_FAILED` + string), so it's a slightly bigger change to the engine catch — recommend as its own follow-up, not folded into V2-READY-8.

---

## 7. "Do NOT build yet" (scope creep)

- **Full Apps-page connection-health surface** — the deferred health DTO field + "Need attention" stat tile / filter tab / "Issues first" sort. Requires a detection source **and** a DTO/contract change **and** UI. Real project, not a slice.
- **Proactive health-check cron / health-state machine / standalone reconnect notifications** — the V1 system (`proactive-health-check`, `notify-user-actions`, milestone escalation). Explicitly out of scope; do not port speculatively.
- **Marking integrations disconnected on refresh failure** (writing the integration row / adding a health column on a 401). Tempting but risky: needs careful design for transient-401 false positives, when to clear the flag, idempotency, and a migration. Separate, designed slice — not now.
- **A new `connection_needs_reconnect` notification type** (persisted) — would need a `NotificationType` enum value (+ possible migration). The cheaper proven pattern, if a proactive bell notice is ever wanted, is the **derived, non-persisted** `credentialRequestNotice.ts` pattern (count-only synthetic bell row, no schema change) — but even that is **not** part of the smallest slice; note it as the cheapest future option.
- **The Duplicate-workflow action** behind the "duplicate to use your own connection" copy — a separate feature, not connection-health. (Until it exists, the copy is honest-but-dead-end; the policy is enforced server-side.)

---

## 8. Closeout confirmation

Docs-only — one new readiness report. **No source/test/migration/UI changed.** No `db:push`,
no push/deploy. No AI / MCP / billing behavior touched. No providers changed. No new
notification system added (the §6 recommendation is a *future* slice, not implemented
here). The load-bearing no-leak chain (§4) was re-verified directly against source;
severity is reported proportionately (low, recipient = creator, no token/secret/other-user
PII).
