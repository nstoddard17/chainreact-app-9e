# SLACK-TOKEN-ROTATION-1 — Slack token rotation support (fixes the recurring reconnect loop)

**Type:** Bug-fix slice (OAuth token handling — security-review skill applied).
**Date:** 2026-07-24. Branch `v2-main`. Local commit only; nothing pushed. No migration.

---

## 1. The symptom

Slack was the only integration that repeatedly demanded reconnection. Marcus's Slack
app is configured such that (per his report) tokens "shouldn't expire" — yet the
connection kept dying and re-marking "reconnect needed" on a roughly daily cadence.

## 2. Root cause (proven from code)

[`integrations/slack/oauth.ts`](../../../integrations/slack/oauth.ts) `handleCallback`
hard-coded `refreshTokenEncrypted: null, accessTokenExpiresAt: null` and its
`SlackOAuthV2Success` type had no `refresh_token` / `expires_in` fields — **any
rotation fields Slack returned were silently discarded.**

Slack's token rotation is opt-in per app — and once an app enables it, Slack does not
allow turning it off. A rotation-enabled app's `oauth.v2.access` response carries
`expires_in` (~43 200 s = 12 h) and a single-use rotating `refresh_token`. V2 dropped
both and stored the 12-hour access token as if permanent, so:

1. User (re)connects Slack → V2 stores a 12 h token with `access_token_expires_at = NULL`.
2. The proactive refresh sweep ([`tokenRefreshSweep`](../../../services/integrations/tokenRefreshSweep.ts))
   never selects the row (`access_token_expires_at IS NULL` exclusion) and the manifest
   said `refreshable: false` anyway.
3. ~12 h later the token dies. The Slack health-check cron / builder pickers classify
   `token_expired` (`isSlackAuthError`) → `needs_reconnect_at` set → notify.
4. User reconnects → back to step 1. Loop forever.

This also explains why ONLY Slack looped: every other rotating provider (Google,
Microsoft, Asana, Monday, Calendly, HubSpot, …) already persisted refresh material and
was covered by the Phase 8 proactive sweep.

If the Slack app does NOT have rotation enabled, this slice changes nothing at
runtime: the response carries no rotation fields, the stored nulls mean
"non-expiring", and all prior behavior is preserved.

## 3. What changed

| File | Change |
|---|---|
| [`integrations/slack/oauth.ts`](../../../integrations/slack/oauth.ts) | `handleCallback` persists `expires_in` → epoch expiry + encrypted `refresh_token` when present. Implements `refreshToken()`: `oauth.v2.access` with `grant_type=refresh_token`; rotated refresh token persisted (prior grant preserved if the response omits one); dead-grant codes (`invalid_refresh_token`, `token_revoked`, `account_inactive`, `invalid_auth`) → `RefreshAuthRequiredError("slack", code)` so the dispatcher marks + notifies once; config/transient codes stay generic (never flip reconnect). |
| [`integrations/slack/manifest.ts`](../../../integrations/slack/manifest.ts) | `refreshable: true`. Legacy rows (no expiry stored) never match the sweep's due query and behave exactly as before. |
| [`services/integrations/slackHealthCheck.ts`](../../../services/integrations/slackHealthCheck.ts) | Rotation-aware guard: an auth-failed access token on a row that STORES a refresh token attempts `refreshWithClaim` instead of marking (marking would remove the row from the sweep's `needs_reconnect_at IS NULL` selection and strand a recoverable connection). `missing_scope` still marks (refresh can't re-consent). Legacy rows unchanged. |
| `services/integrations/tokenRefreshSweep.ts`, `docs/rules/oauth-dispatcher.md` | Comment/doc truth updates (Slack no longer the canonical non-refreshable example). |

End-to-end after this slice (rotation-enabled app): connect stores expiry + refresh
token → the 10-minute refresh cron refreshes 30 min before each 12 h expiry via the
cross-instance claim (single-use rotating token safe) → the connection stays healthy
indefinitely. Reconnect is demanded only when the GRANT is genuinely dead
(revoke/uninstall) or scopes changed.

## 4. Threat / no-leak note

- **Sensitive surface:** OAuth access + refresh tokens (workspace-wide bot grant).
- **Storage:** both tokens AES-256-GCM encrypted via `core/encryption/tokens` before
  leaving the module — same path every other rotating provider uses (`updateTokens` /
  `upsertActive` unchanged).
- **No new exposure:** thrown errors carry only an HTTP status or Slack's logical
  error code — never the refresh token, response body, scopes, or team identity
  (asserted by a no-leak test). Health-check logs stay event + integration id +
  non-secret code. Aggregate cron results remain numeric counts only.
- **What did NOT change:** no route/DTO/RLS/GRANT changes; no migration; Slack stays
  an account-shared provider (claim key unpinned, `connectedByUserId: null`);
  reconnect notification stays one-shot via the conditional `markNeedsReconnect`
  UPDATE; no co-member credential fallback introduced.

## 5. Residual gaps (accepted, documented)

- Slack action handlers and option resolvers still call wrappers with the stored
  token directly (no reactive `refreshAndRetry`). With the 10-minute sweep against a
  12-hour token this window is only reachable after >30 min of cron outage; a picker
  hitting it marks reconnect, and the next health-check tick (≤6 h) self-heals via
  refresh (the dispatcher clears the mark on success). Wiring Slack's ~60 call sites
  through `refreshAndRetry` is deliberately out of scope for this slice.
- `ENABLE_INTEGRATION_HEALTH_CHECK` remains default-OFF and prod-controlled; the fix
  does not depend on it (the sweep alone keeps rotation rows alive).
- **One final reconnect is required after deploy** for a currently-live Slack
  connection: the stored row has no refresh token, so its current access token will
  die once more; the reconnect after that persists rotation fields and ends the loop.

## 6. Verification

Recorded in the slice report (typecheck, lint, focused Jest suites: slack oauth /
callback / manifest / health check / token sweep / errors / integrationsRefresh).
