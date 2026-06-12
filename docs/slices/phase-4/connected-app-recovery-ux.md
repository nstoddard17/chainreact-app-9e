# Connected App Recovery UX — Reconnect + auth-error clarity

**Type:** Slice closeout (UX/recovery). **Date:** 2026-06-11. **Scope:** Reconnect +
option-source auth-error clarity only. **Disconnect is explicitly deferred — see below.**

## Why

A connected app with a broken/expired/revoked token had **no discoverable recovery path**:
the Apps page showed no Reconnect or Disconnect on connected cards, and the only way to
refresh a token was the non-obvious "Connect another → choose the same workspace" trick
(which `upsertActive` turns into an in-place token refresh). The Slack channel picker
surfaced only a generic "Couldn't load Slack channels. Try again." with no reconnect cue.
(Triggering incident: prod Slack channel loading broke on a rejected token →
[`v2-go-live-status.md`](./v2-go-live-status.md) closeout.)

## OAuth/session sanity check (pre-implementation audit)

The localhost "signed in as a different user after Slack re-OAuth" observation was audited
against the connect/callback flow and judged a **local/dev-origin artifact, not a
production auth bug**:
- The signed OAuth **state** binds `{userId, accountId}` resolved at connect time
  ([`services/oauth/dispatcher.ts`](../../../services/oauth/dispatcher.ts) `connect`).
- The callback's integration write is bound to that **signed state**
  (`handleCallback` → `upsertActive({accountId: payload.accountId, connectedByUserId: payload.userId})`),
  and **never reads the browser session**. The callback **never sets/changes the ChainReact
  auth session** ([`app/api/integrations/oauth/[provider]/callback/route.ts`](../../../app/api/integrations/oauth/%5Bprovider%5D/callback/route.ts)).
- `redirect_uri` derives from `NEXT_PUBLIC_APP_URL`
  ([`integrations/slack/oauth.ts`](../../../integrations/slack/oauth.ts) `getRedirectUrl`),
  so a localhost-initiated flow (whose allow-listed redirect points at production)
  round-trips through the provider to the **production** callback and lands the browser on
  production `/apps`, showing whatever production session pre-existed there.
- In pure production (one origin, one session) connect-time user == signed-state user ==
  post-redirect visible user. No mismatch; no wrong-account write even in the dev case.

## What shipped

- **Reconnect on connected app cards** — [`features/apps/AppCard.tsx`](../../../features/apps/AppCard.tsx)
  renders a visible outline **Reconnect** button when `isConnected && canConnect`, reusing
  the existing `startOAuth` flow ([`features/integrations/ConnectButton.tsx`](../../../features/integrations/ConnectButton.tsx),
  now with `variant` + `testId`). Re-authorizing the same workspace refreshes the existing
  row via `upsertActive`. **"Connect another"** is unchanged (expanded view, only where
  `supportsMultipleAccounts`) and now reads as distinct from Reconnect.
- **Typed reauth error class** — new closed-enum code **`PROVIDER_REAUTH_REQUIRED`**
  ([`services/options/types.ts`](../../../services/options/types.ts) +
  [`lib/api/options.ts`](../../../lib/api/options.ts) mirror). The Slack channels resolver
  classifies auth/scope/token-class Slack errors (`invalid_auth`, `token_revoked`,
  `token_expired`, `account_inactive`, `missing_scope`, …) via `isSlackAuthError`
  ([`integrations/slack/api/errors.ts`](../../../integrations/slack/api/errors.ts)) and
  maps them to `PROVIDER_REAUTH_REQUIRED` with reconnect-oriented copy; non-auth failures
  (e.g. `ratelimited`) stay `PROVIDER_ERROR` with the generic retry copy.
- **Reconnect-oriented picker UX** — the combobox renders a distinct `needs-reconnect`
  state with copy + an **"Reconnect … in Apps"** link to `/apps`
  ([`useOptionsSource.ts`](../../../features/workflow-builder/hooks/useOptionsSource.ts) +
  [`ComboboxField.tsx`](../../../features/workflow-builder/config-modal/fields/ComboboxField.tsx)).
  It links to Apps rather than starting OAuth inline so the builder's unsaved edits aren't
  lost to a full-page redirect.
- **Observability (no leak)** — the resolver logs sanitized `{slackErrorClass, slackErrorCode}`
  server-side; the raw code is never in the thrown message or client body, and the bot
  token is never logged. The MCP `diagnose_option_source` tool gained a
  `PROVIDER_REAUTH_REQUIRED` diagnosis entry (drift test stays green).

## No-leak guarantees (tested)

No raw provider error body, token (`xoxb…`), or OAuth state reaches the UI; the client gets
only the typed code + sanitized copy. Tests assert the resolver message excludes the raw
Slack code/token, the picker shows reconnect copy (not the code) and a generic failure keeps
generic copy. Suites: `slack/options/channels`, `lib/api/options`, `apps/AppCard`,
`integrations/ConnectButton`, `workflow-builder/hooks/useOptionsSource`,
`config-modal/fields/ComboboxField`, `mcp/diagnose-tools`.

## Deferred: Disconnect (NOT built here)

Disconnect needs a real backend/API design and is intentionally out of this slice:
- **No API route exists** under `app/api/integrations/`; `markDisconnected()`
  ([`repositories/integrations.ts`](../../../repositories/integrations.ts)) is repo-only
  dead code with no caller.
- Requires: authz (account role + membership gate, service-role-only write), provider-side
  **token revoke** behavior (per-provider `revoke()` exists for purge but not wired to a
  user-facing disconnect), handling of **affected workflows/runs** (steps that depend on the
  credential), lifecycle/health-state transitions, and no-leak + RLS/GRANT review for the
  new route. Design it as its own security-reviewed slice.

## Verification

`npm run typecheck`, `npm run lint`, `npm run lint:structure`, `npm run build`, and the
touched unit/component/option-source suites — all green (see slice report). Local commit
only; nothing pushed/deployed; no `db:push`/migrations.
