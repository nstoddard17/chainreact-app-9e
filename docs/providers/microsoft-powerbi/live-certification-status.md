# Microsoft Power BI — Live Certification Status

**Provider:** microsoft-powerbi
**Status:** owner-accepted close — **auth surface live-certified; actions & triggers
NOT live-certified (blocked by the connected user's missing Power BI license)**
**Environment tested:** local dev (`http://localhost:3000`), shared production Supabase
**Provider boundary:** LIVE for the OAuth/token surface; NOT exercised for actions/triggers
**Commit:** `c28e397f3` (provider) + doc follow-ups — local, **not pushed**
**Push status:** Nothing pushed
**Date:** 2026-07-17

---

## What IS live-certified (real provider boundary)

The full connect flow was driven against the real Microsoft Entra + Power BI boundary
and verified from the database:

| Item | Result | Evidence |
|---|---|---|
| Live OAuth (authorize → consent → callback → token exchange) | ✅ PASS | Connected `…@ChainReact120.onmicrosoft.com`; one active `integrations` row created |
| Identity resolution via OIDC `id_token` (the non-Graph path) | ✅ PASS | `provider_account_id` = the id_token `email` claim; `account_metadata.emailClaim="email"`, Entra object id present |
| Token storage — encrypted at rest | ✅ PASS | `access_token_encrypted` + `refresh_token_encrypted` both present and non-JWT (encrypted, not raw) |
| Refresh credential issued | ✅ PASS | Refresh token stored (`offline_access` honored); access token expiry ~55 min, refresh path wired via `refreshAndRetry` |
| Granted scopes | ✅ PASS | All 9 Power BI resource scopes granted, incl. `Dashboard.Read.All`, `Pipeline.Deploy`, `Capacity.ReadWrite.All` |
| Token audience | ✅ PASS | Access token `aud = https://analysis.windows.net/powerbi/api` (correct Power BI resource) |
| Connection health | ✅ PASS | `disconnected_at` null, `needs_reconnect` false, account-scoped correctly |
| API base + wrapper error mapping | ✅ PASS (indirect) | Live calls reached `api.powerbi.com/v1.0/myorg`; the `UserNotLicensed` 404 surfaced correctly through `refreshAndRetry` → wrapper error path |

## What is NOT live-certified (and why)

**Every provider ACTION (47) and TRIGGER (16) remains NOT live-certified.** They are
honestly marked as blocked — **none were converted to PASS.**

**Blocker:** the connected user has **no Power BI license**. Every Power BI REST call
returns `HTTP 404` with header `x-powerbi-error-info: UserNotLicensed`, so no workspace,
semantic model, report, dataflow, pipeline, gateway, or capacity is reachable. This is a
tenant licensing/provisioning gap, **not a code defect** — the auth surface above proves
the integration itself is sound.

Certification matrix status is unchanged: all 47 actions remain `LIVE_NOT_RUN`
(fixtures registered, env-gated, never run live). Nothing claims a live pass.

## Pending for a full live pass (owner action)

1. **Assign a Power BI Pro (or PPU) license** to the test user — M365 admin center →
   Users → Licenses and apps. A Power BI Pro or Microsoft Fabric **trial** works on the
   dev tenant.
2. **Initialize Power BI** — sign in once at app.powerbi.com and create a workspace
   (`/myorg/groups` is empty until one exists).
3. **Advanced / capacity-gated features** require more than a Pro license:
   - Export-to-file, enhanced refresh, query scale-out, and deployment pipelines need
     the workspace on **Premium / Fabric capacity** (a Fabric trial capacity suffices).
   - Gateway actions need a real **on-premises data gateway** registered in the tenant.
   Whatever the tenant cannot provide will be certified as far as possible and the rest
   recorded as genuinely blocked — never faked.

Because the local env is aligned and the integration is connected, certification can
resume with discovery + action/trigger runs once a license (and ideally a Fabric trial
capacity + smoke workspace) is in place. No re-setup required beyond restarting the
local cert server.

## Local-environment issues found & fixed during certification (dev-only, not code)

1. **Duplicated `NEXT_PUBLIC_APP_URL` in `.env.local`** made the OAuth redirect resolve
   to production intermittently (a duplicate-key quirk; something appends unquoted
   duplicate lines). Deduped during cert; `.env.local` has since been **restored from
   backup** to its original production-pointing state.
2. **HTTP 431 on the callback** — Power BI's 13-scope authorization code plus the
   browser's Supabase session cookies exceeded Node's default 16 KB request-header
   limit, so the callback was rejected before reaching the app. Worked around locally by
   running the dev server with `NODE_OPTIONS=--max-http-header-size=65536`. The cert
   server has been stopped, so this runtime flag is no longer active.

## Preserved follow-up (recommended, non-blocking)

**Surface `UserNotLicensed` (and similar) meaningfully instead of a bare `HTTP 404`.**
Power BI returns the real cause in the `x-powerbi-error-info` response header. The
option-source / action error path currently maps the 404 to a generic not-found; it
could read that header and show, e.g., "Your Power BI account isn't licensed — ask an
admin to assign a Power BI Pro license." Small, high-value UX improvement for any user
who hits this in production. Tracked in `owner-setup-report.md`.

## Deploy-gated follow-up (from the OAuth cert)

The **431** is latent in production too: Power BI's large authorization code plus auth
cookies may exceed the platform's inbound header limit on Vercel. Before/after a
production deploy, verify the production callback tolerates the payload; if it doesn't,
reduce what the callback carries (or raise the platform header limit). Not a local-cert
blocker, but must be checked before Power BI is offered in production.

## Local state after close

- `.env.local` restored from backup (production URL, single `MICROSOFT_CLIENT_ID`);
  backup file removed.
- Local certification dev server stopped (port 3000 free); header-limit flag gone.
- No temp/harness files left behind.
- Nothing pushed; provider commit `c28e397f3` remains local.
