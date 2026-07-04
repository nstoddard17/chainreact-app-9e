# Action smoke env/product unblock report - 2026-07-04

**Type:** Owner-facing unblock report (docs-only, no code changes).
**Date:** 2026-07-04. **Branch:** `v2-main`. **Nothing pushed.**
**Follows:** NOT_RUN burn-down commit `dde4c76f9` (all remaining runnable rows attempted
live and converted to honest durable statuses).
**Source of truth:** `npm run chainreact -- smoke actions --cert` (offline certification
inventory; no DB, no provider calls). Cert seed:
[scripts/chainreact/smoke/certificationSeed.ts](../../../../scripts/chainreact/smoke/certificationSeed.ts).

Purpose: every action that CAN be certified with the current smoke environment HAS been.
The 11 remaining BLOCKED_ENV rows need actions **outside the codebase** (provider portal /
account setup by Marcus). This doc lists exactly what to do, what each unblock yields, and
records the Slack OAuth token-rotation product risk separately.

## 1. Current matrix (newly measured this session)

```
Totals: 303 registered, 222 LIVE_PASS, 1 not-run, 69 missing-fixture,
        11 blocked-env, 0 fail, 0 bug, 0 sandbox-required, 0 unsafe-no-harness.
```

Re-run of `npm run chainreact -- smoke actions --cert` this session matches the
`dde4c76f9` commit message exactly. No drift.

## 2. Intentional remaining NOT_RUN (not a gap)

`native:format_transformer` is the **deliberately uncertified always-run harness
baseline**: it runs live on every sweep to prove the harness path is real, and stays
NOT_RUN by design. Do not "fix" it. This is the only NOT_RUN row.

## 3. BLOCKED_ENV rows and exact owner actions

All 11 rows already have fixtures and independent read-backs ready. Once the environment
is unblocked, each certifies on the next sweep with **zero code work** (except the Slack
unarchive caveat in section 4).

### 3.1 Google Analytics (4 rows)

- Rows: `find_conversion`, `get_realtime_data`, `run_pivot_report`, `run_report`.
- Blocker (probed live during the burn-down): the integration row is ACTIVE, but the
  Admin API `accountSummaries.list` returns **zero GA accounts** for the connected Google
  login. Every GA selector cascade roots at `accountId`, so nothing can auto-discover.
- **Owner action:** grant the connected Google login access to a GA4 property (any
  property with some traffic works), or reconnect Google Analytics with a login that
  already has one.
- **Expected yield:** 4 read certifications. **Code work: none.**

### 3.2 Stripe (4 rows)

- Rows: `find_customer`, `find_payment_intent`, `find_subscription`, `get_payments`.
- Blocker: Stripe is simply not connected on the smoke account.
- **Owner action:** connect a Stripe **TEST-MODE** account on the smoke account.
- **Expected yield:** 4 read certifications immediately. Also unblocks future fixture
  work on the 12 Stripe MISSING_FIXTURE write actions (those need fixtures authored, so
  they are a later batch, not automatic). **Code work: none for the 4 blocked reads.**

### 3.3 Discord (1 row)

- Row: `fetch_messages`.
- Blocker: Discord is not connected on the smoke account.
- **Owner action:** connect Discord on the smoke account with a usable guild/channel the
  bot can read.
- **Expected yield:** 1 read certification. **Code work: none.**

### 3.4 Slack (1 row) - double blocker

- Row: `unarchive_channel`.
- Blocker A (product/API): Slack's `conversations.unarchive` cannot be performed with the
  bot-token model V2 uses; it needs a user token. No amount of env setup fixes this.
- Blocker B (operational): the Slack connection is currently down entirely due to token
  rotation (section 4).
- **Owner action:** decide one of:
  1. Ship Slack **user-token support** in a dedicated OAuth slice (then this row can
     certify), or
  2. Hide/mark `unarchive_channel` as unsupported for bot-only Slack (a small metadata
     slice, then the row leaves the matrix honestly).
- **Expected yield:** 1 certification only under option 1. **Code work: required either
  way** (user-token OAuth slice, or unsupported-action metadata change).

### 3.5 Mailchimp (1 row)

- Row: `create_audience`.
- Blocker: the live create was refused by Mailchimp plan entitlement ("User does not have
  access to the requested operation" on `POST /lists`); the smoke account's plan caps
  audiences and one already exists. Not a handler bug.
- **Owner action:** free an audience slot on the smoke account (delete the existing
  audience is NOT recommended since other certified rows seed into it; prefer a plan that
  allows a second audience, or a separate Mailchimp account with a free slot).
- **Expected yield:** 1 certification. **Code work: none** (the seed row re-runs every
  sweep and certifies as soon as a slot exists).

### 3.6 Yield summary

| Group | Rows | Owner action | Yield | Code needed |
|---|---|---|---|---|
| Google Analytics | 4 | Grant GA4 property access to connected login | 4 | No |
| Stripe | 4 | Connect Stripe test-mode account | 4 | No |
| Discord | 1 | Connect Discord with usable guild/channel | 1 | No |
| Mailchimp | 1 | Free/obtain an audience slot | 1 | No |
| Slack unarchive | 1 | User-token slice OR mark unsupported | 0-1 | Yes |

Pure env unblocks (no code) take the matrix from 222 to **232 LIVE_PASS** and BLOCKED_ENV
from 11 to 1 (the Slack unarchive product gap).

## 4. Slack OAuth token-rotation product risk (separate from the matrix)

Surfaced during the burn-down and verified through the engine path; this is a
**production risk**, not just a smoke-env issue:

- The smoke Slack app now has **token rotation enabled** (an irreversible app-level Slack
  setting).
- V2's Slack OAuth **by design stores no refresh token**; rotation was explicitly out of
  scope in Slice 1, and `refreshToken()` throws `RefreshNotSupportedError`
  ([integrations/slack/oauth.ts](../../../../integrations/slack/oauth.ts)).
- Result: with rotation enabled, every Slack access token expires roughly **12 hours**
  after connect, and all Slack calls then fail with `token_expired`. Verified live: the
  previously certified Slack reads now FAIL through the engine path.
- The existing 30 Slack LIVE_PASS rows were certified **honestly inside a fresh token
  window** (2026-07-03); the certifications stand, but the connection itself is down.
- Related prior audit:
  [v2-ready-27-slack-connection-truth-audit.md](./v2-ready-27-slack-connection-truth-audit.md).

**Owner decision needed (do NOT quick-fix inside a smoke slice):**

1. **Short-term / testing:** reconnect Slack on the smoke account for a temporary ~12h
   window whenever a Slack smoke batch is planned. Cheap, but production Slack workflows
   on this app still break every ~12h.
2. **Real fix:** ship Slack OAuth **token-rotation support** (store refresh token, rotate
   on expiry) as a dedicated, security-reviewed OAuth slice. This is the only durable fix
   while rotation stays enabled on the app; it should go through the security-review
   skill, not be patched ad hoc.

## 5. Recommended next smoke batch if env unblocks are skipped

If Marcus defers the owner actions above, the strongest next certification work is in the
69 MISSING_FIXTURE rows on providers that are **proven connected and healthy**:

1. **monday** (6 missing, 18/24 LIVE_PASS): connected and recently certified; fixtures
   are the only gap.
2. **microsoft-outlook** (7 missing, 4/11 LIVE_PASS): connected; aligns with the accepted
   Outlook Mail parity arc.
3. Smaller finishers: **microsoft-teams** (3), **microsoft-onenote** (2), **google-docs**
   (2), **trello** (2), **microsoft-excel** (1), **notion** (1), **dropbox** (3, mostly
   policy-excluded raw-bytes/signed-URL rows - re-check before authoring).

Avoid: slack (connection down per section 4), stripe/github/shopify/facebook fixture
batches until their connections/entitlements are confirmed on the smoke account.

## 6. Verification baseline

- **Run this session:** `npm run chainreact -- smoke actions --cert` (offline inventory,
  no DB, no provider calls). Output matches section 1 exactly.
- **Not run this session:** jest suites, typecheck, lint, any live provider test. The
  222 LIVE_PASS baseline is inherited from the certification chain through `dde4c76f9`.
- No migrations involved; no feature flags added or changed.
- Known inherited note from `dde4c76f9`: `certificationSeed.ts` has an eslint max-lines
  WARNING (438/400, 0 errors); the per-provider seed split follow-up stands.

## 7. Closeout confirmation

Docs-only. No provider code touched, no live provider calls made, no db:push, no deploy,
nothing pushed. Doc:
`docs/slices/phase-4/readiness/action-smoke-env-unblock-report-2026-07-04.md`.
