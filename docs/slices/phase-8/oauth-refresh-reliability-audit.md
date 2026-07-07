# OAuth Token Refresh Reliability — Audit + Repair (Phase 8)

Date: 2026-07-07. Scope: why connected apps repeatedly show "Reconnect needed"
on the Apps page, and what makes refreshable providers stay silently refreshed
so users never re-auth unless the provider truly revoked access.

## Executive summary

Go. Two structural root causes are confirmed from code (not guesses):

1. **There is no proactive token-refresh cron.** `vercel.json` schedules nine
   crons; none refreshes OAuth tokens. `access_token_expires_at` is read by
   exactly one consumer (`services/integrations/connectionDiagnosis.ts`, a
   diagnostics DTO). Every refresh in the product happens reactively, at the
   moment a provider call returns 401.
2. **The refresh single-flight lock is in-process only.**
   `services/oauth/refreshLock.ts` documents the deferral explicitly ("for
   single-process dev / single-instance prod, this is sufficient"). Production
   runs on Vercel serverless: concurrent 401s handled on different instances
   each call the provider's refresh endpoint. For providers with SINGLE-USE
   ROTATING refresh tokens (Airtable, Calendly, Typeform; Microsoft also
   rotates) a lost race either kills the grant server-side (`invalid_grant`)
   or lets a stale loser overwrite the winner's rotated refresh token in
   `updateTokens` (last-write-wins). Either way the stored refresh token is
   dead, the next refresh throws `RefreshAuthRequiredError`, the dispatcher
   marks `needs_reconnect_at`, and the Apps page shows "Reconnect needed" —
   the exact reported symptom, recurring every time it happens again.

Because there is no proactive refresh, EVERY access token is expired at rest
after idle (Google/Microsoft/Asana/Monday ≈ 1 h, Calendly 2 h, HubSpot ≈ 6 h),
so every burst of activity after idle begins with simultaneous 401s across
instances — maximizing the collision window that (2) leaves open.

## What is strong (do not regress)

- **Reactive refresh adoption is comprehensive.** Actions, option resolvers
  (e.g. `integrations/google-calendar/options/calendars.ts`), trigger polling
  (`integrations/gmail/triggers/*/poll.ts`) and watch renewals
  (`integrations/google-calendar/triggers/eventChanged/renew.ts`) all wrap
  their principal calls in `services/oauth/refreshAndRetry.ts` (Q3).
- **Persistence never nulls a refresh token on refresh.** Provider modules own
  the preserve-old policy: `integrations/_shared/google/oauth.ts:259-263`
  re-encrypts the input refresh token when the response omits one; Microsoft
  and every preserve-old provider do the same. The only path that nulls
  `refresh_token_encrypted` is the intentional disconnect
  (`repositories/integrations.ts:disconnectByIdServiceRole`).
- **Offline access is requested correctly.** Google: `access_type=offline` +
  `prompt=consent`, fail-loud if the callback response lacks a refresh token.
  Microsoft: `offline_access` scope, same fail-loud check. Dropbox:
  `token_access_type=offline`. Typeform: `offline` scope.
- **Expiry units are correct.** All providers compute
  `Math.floor(Date.now()/1000) + expires_in` (epoch seconds) and the
  repository converts to timestamptz via `expiresAtIso`.
- **`invalid_grant` classification exists.** RFC 6749 §5.2 auth-dead codes map
  to `RefreshAuthRequiredError`; `dispatcher.refresh` marks
  `needs_reconnect_at` one-shot + notifies once (V2-READY-32), and transient
  refresh errors deliberately do NOT mark (CS-APPS-RECOVERY-1).
- **An expired access token alone never forces reconnect.** Nothing marks on
  expiry; the Apps page chip is driven only by `needs_reconnect_at`.

## Failure-mode checklist findings

| Hypothesis | Verdict |
|---|---|
| Cron not scheduled | **CONFIRMED — the refresh cron does not exist** (no route, no vercel.json entry) |
| Cron route auth failing | n/a (no route); `services/cron/auth.ts` pattern is sound (timing-safe Bearer CRON_SECRET) |
| Cron query not finding rows | n/a — no selection query existed; `listRefreshDueServiceRole` added by this slice |
| Expiry stored wrong units/timezone | Not found — epoch-seconds → timestamptz everywhere |
| refresh_token overwritten with null | Not found on refresh/callback paths; only intentional disconnect nulls it |
| Google missing offline access / prompt=consent | Not found — both present, fail-loud check |
| Microsoft rotation not persisted atomically | Rotation IS persisted (single UPDATE), but **cross-instance races can overwrite a newer rotated token** (root cause 2); a crash between provider call and DB write remains an unavoidable small window |
| Manifest refreshable but module throws RefreshNotSupported | Not found (Notion is honestly `refreshable:false`) |
| Actions/resolvers bypass refreshAndRetry | Not found — sweep of actions/options/triggers shows adoption |
| Health check marks disconnected on expired token | Not found — `check-slack-health` probes only Slack (non-refreshable) and marks only confirmed auth errors; it is flag-gated (`ENABLE_INTEGRATION_HEALTH_CHECK`, default OFF) |
| Account discriminator mismatch | Not found — `(account_id, provider, provider_account_id)` unique-active index; refresh pins the exact row |
| UI reconnect when backend could refresh | Partially — the Apps page has no "refresh" action at all; the chip honestly reflects `needs_reconnect_at`. The fix is backend (keep tokens fresh + stop wrong marks), not UI |
| Cron logging hides failures | n/a; new cron returns counts + structured logs, and heartbeats feed `evaluate-ops-alerts` |

**Not verifiable from the repo (manual checks for Marcus):**

- Google Cloud OAuth app **publishing status**. If the app is in "Testing",
  Google expires refresh tokens after 7 days — that alone reproduces weekly
  Google reconnects and no code can fix it. Verify the consent screen is
  "In production".
- `CRON_SECRET` must be set in the Vercel project (other crons imply it is).
- Production logs for `RefreshAuthRequiredError` frequency per provider would
  confirm which of the two mechanisms dominates; not available locally.

## Provider refresh catalog (from code)

Refreshable (16): airtable (rotating, enforced), asana (preserve-old),
calendly (rotating, enforced), discord (rotating), dropbox (preserve-old,
offline short-lived tokens), gmail + google-analytics/calendar/docs/drive/
sheets (shared `_shared/google/oauth.ts`, preserve-old), hubspot
(preserve-old), microsoft-excel/onedrive/onenote/outlook/outlook-calendar/
teams (shared `_shared/microsoft/oauth.ts`, preserve-old with rotation
persisted when returned), monday (preserve-old), stripe (preserve-old; access
tokens typically non-expiring so rarely due), typeform (rotating, enforced).

Non-refreshable by design (honest `refreshable:false`): slack (default v2, no
rotation enabled), notion, github (OAuth app tokens non-expiring), facebook
(60-day long-lived user token, no refresh grant), mailchimp (non-expiring),
shopify (offline token, non-expiring), trello (token-ingest,
`expiration=never`). These must never appear as "needs refresh"; the sweep
counts them `skippedNonRefreshable` and never marks them.

Rows with `access_token_expires_at IS NULL` are never due (nothing to refresh
ahead of); the reactive path remains their safety net.

## The fix (this slice)

1. **Proactive refresh cron** `/api/cron/refresh-oauth-tokens` (every 10 min,
   `vercel.json` + `MONITORED_CRONS` heartbeat entry).
   `services/integrations/tokenRefreshSweep.ts` selects active rows
   (`disconnected_at IS NULL`, `needs_reconnect_at IS NULL`) whose
   `access_token_expires_at` is within 30 minutes or already past, classifies
   per manifest (`refreshable` flag from `integrations/_registry.ts` — no
   SQL re-encoding of provider classification), and refreshes through the
   same dispatcher path the reactive flow uses. Outcomes: `refreshed`,
   `skippedNonRefreshable`, `skippedNoRefreshToken`, `actionRequired`
   (invalid_grant → dispatcher already marked + notified once),
   `skippedFrozen`, `failed` (transient; retried next tick; tokens untouched).
   Response and logs are aggregate counts + provider/error-category only —
   never ids-with-tokens, never token material.
2. **Cross-instance refresh claim** — migration adds `refresh_claim_id uuid`
   + `refresh_claimed_at timestamptz` to `integrations`. New
   `services/oauth/refreshWithClaim.ts` claims the row (conditional UPDATE,
   60 s TTL steal) before the provider refresh and releases after; a loser
   waits briefly and reuses the winner's persisted token instead of calling
   the provider. `refreshAndRetry` and the sweep both route through it, and
   they are the only two refresh entry points (verified: `refreshAndRetry.ts`
   is the sole importer of dispatcher `refresh`). This closes the
   rotating-token double-refresh kill and the stale-overwrite race.
   Migration is required: cross-instance mutual exclusion has no home in the
   existing schema, and PostgREST cannot hold Postgres advisory locks.
3. **No feature flag.** The cron is live once deployed (Marcus's preference;
   failure modes are conservative — transient errors change nothing).

Deliberately NOT changed: the dispatcher (`services/oauth/dispatcher.ts` has
uncommitted parallel-session QuickBooks work; the claim wrapper at the caller
seam is equivalent), UI copy, health-state machinery, provider modules,
`needs_reconnect_at` semantics.

## Threat / risk note (security-review skill)

Sensitive surface: encrypted access/refresh tokens, service-role writes,
cron endpoint. Mitigations: cron requires timing-safe `CRON_SECRET` Bearer;
response/logs carry numeric counts + provider ids + error categories only
(no integration ids paired with token data, no tokens, no emails); the sweep
reuses existing service-role repository methods with explicit reasons; claim
columns hold only a random UUID + timestamp (no secret material); no new
table → no new RLS/GRANT surface (direct authenticated access to
`integrations` was already revoked in 20260628000000); failed refreshes never
wipe tokens; non-refreshable providers are never marked by the sweep.
What did not change: no co-member fallback added anywhere,
`connected_by_user_id` never rewritten, `upsertActive` semantics untouched,
plaintext tokens still never logged or returned.

## Tests

Unit: `tests/unit/services/integrations/tokenRefreshSweep.test.ts`,
`tests/unit/services/oauth/refreshWithClaim.test.ts`, updated
`tests/unit/services/oauth/refreshAndRetry.test.ts` (mocks the claim wrapper
seam instead of the dispatcher). Integration (gated,
`ALLOW_DB_INTEGRATION_TESTS=true`):
`tests/integration/oauth-refresh/refresh-cron-smoke.test.ts` — real route +
sweep + dispatcher + encryption + repository + dev DB, Google token endpoint
mocked by a local HTTP server via the `GOOGLE_TOKEN_BASE` override; proves an
expired row is refreshed in place (refresh token preserved), and an
`invalid_grant` row is marked `needs_reconnect_at` without token wipe.
