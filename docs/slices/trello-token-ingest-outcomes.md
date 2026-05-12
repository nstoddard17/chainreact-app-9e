# Trello + token-ingest auth — outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Predecessors:**
- [`docs/slices/slice-17-trello.md`](slice-17-trello.md) — initial audit + DEFER recommendation.
- [`docs/slices/trello-token-ingest-contract-plan.md`](trello-token-ingest-contract-plan.md) — contract design plan.

**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:**
- Contract: [`contracts/integration.ts`](../../contracts/integration.ts) — `AuthFlowSchema`, `ProviderTokenIngestAuth`, `TokenIngestVerificationError`.
- Dispatcher plumbing: [`services/oauth/dispatcher.ts`](../../services/oauth/dispatcher.ts) — `handleTokenIngest`, `TOKEN_INGEST_BY_PROVIDER`.
- Server route: [`app/api/integrations/oauth/[provider]/ingest/route.ts`](../../app/api/integrations/oauth/%5Bprovider%5D/ingest/route.ts).
- Client page: [`app/integrations/token-ingest/[provider]/page.tsx`](../../app/integrations/token-ingest/%5Bprovider%5D/page.tsx).
- Trello provider: [`integrations/trello/`](../../integrations/trello/).
- E2e: [`tests/e2e/slice-17-trello-walkthrough.spec.ts`](../../tests/e2e/slice-17-trello-walkthrough.spec.ts), [`tests/e2e/helpers/mockTrelloServer.ts`](../../tests/e2e/helpers/mockTrelloServer.ts).

**Local commits:**
- `659893726` — `docs: plan Trello token-ingest auth contract`
- `3fe031b3d` — `feat(auth): add token-ingest provider contract`
- `b4822f40c` — `feat(trello): manifest and token-ingest auth`
- `06591b90c` — `feat(trello): add API wrappers and core actions`
- `82304e038` — `feat(trello): add webhook lifecycle and receiver`
- `d7629ddda` — `test(e2e): add Trello walkthrough with mocked Trello boundary`

Trello is V2's **17th provider** and **first non-OAuth-code-callback provider** — the token-ingest contract was introduced to make Trello fit V2's architecture without compromising dispatcher canonicality.

---

## 1. Why token-ingest exists

V2's pre-Slice-17 auth surface was a single `ProviderOAuth` contract assuming an OAuth 2.0 code/state callback. Every existing V2 provider (Slack, Gmail, Google×3, Microsoft×5, Notion, Airtable, Stripe, Shopify, HubSpot, Mailchimp, GitHub) fit that contract because they all use code/state.

**Trello does not.** Trello's "client authorization" flow returns the per-user token in the **URL fragment** (`#token=…`) of the `return_url`. Fragments don't transit a server callback — the browser strips them before sending the GET. The token never reaches V2's server until a separate client-side hand-off lifts it from `window.location.hash` and POSTs it back.

This is structurally identical to V1's `/apps/trello-auth.html` shortcut, but V1 ran the POST against a direct DB-writing endpoint that bypassed the OAuth state primitives entirely. V2's design contract is "every persistence path flows through the dispatcher" — that left two choices:

1. **Hack Trello onto `ProviderOAuth`** by stuffing a token-ingest hop into `handleCallback`. Forfeits the contract's clarity; couples Trello-specific transport into the OAuth interface every other provider shares.
2. **Add a parallel contract** that the dispatcher can route to via a manifest discriminator. Keeps `ProviderOAuth` clean; isolates the new wire shape behind its own type.

Slice 17 picked (2). **Trello is the inaugural production consumer.**

---

## 2. Token-ingest flow

End-to-end (server perspective):

```
[user] clicks Connect Trello
   → POST /api/integrations/oauth/trello/connect
   → dispatcher.connect():
       - reads manifest (authFlow === "token_ingest")
       - createState() → JWT + oauth_states row (single-use nonce)
       - returns provider authorize URL embedding state in return_url
   ← { redirectUrl }

[browser] navigates to redirectUrl (provider's authorize page)
   ← user grants
   ← provider 302s to ${return_url}#token=<user-token>
       (browsers preserve fragments through 302 redirects)

[browser] lands on /integrations/token-ingest/<provider>?state=…#token=…
   → V2 client page (use client):
       - parses fragment from window.location.hash
       - history.replaceState strips fragment from URL bar
       - reads state from window.location.search
       - fetch POST /api/integrations/oauth/<provider>/ingest
            credentials: include
            body: { state, token }

[server] /api/integrations/oauth/[provider]/ingest:
   - auth.getUser() — session-authenticated
   - dispatcher.handleTokenIngest({ userId, provider, state, token }):
       - consumeState(state) — atomic JWT verify + DB delete-if-fresh
       - cross-check JWT.provider === route.provider
       - cross-check JWT.userId === session.userId   (stricter than OAuth callback)
       - provider.verifyAndIngestToken({ token, state }):
           - calls provider API (e.g. Trello GET /1/members/me)
           - 401/403 → throw TokenIngestVerificationError
           - on success: encryptToken(plaintext) → returns { tokens, account }
       - upsertActive(...) — same repo path OAuth uses
   ← 200 { redirect: "/?integration=connected&provider=<provider>" }
   ← client page navigates
```

The state row is consumed **before** the verify call. A failed verify cannot leave a replayable state behind. Same precedence the OAuth callback already used.

---

## 3. Security rules

Pinned by tests in [`tests/unit/services/oauth/dispatcher-token-ingest.test.ts`](../../tests/unit/services/oauth/dispatcher-token-ingest.test.ts), [`tests/unit/services/oauth/dispatcher-token-ingest-trello.test.ts`](../../tests/unit/services/oauth/dispatcher-token-ingest-trello.test.ts), and [`tests/unit/app/api/integrations/oauth/ingest-route.test.ts`](../../tests/unit/app/api/integrations/oauth/ingest-route.test.ts), plus the e2e walkthrough.

| # | Rule | Mechanism |
|---|---|---|
| 1 | No dispatcher bypass | `handleTokenIngest` is the only path to `upsertActive` for token-ingest providers. No direct DB writes from routes. |
| 2 | Single-use state | Existing atomic `DELETE … RETURNING` on `oauth_states.nonce` in `consumeByNonce`. |
| 3 | State consumed BEFORE verify | Order is encoded in `handleTokenIngest`. A failed verify leaves no replayable row. |
| 4 | Session user must match state user | `payload.userId !== input.userId` throws `InvalidStateError("session/state user mismatch")`. Stricter than OAuth callback because both server hops share a browser session. |
| 5 | Token never in response bodies | Route returns `{ redirect }` on success; `{ error: <reason> }` on failure. No path echoes the token. Test pins the assertion. |
| 6 | Token never in thrown errors / logs | `TokenIngestVerificationError.message` is `\`Token ingest verification failed for '${provider}': ${reason}\`` — reason strings never include the token. Per-provider `verifyAndIngestToken` is contractually forbidden from logging the token. |
| 7 | Token verified server-side BEFORE persistence | `verifyAndIngestToken` MUST call a provider API endpoint that proves the token; missing this is a contract violation. |
| 8 | Token encrypted via `encryptToken()` | `verifyAndIngestToken` calls `core/encryption/tokens.ts:encryptToken` before returning. Repository layer never sees plaintext. |
| 9 | Client page strips fragment | `history.replaceState(null, "", pathname + search)` runs in `useEffect` BEFORE the network call. Token leaves the URL bar before any UI render finishes. |
| 10 | Fail-closed on missing/expired/invalid state | `InvalidStateError` → 400 generic `"invalid state"` response (no detail leak). |
| 11 | Fail-closed on missing/empty token | 400 at the route's body-validation layer; verifier never reached. |
| 12 | Token-ingest providers cannot have refresh tokens | `superRefine` on `ProviderManifestSchema`: `authFlow === "token_ingest" && refreshable` → schema rejects. |

---

## 4. Trello provider decisions

Captured in [`integrations/trello/manifest.ts`](../../integrations/trello/manifest.ts) and [`integrations/trello/auth.ts`](../../integrations/trello/auth.ts):

| Decision | Value | Rationale |
|---|---|---|
| `authFlow` | `"token_ingest"` | Trello's fragment-redirect flow. |
| `refreshable` | `false` | Trello tokens (with `expiration=never`) don't refresh. Pinned by the schema invariant in §3 #12. |
| `tokenScope` | `"user"` | One Trello integration per (V2 user, Trello member). |
| `accountIdField` | Trello **member id** (immutable opaque string from `GET /1/members/me`'s `.id`) | More durable than `username` — Trello allows username changes. |
| `accountId` passed to action handlers' `refreshAndRetry` | **`null`** — NOT `triggerEvent.accountId` | `TriggerEvent.accountId` carries the **board id** (event scope, useful for variable resolution). It is NOT the integration discriminator. With `tokenScope: "user"` and `accountId: null`, `getActiveForExecution` returns the first active Trello row for the user. **Bug fixed in Commit 6 — see §7.** |
| `apiVersion` | `"1"` | Trello's REST API uses `/1/` path versioning; no per-quarter version pin. |
| `healthCheckIntervalMs` | 4h | "Developer tier" cadence — mid-band between Google/Microsoft (6h) and other (12h). |
| Scopes | `["read", "write", "account"]` (all required) | Trello's coarse scope set. Granted at authorize time via comma-separated `scope` param. |
| Token storage | `access_token_encrypted` (AES-256-GCM); `refresh_token_encrypted = null`; `access_token_expires_at = null` | Mirrors GitHub / Notion / Slack non-refreshable pattern. |
| Scopes echoed on row | `[]` | Trello's authorize response does NOT echo per-flow scopes; manifest documents them but the row stores empty. |
| Token verification endpoint | `GET /1/members/me?key=…&token=…&fields=id,username,fullName,initials,avatarUrl,url` | Trello's canonical "is this token valid + who is it" probe. |
| Account metadata persisted | `username`, `fullName`, `initials`, `avatarUrl`, `url`, `appKey` | All from `/1/members/me`. `appKey` (the global `TRELLO_CLIENT_ID`) is copied for downstream action wrappers that need `?key=…&token=…` URL-param auth — saves an env lookup per request. |
| Revoke | `DELETE /1/tokens/{token}?key=…` | Best-effort; 404 swallowed (already revoked). |

---

## 5. Webhook rules

Documented in [`integrations/trello/triggers/_shared/`](../../integrations/trello/triggers/_shared/), [`integrations/_shared/trello/webhooks/signature.ts`](../../integrations/_shared/trello/webhooks/signature.ts), and [`app/api/webhooks/trello/route.ts`](../../app/api/webhooks/trello/route.ts).

| Rule | Mechanism |
|---|---|
| Per-(workflow, node) webhooks | Activation creates ONE Trello webhook per trigger node, NOT per user-visible board. Closes V1's bulk-board registration gap (V1 webhooked every board the user could see on connect). |
| Webhook id stored | `trigger_resources.config.webhookId` — used by deactivation. V1 discarded the id, making cleanup impossible. |
| `callbackURL` stored | `trigger_resources.config.callbackURL` — Trello's HMAC over `(rawBody + callbackURL)` REQUIRES the receive route to verify against the EXACT same URL string. Reconstructing it from request URL alone is fragile across host rewrites. |
| Signature verification is mandatory | `_shared/trello/webhooks/signature.ts` returns typed result `{ valid: true } | { valid: false; reason: "missing_secret" | "missing_header" | "malformed" | "mismatch" }`. Receive route maps `missing_secret` → 503 (server misconfig); everything else → 401. |
| No V1 no-op verifier | V1's `verification.ts:35-38` returned `true` unconditionally for Trello. V2 closes this gap at the route. |
| HMAC algorithm | HMAC-SHA1 over `${rawBody}${callbackURL}` keyed with `TRELLO_CLIENT_SECRET` (the OAuth app secret, NOT the user token), base64-compared via `crypto.timingSafeEqual`. |
| Length-mismatch guard before `timingSafeEqual` | Required because `timingSafeEqual` throws on different-length buffers. |
| Webhook lifecycle uses user's token via URL-param auth | `POST /1/webhooks?key=…&token=…` and `DELETE /1/webhooks/{id}?key=…&token=…`. Trello accepts NO Bearer auth — wire contract is URL-param. |
| 404 on deactivation is swallowed | Webhook already deleted server-side (manual cleanup, OAuth revoke). |
| `Unauthorized401Error` on deactivation is swallowed | Token revoked — subsequent calls would all 401; bail early. |
| HEAD `/api/webhooks/trello` returns 200 with no body | Trello's webhook-registration probe — the URL MUST respond 200 for the webhook to be accepted. |
| No `type: "subscription-watch"` marker | Trello webhooks don't expire. `runRenewals` cron filters on the marker — its absence keeps Trello rows out of renewal cycles. |

---

## 6. Event naming rule (durable across all providers)

**Captured in this commit as a CLAUDE.md gotcha.** This was a real bug — Commit 5's normalizer set `TriggerEvent.eventType` to the namespaced form (`"trello.card.created"`) but `trigger_resources.event_type` is the V2 short form (`"new_card"`, from `registerActivation("trello", "new_card", …)`). `dispatchTriggerEvent.listForDispatch(provider, eventType)` then matched zero rows → workflow_runs were never created.

**Rule:**

> `TriggerEvent.eventType` MUST match the short form stored in `trigger_resources.event_type` — the same string passed to `registerActivation(provider, eventType, …)`. The provider's classified / namespaced form (e.g. `"trello.card.created"`) belongs in `payload.classifiedType` for advanced workflow refs, NOT in the canonical `eventType` field that drives dispatch lookup.

Applies to **every provider that ships a webhook trigger**. Shopify's `webhook_received`, Stripe's `event_received`, Mailchimp's `audience_event`, GitHub's `new_commit`, Trello's `new_card` / `card_updated` / `card_moved` / `comment_added` / `member_changed` / `card_archived` — all canonical eventTypes match the V2 short form. Provider-specific subtypes ride on `payload`.

Trello's normalizer now takes two inputs:
- `triggerEventType: TrelloTriggerEventName` → emitted as `TriggerEvent.eventType`.
- `classifiedType: TrelloEventType` → emitted on `payload.classifiedType`.

The classifier (`classifyTrelloAction`) returns the namespaced form; the receive helper translates it to the trigger-row's stored eventType via `TRIGGER_EVENT_TO_NORMALIZED` before normalizing.

---

## 7. E2e validation

[`tests/e2e/slice-17-trello-walkthrough.spec.ts`](../../tests/e2e/slice-17-trello-walkthrough.spec.ts) (517 lines) drives the full real-V2-internals path against a mocked Trello boundary ([`tests/e2e/helpers/mockTrelloServer.ts`](../../tests/e2e/helpers/mockTrelloServer.ts), 828 lines).

**Surfaces exercised on the live dev server:**
- `POST /connect` → authorize URL with `state` in `return_url`
- Real Chromium navigation through the 302-with-fragment redirect to the V2 client ingest page
- Client page's `useEffect`: fragment capture + `history.replaceState` scrub + ingest POST
- `dispatcher.handleTokenIngest`: `consumeState` + provider/user cross-check + `verifyAndIngestToken` (Trello `GET /1/members/me`) + `upsertActive`
- Encrypted-at-rest assertion (`access_token_encrypted !== plaintext`)
- Workflow create + draft definition patch + UI activation
- Per-board webhook registration via `POST /1/webhooks`
- Trigger row config persistence (`webhookId`, `boardId`, `eventType`, `callbackURL`, no `subscription-watch`)
- Invalid-signature event → 401, no run, no action
- Board-mismatch event → 200 ack, no run, no action
- Unsupported action type → 200 ack, no run, no action
- Signed `createCard` event → succeeded workflow run → mock receives `POST /1/cards` with URL-param auth and **decrypted** token
- Dedup row written via Trello action id
- Replay (same signed body) → no duplicate run, no duplicate action call

**Two structural bugs caught by the e2e** that unit tests didn't surface — both fixed in Commit 6:

1. **`TriggerEvent.eventType` namespacing mismatch** — see §6 above. Unit tests passed because they tested the normalizer in isolation against a fabricated eventType. The e2e was the first test that actually drove `dispatchTriggerEvent` through the real `(provider, eventType)` lookup against a real `trigger_resources` row.

2. **Trello action handlers used `triggerEvent.accountId` as integration discriminator** — but `accountId` in normalized form was the board id (event scope), not the Trello member id (integration account). `getActiveForExecution(userId, "trello", boardId)` matched zero rows → action handler returned "no active integration." Unit tests didn't catch this because they mocked `getActiveForExecution` directly (so the discriminator was a stub, never compared to a real row). **Fix:** all 8 Trello action handlers pass `accountId: null` — correct because Trello is `tokenScope: "user"` (one row per user; no multi-account discriminator needed).

**Two-run stability:** spec passes twice consecutively at ~28-30s each. No flakes.

---

## 8. Future token-ingest candidates

Trello is V2's **first** token-ingest production consumer. The contract is intentionally generic enough for future API-key + per-user-token providers, but adoption is gated:

**Required audit before adding a second token-ingest provider:**

1. Does the provider's auth flow return the token in a URL fragment, or via some other browser-only transport?
2. Does the provider expose a server-side endpoint that proves the token's validity AND returns durable account info (analogous to Trello's `/1/members/me`)?
3. Are the tokens non-refreshable? (token-ingest providers cannot be refreshable per §3 #12 — schema enforces.)
4. Is `tokenScope` `"user"` or `"workspace"`? Both work; the action-handler `accountId` rule (§4) needs revisiting if the answer is `"workspace"`.
5. Does the provider sign webhooks? If so, what's the canonical signing string (rawBody alone, rawBody+url, with timestamp, etc.)?
6. Is the webhook lifecycle per-workflow-node OR shared at the app level? Per-(workflow, node) is the cleaner default.

**Plausible candidates (per Slice 17 audit), STILL requiring their own audit before adoption:**

- **Atlassian "API token" providers** (some Jira surfaces) — similar shape: user-pasted token (no redirect), validated against a `GET /myself` endpoint. Would require a "paste token" UI variant of the client ingest page rather than the fragment-redirect path. Adoption needs UI design.
- **Asana PAT** — Personal Access Token model. Same UI variant as Atlassian. Trello's contract handles the server side; only the client page differs.
- **Square OAuth-without-refresh** — some Square endpoints issue non-refreshable tokens via a URL-fragment-style flow. Would need a per-flow audit.

**NOT candidates:**
- Any provider with a working OAuth 2.0 code/state flow → use `ProviderOAuth`. Don't reach for `ProviderTokenIngestAuth` to "future-proof" a provider that doesn't need it.
- Any provider with refresh tokens → token-ingest is explicitly non-refreshable.
- Any provider whose tokens are workspace-scoped AND need disambiguation against multiple active rows for the same user → action-handler `accountId: null` rule (§4) breaks down; revisit before shipping.

---

## 9. Stop-and-report rules satisfied

- ✅ No new DB migrations across all 6 commits.
- ✅ No dispatcher bypass — every persistence path flows through `repositories/integrations.upsertActive`.
- ✅ No edits to other providers' manifests (`authFlow` defaults to `"code_callback"`; existing manifests inherit the default).
- ✅ No OAuth 1.0a — V2 explicitly does not support 1.0a despite Trello's docs offering it as an alternative.
- ✅ No tokens in error messages, structured logs, or HTTP response bodies — pinned by tests.
- ✅ No second concurrent auth flow shape introduced — only `token_ingest` was added.
- ✅ Two e2e-found bugs surfaced + fixed within the same commit (Commit 6) — not deferred.

---

## 10. Local commits (chronological)

1. `659893726` — `docs: plan Trello token-ingest auth contract` (582 lines)
2. `3fe031b3d` — `feat(auth): add token-ingest provider contract` (8 files, 1003 insertions)
3. `b4822f40c` — `feat(trello): manifest and token-ingest auth` (8 files, 685 insertions)
4. `06591b90c` — `feat(trello): add API wrappers and core actions` (39 files, 2857 insertions)
5. `82304e038` — `feat(trello): add webhook lifecycle and receiver` (24 files, 2336 insertions)
6. `d7629ddda` — `test(e2e): add Trello walkthrough with mocked Trello boundary` (17 files, 1544 insertions)

Total Trello scope: **~9000 lines added across 6 commits**, all green on `v2-provider-port-local`. Not pushed.
