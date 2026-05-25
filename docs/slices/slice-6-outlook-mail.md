# Slice 6 — Microsoft Outlook (mail) provider port

**Branch:** `slice-6-outlook` (off `slice-5-google-sheets` @ `7b3d9e342`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Microsoft Outlook **mail-only** from V1 with one action (`send_email`) and one webhook trigger (`new_email`). Mail rides Microsoft Graph subscriptions on `/me/messages`. Calendar is **not** in this slice — it is Slice 7.

This slice has no separate Batch 2. Commits 1–5 ship together when each commit's gates are green.

---

## Why Outlook (mail) after Sheets

Five Google providers + Slack are live in V2. Outlook mail is the first non-Google, non-Slack provider — the right next step because it stress-tests V2's existing platform machinery in ways Drive watches and Slack HMAC didn't:

1. **Subscription renewal at 3-day cadence.** Drive watches expire at 7d; Microsoft Graph subscriptions on Outlook mail expire at ~3d (`maxExpirationMinutes = 4230` in V1's `subscriptionManager.ts:43`). The same `services/triggers/runRenewals.ts` cron handles both — Outlook proves the renewal threshold is a per-handler property, not a per-provider hardcode.
2. **Validation-token handshake.** Microsoft POSTs `?validationToken=...` to the notification URL when a subscription is created and expects the token echoed back as `text/plain` within 10 seconds. Google's watch APIs don't have this — the webhook route at `app/api/webhooks/microsoft-outlook/route.ts` will be the first to demonstrate the pattern.
3. **`clientState` verification.** Microsoft includes a per-subscription `clientState` (random 32-byte hex) in every notification. The webhook route must verify it matches the value persisted at activation. This is conceptually similar to V2's `_shared/google/channelToken.ts` HMAC, but the value is provider-issued (we generate, store, compare) rather than HMAC-derived.
4. **Azure AD OAuth.** First non-Google OAuth surface in V2 with refresh tokens (Slack tokens don't expire by default). Validates `services/oauth/refreshAndRetry.ts` against a non-Google provider.
5. **Enterprise-mail product axis.** Slack and Gmail cover none of this. Outlook is universal in enterprise — first slice that addresses it.

Foundation for follow-on slices: Slice 7 = Outlook Calendar (reuses Slice 6's OAuth + subscription lifecycle, adds Calendar scopes + a `/me/events` subscription). Slice 8+ Teams, OneDrive, Excel each become smaller because the Graph foundation is in place.

---

## Confirmed scope decisions

1. **Mail only.** Calendar, Contacts, Teams, OneDrive, Excel, OneNote: out of scope. Calendar is explicitly Slice 7. Do NOT include Calendar scopes (`Calendars.Read`, `Calendars.ReadWrite`) in the manifest.
2. **One action — `send_email`.** No attachments in Slice 6 (V1's [`sendEmail.ts:113-308`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/sendEmail.ts#L113) attachment block is sizeable and pulls in `FileStorageService` + temp-file cleanup; out of scope). No shared / delegated mailbox support — handler authenticates as `/me`. `send_email` accepts `to`, `cc`, `bcc`, `subject`, `body`, `isHtml`, `importance` (`"low" | "normal" | "high"`).
3. **One trigger — `new_email`.** Subscription on `/me/messages` with `changeType: "created"`. Per-trigger filters (sender, subject, importance, folder) are deferred — Slice 6 emits one event per Graph notification, payload includes the full message body fetched from Graph at notification time. V1's [`outlook/index.ts:35-100`](../../../nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/outlook/index.ts#L35) shows the field surface; we ship `none` of those config fields in Slice 6.
4. **Scopes — exactly three:** `offline_access`, `Mail.Send`, `Mail.Read`. V1's [`auth.ts:27-36`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/auth.ts#L27) requests eight scopes including Calendar, Files, and User.Read up-front — that scope-bloat pattern is a V1 rot we explicitly fix. The Microsoft v2 endpoint accepts bare scope names; no URL prefix needed.
5. **OAuth endpoint — `/common/`.** Multi-tenant: `https://login.microsoftonline.com/common/oauth2/v2.0/{authorize,token}`. Works for both consumer Outlook (`@outlook.com`, `@hotmail.com`) and work tenants. Single-tenant restriction is out of scope.
6. **No `_shared/microsoft/` directory in this slice.** Same reasoning as Sheets' Drive imports: don't pre-emptively extract for one provider. When Slice 7 (Calendar) arrives we promote shared OAuth helpers + subscription manager to `integrations/_shared/microsoft/` in a single dedicated commit.
7. **`accountIdField` — `email`.** Match Gmail / Calendar / Drive / Sheets. We resolve the connected account's email via the Graph `/me?$select=mail,userPrincipalName` endpoint at callback time. `mail` is the primary display address; `userPrincipalName` is the sign-in identifier and is the fallback when `mail` is null (consumer accounts where the mailbox hasn't been provisioned yet).
8. **`tokenScope` — `user`.** One Outlook integration per (user, email).
9. **`refreshable` — `true`.** Microsoft refresh tokens rotate. The new refresh token returned with each refresh response replaces the old one (V1's [`auth.ts:113`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/auth.ts#L113) preserves the old one when the response omits a new one — we keep that policy).
10. **Health check interval — 6h.** Matches Gmail / Calendar / Drive / Sheets per CLAUDE.md ("Google/Microsoft: 6h").
11. **Subscription renewal threshold — 1h before expiry.** V1 uses 15 min; we widen to 1h so a 10-minute cron tick never misses a subscription that expires in <10 min. With a 3-day expiration, renewing 1h early means we renew once per ~71 hours per active trigger — fine for cost, generous for safety.

---

## V1 reference paths

OAuth + token refresh:
- [`lib/microsoft-graph/auth.ts`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/auth.ts) — `getAuthUrl`, `exchangeCodeForToken`, `refreshAccessToken`, `storeTokens`, `getValidAccessToken`, `revokeTokens`.

Subscription lifecycle:
- [`lib/microsoft-graph/subscriptionManager.ts`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/subscriptionManager.ts) — `createSubscription`, `renewSubscription`, `deleteSubscription`, `verifyClientState`, `buildOutlookMailResource`, `getSubscriptionsNeedingRenewal`. The `clientState` generation, `expirationDateTime` calculation, and `lifecycleNotificationUrl` plumbing are all here.

Outlook send_email action:
- [`lib/workflows/actions/microsoft-outlook/sendEmail.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/sendEmail.ts) — full handler. Slice 6 ports the recipient/subject/body/importance/idempotency surface and skips attachments / `applyEmailMetaVariables` / `FileStorageService`.
- [`lib/workflows/actions/microsoft-outlook/emailActions.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts) — secondary mail actions (reply, forward, etc.). Not ported.

Outlook trigger node definition (field surface reference, NOT ported as-is):
- [`lib/workflows/nodes/providers/outlook/index.ts:20-200`](../../../nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/outlook/index.ts#L20) — V1's `microsoft-outlook_trigger_new_email` config schema. V2 ships a narrower schema (no filter fields).

Webhook receiver (validation-token handshake reference):
- [`app/api/webhooks/microsoft/route.ts:1561-1583`](../../../nstoddard17/chainreact-app-9e/app/api/webhooks/microsoft/route.ts#L1561) — POST handler with `validationToken` query parameter handling. Echoes the token as `text/plain`.
- Same file lines 2459-2466 — GET handler for validation (some Microsoft tooling probes via GET).
- Same file: `clientState` verification logic embedded in the per-notification loop.

Renewal cron (V1, with rot we will not carry):
- [`app/api/cron/renew-microsoft-subscriptions/route.ts`](../../../nstoddard17/chainreact-app-9e/app/api/cron/renew-microsoft-subscriptions/route.ts) — V1 has a Microsoft-specific cron route. V2 reuses the existing generic `app/api/cron/renew-watch-subscriptions/route.ts` + `services/triggers/runRenewals.ts` machinery, registering an Outlook handler in `subscriptionRegistry`.

Tests (style reference):
- `__tests__/nodes/outlook-send-email.test.ts` — V1's send_email handler test (Q3 401, Q4 idempotency).

DEPRECATED — DO NOT COPY:
- V1's `getValidAccessToken(userId, preferredProvider)` cross-provider Microsoft token sharing. V2 keeps each Microsoft integration row strictly per-provider. Slice 7 will independently fetch its own token via `repositories/integrations.ts`.
- V1's `MicrosoftGraphAuth` class with `clientId`/`clientSecret`/`redirectUri` instance fields read at construction. V2 reads env at call time inside `oauth.ts` (matches Google pattern).
- V1's renewal cron pattern — passing `subscription.accessToken` (which is empty per [`subscriptionManager.ts:303`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/subscriptionManager.ts#L303)) to `renewSubscription`. The token must be re-fetched + decrypted at renewal time via the OAuth dispatcher; storing the token alongside the subscription is the V1 rot we fix.
- V1's `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET` env var names. V2 uses `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` so Slice 7 (Calendar) and onward reuse the same Azure AD app naturally.

---

## V2 → V1 file-by-file map

**Created in Commit 1 (this commit):**
- `docs/slices/slice-6-outlook-mail.md` (this file)

**Created in Commit 2 (manifest + OAuth + dispatcher registration):**
- `integrations/microsoft-outlook/manifest.ts`
- `integrations/microsoft-outlook/oauth.ts`
- `tests/unit/integrations/microsoft-outlook/manifest.test.ts`
- `tests/unit/integrations/microsoft-outlook/oauth.test.ts`

**Modified in Commit 2:**
- `integrations/_registry.ts` — add `microsoftOutlookManifest`.
- `services/oauth/dispatcher.ts` — add `"microsoft-outlook": microsoftOutlookOAuth`.

**Created in Commit 3 (send_email action + Graph API wrapper):**
- `integrations/microsoft-outlook/api/_base.ts` (env-driven base URL with `MICROSOFT_GRAPH_API_BASE` override).
- `integrations/microsoft-outlook/api/sendMail.ts` (POST `/me/sendMail`).
- `integrations/microsoft-outlook/api/getMessage.ts` (GET `/me/messages/{id}` — needed by Commit 4's trigger to fetch the full message at notification time; co-locating in Commit 3 keeps the API wrappers together).
- `integrations/microsoft-outlook/api/errors.ts` (NotFoundError mirroring Calendar/Drive/Sheets).
- `integrations/microsoft-outlook/actions/sendEmail.ts`
- `integrations/microsoft-outlook/actions/sendEmail.schema.ts`
- `tests/unit/integrations/microsoft-outlook/actions/sendEmail.test.ts`

**Modified in Commit 3:**
- `services/execution/handlers/_registry.ts` — add `microsoft-outlook.send_email`.
- `integrations/microsoft-outlook/manifest.ts` — flip `actions: true`.

**Created in Commit 4 (new_email trigger + webhook receiver + renewal):**
- `integrations/microsoft-outlook/triggers/newEmail/{index,activate,deactivate,renew,normalize}.ts`
- `integrations/microsoft-outlook/api/{createSubscription,renewSubscription,deleteSubscription}.ts` (Graph subscription endpoints — wrapped per the same Q3 contract as `sendMail`).
- `integrations/microsoft-outlook/webhooks/receive.ts`
- `app/api/webhooks/microsoft-outlook/route.ts` — validation-token handshake (GET + POST query param), per-notification dispatch.
- `tests/unit/integrations/microsoft-outlook/triggers/newEmail/{activate,deactivate,renew,normalize}.test.ts`
- `tests/unit/integrations/microsoft-outlook/webhooks/receive.test.ts`

**Modified in Commit 4:**
- `integrations/_registry.ts` — add `import "./microsoft-outlook/triggers/newEmail";`
- `integrations/microsoft-outlook/manifest.ts` — flip `webhookTrigger: true`.

**Created in Commit 5 (e2e walkthrough):**
- `tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`
- `tests/e2e/helpers/mockMicrosoftServer.ts` (mirrors `mockGoogleServer.ts` shape: OAuth authorize + token exchange, Graph `me`, `subscriptions`, `me/sendMail`, `me/messages/{id}`).

**Modified in Commit 5:**
- `playwright.config.ts` — env wiring for the new mock (`MICROSOFT_AUTHORIZE_BASE`, `MICROSOFT_TOKEN_BASE`, `MICROSOFT_GRAPH_API_BASE`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`).

---

## OAuth design

V1's [`auth.ts`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/auth.ts) has the wire-format we need. The translations to V2 are:

**Authorize URL.** Standard v2 endpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` with `response_type=code`, `response_mode=query`, `client_id`, `redirect_uri`, `scope` (space-separated), `state`. Plus PKCE: `code_challenge` + `code_challenge_method=S256`. V1 doesn't use PKCE for Microsoft (V1 Microsoft predates V2's PKCE-everywhere policy). V2 adds it because the dispatcher's `state.ts` already issues PKCE pairs and there's no reason to skip it.

**Token exchange.** POST `https://login.microsoftonline.com/common/oauth2/v2.0/token` with `application/x-www-form-urlencoded` body: `client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code`, `code_verifier`. Response: `access_token`, `refresh_token`, `expires_in` (seconds), `scope`, `token_type=Bearer`.

**Refresh token.** Same endpoint, `grant_type=refresh_token`, `refresh_token=<existing>`. Response identical to exchange. Refresh-token rotation policy: if the response includes a new `refresh_token`, store it; if it omits one, preserve the existing one (V1's [`auth.ts:113`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/auth.ts#L113) policy).

**Account ID lookup.** GET `https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id` with `Authorization: Bearer <access_token>`. Use `mail` if non-null, else `userPrincipalName`. The Graph `id` (Azure object id GUID) is stored in `account.metadata.graphId` for future use.

**Redirect URL.** `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/microsoft-outlook/callback`. The route is the existing generic `app/api/integrations/oauth/[provider]/callback/route.ts`; no new route file.

**Env vars.**
- `MICROSOFT_CLIENT_ID` (required at runtime).
- `MICROSOFT_CLIENT_SECRET` (required at runtime).
- `MICROSOFT_AUTHORIZE_BASE` (e2e override; defaults to `https://login.microsoftonline.com`).
- `MICROSOFT_TOKEN_BASE` (e2e override; defaults to `https://login.microsoftonline.com`). Two separate vars because while the production endpoints share the same host, the mock server may serve them on different ports; matches Google's split.
- `MICROSOFT_GRAPH_API_BASE` (e2e override; defaults to `https://graph.microsoft.com`).
- `MICROSOFT_GRAPH_WEBHOOK_URL` (production override for the public HTTPS notification URL; defaults to `${NEXT_PUBLIC_APP_URL}/api/webhooks/microsoft-outlook`).

`revoke()` is a stub — disconnect-UX slice owns it (matches Gmail / Calendar / Drive / Sheets / Slack).

---

## `send_email` action algorithm

Mirrors V1's [`sendEmail.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/sendEmail.ts) **without** attachments / meta-variable resolution / FileStorageService.

**Input** (validated by `sendEmail.schema.ts` — Q11 explicit fields):
- `to: string | string[]` — required (or one of `cc`/`bcc` is required; not all three empty).
- `cc: string | string[]` — optional.
- `bcc: string | string[]` — optional.
- `subject: string` — required, may be empty string but must be present.
- `body: string` — required, may be empty string but must be present.
- `isHtml: boolean` — required (no silent default per Q11; UI provides a recommended value of `false` but the field is explicit).
- `importance: "low" | "normal" | "high"` — required.

**Algorithm:**
1. Resolve config templates against input (the engine already pre-resolves at the strict layer per Q2; this is the post-resolution shape).
2. Fetch + decrypt access token via `repositories/integrations.getActiveForExecution(userId, "microsoft-outlook")` → `decryptToken`.
3. Normalize recipients via `core/integrations/parseRecipients.ts`. CSV strings split on `,`; arrays flatten. Validate at least one of `toRecipients`/`ccRecipients`/`bccRecipients` is non-empty after parsing.
4. Build the Graph `sendMail` payload:
   ```json
   {
     "message": {
       "subject": "...",
       "body": { "contentType": "HTML" | "Text", "content": "..." },
       "toRecipients": [{ "emailAddress": { "address": "x@y.z" } }],
       "ccRecipients": [...],
       "bccRecipients": [...],
       "importance": "low" | "normal" | "high"
     }
   }
   ```
5. Compute Q4 idempotency key + payload hash:
   - `idempotencyKey = ${executionSessionId}:${nodeId}:${actionType}` via `core/workflows/idempotency.ts:buildIdempotencyKey`.
   - `payloadHash = hashPayload({ to, cc, bcc, subject, body, isHtml, importance })` (sorted-keys SHA-256).
   - `checkReplay(key, hash)` → cached returns the prior result; mismatch returns `PAYLOAD_MISMATCH`; fresh proceeds.
6. POST `${MICROSOFT_GRAPH_API_BASE}/v1.0/me/sendMail` with `Authorization: Bearer ${token}`, wrapped in `services/oauth/refreshAndRetry.refreshAndRetry({ provider: "microsoft-outlook", userId, ... })`.
7. On 2xx (sendMail returns 202 Accepted with no body): build the success `ActionResult`. Skip the V1 sent-items lookup for `messageId` — Slice 6 doesn't need a message id and it doubles the request count for marginal value.
8. `recordFired(key, result, hash, { provider, externalId: null })`.

**Error mapping:**
- 401 → `refreshAndRetry` handles internally; persistent 401 after one refresh → `category: "auth"` ActionResult.
- 4xx (non-401) → `category: "config" | "provider"` based on Graph error code (e.g., `ErrorInvalidRecipients` → `config`).
- 5xx / network → `category: "provider"`, retryable at a higher layer (engine policy).

**No `applyEmailMetaVariables`.** V1's `{{recipient_name}}` / `{{sender_email}}` meta-variable resolver is out of scope. Templates resolve only the standard `{{nodeId.field}}` references the engine pre-resolves at the strict layer (Q2).

---

## `new_email` trigger algorithm

**Subscription resource:** `/me/messages`. **changeType:** `"created"`. **expirationMinutes:** 4230 (Microsoft's max for Outlook; ~70.5h ≈ 2.94 days — ensure we treat this as the hard cap and renew well before).

**activate (lifecycle hook called when workflow goes active):**
1. Validate config — Slice 6 has no required config fields beyond standard workflow plumbing (`workflowId`, `nodeId`).
2. Generate `clientState` — 32-byte hex via `crypto.randomBytes(32).toString("hex")`. Persist BEFORE the API call so an in-flight failure leaves no orphan provider-side subscription with a clientState we don't know about.
3. POST `${MICROSOFT_GRAPH_API_BASE}/v1.0/subscriptions` with:
   ```json
   {
     "changeType": "created",
     "notificationUrl": "${webhookBase}/api/webhooks/microsoft-outlook",
     "resource": "/me/messages",
     "expirationDateTime": "<now + 4230 min, ISO>",
     "clientState": "<hex>",
     "lifecycleNotificationUrl": "${webhookBase}/api/webhooks/microsoft-outlook/lifecycle"
   }
   ```
   `lifecycleNotificationUrl` is required by Microsoft for any subscription with `expirationDateTime > 1h`. The lifecycle endpoint receives reauthorization / subscription-removed signals. Slice 6 ships the route file but the lifecycle handler is a stub that logs + 200s; Slice 7 or a follow-up wires real reauthorization handling.
4. Persist a `trigger_resources` row with:
   ```json
   {
     "providerId": "microsoft-outlook",
     "userId": "...",
     "workflowId": "...",
     "nodeId": "...",
     "resourceType": "subscription",
     "externalId": "<Graph subscription id>",
     "expiresAt": "<ISO from response>",
     "status": "active",
     "config": {
       "type": "subscription-watch",
       "resource": "/me/messages",
       "changeType": "created",
       "clientState": "<hex>",
       "lastNotificationAt": null
     }
   }
   ```
5. Wrapped in `refreshAndRetry` per Q3.

**deactivate (lifecycle hook called on workflow disable / delete):**
1. DELETE `${MICROSOFT_GRAPH_API_BASE}/v1.0/subscriptions/{externalId}` with bearer token.
2. Best-effort: 404 → swallow (already gone). 403 → swallow (V1's reasoning at [`subscriptionManager.ts:247-253`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/subscriptionManager.ts#L247) — Microsoft auto-cleans expired subscriptions; if our token can't delete, the subscription will lapse on its own).
3. Mark the `trigger_resources` row `status: "deleted"`.

**renew (registered handler in `services/triggers/subscriptionRegistry`):**
1. `getRenewalThresholdMs()` returns 1h (60 * 60 * 1000).
2. PATCH `${MICROSOFT_GRAPH_API_BASE}/v1.0/subscriptions/{externalId}` with `{ "expirationDateTime": "<now + 4230 min, ISO>" }`, wrapped in `refreshAndRetry`.
3. Update `trigger_resources.expires_at` from response.
4. **Critical:** the renewal handler does NOT use a stored access token. It uses `refreshAndRetry` which re-fetches + decrypts via the dispatcher. This is the V1 rot fix #3 — V1's renewal cron passes `subscription.accessToken` which is the empty string per [`subscriptionManager.ts:303`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/subscriptionManager.ts#L303), so V1 actually only renews when the inline pass-through happens to coincide with a fresh token. V2 makes correctness a property of the contract.
5. **Failure mode:** if refresh itself fails (the integration row needs reconnect), `refreshAndRetry` raises `IntegrationActionRequiredError`. The renewal cron catches per row and continues to the next; the row stays `status: "active"` until its real `expiresAt` lapses, at which point Microsoft auto-cleans server-side and `runRenewals` will skip it on subsequent ticks because the row is past expiry. Slice 6 does NOT auto-disable workflows on failed renewal — that's a downstream policy decision the proactive-health system owns.

**Webhook receive (`app/api/webhooks/microsoft-outlook/route.ts`):**
1. **GET handler** — if `?validationToken=...`, return the token as `text/plain` 200. Else return a JSON 200 with a service-info shape (matches the GET-as-health-probe convention).
2. **POST handler:**
   - **Validation-token handshake.** If the request URL has `?validationToken=...`, return the token as `text/plain` 200 immediately. Microsoft also sometimes sends validation as `Content-Type: text/plain` body without a query param — when the body is non-JSON and there's no signature header, treat as validation and echo. Must respond within 10 seconds; the route does no async DB I/O on this branch.
   - **Notification handler.** Body is `{ "value": [{ subscriptionId, clientState, changeType, resource, resourceData: { id, ... }, ... }, ...] }`. For each notification:
     - Look up the `trigger_resources` row by `external_id = subscriptionId` AND `provider_id = "microsoft-outlook"`. Skip if not found (subscription belongs to a deactivated workflow).
     - Verify `clientState === row.config.clientState`. If mismatch, log + skip — never raise (avoids surfacing potential probing).
     - Compute dedup key (see "Dedup key shape" below). `webhookEventDedup.checkAndRecord(provider, eventId)` → if duplicate, skip.
     - Fetch the message via `getMessage(messageId, accessToken)` (wrapped in `refreshAndRetry`). On 404, the message may have been deleted between notification and fetch — log + skip.
     - Normalize the Graph message into the trigger event shape (see "Output shape" below).
     - Dispatch via `services/triggers/dispatch.ts`.
3. **Lifecycle path (`/lifecycle` sub-route) — stub.** 200 + log. Real reauthorization handling is a follow-up.

**Output shape** (the `new_email` trigger event payload):
- `messageId: string` — Graph message id.
- `conversationId: string`
- `subject: string`
- `bodyPreview: string` (Graph's first ~255 chars of plain text)
- `body: { contentType: "html" | "text", content: string }` — full body
- `from: { name: string, address: string }`
- `to: Array<{ name: string, address: string }>`
- `cc: Array<{ name: string, address: string }>`
- `receivedAt: string` — ISO timestamp
- `hasAttachments: boolean`
- `importance: "low" | "normal" | "high"`
- `webLink: string | null` — Graph's deeplink to the message in OWA

---

## Dedup key shape

`webhook_event_dedup`:
- `provider = "microsoft-outlook"`
- `eventId = "${subscriptionId}:${messageId}:${changeType}"`

`messageId` comes from `notification.resourceData.id`. `changeType` is always `"created"` for Slice 6 but is included in the key for forward-compat (Slice 7 or later may add `updated`/`deleted` triggers and we want non-overlapping keys per change semantic). `subscriptionId` is included so the same message arriving on two distinct subscriptions (which shouldn't happen in practice but Microsoft has been known to fan out during subscription rotation) is treated as two distinct events.

---

## Azure AD setup checklist

This slice ships entirely with mocks for tests. Real-deployment setup the user does outside this codebase:

1. **Azure portal → Microsoft Entra ID → App registrations → New registration.**
   - Name: "ChainReact" (or "ChainReact Dev" for the dev app).
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts (multitenant + personal)**. This unlocks `/common/` endpoint usage.
   - Redirect URI: **Web** platform, value `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/microsoft-outlook/callback`.
2. **Certificates & secrets → New client secret.** Copy the **Value** (not the secret ID). Set lifetime to 24 months (max). **This rotates yearly** — calendar reminder needed.
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions:**
   - `offline_access`
   - `Mail.Send`
   - `Mail.Read`
   - **No admin consent required** for any of these — user-level consent at OAuth time is sufficient.
4. **Env vars:**
   - `MICROSOFT_CLIENT_ID` = Application (client) ID from the Overview page.
   - `MICROSOFT_CLIENT_SECRET` = the secret Value from step 2.
5. **Public HTTPS webhook URL.** Microsoft Graph requires HTTPS for `notificationUrl`. For dev: an ngrok / Cloudflare-tunnel HTTPS endpoint pointing at `localhost`. Set `MICROSOFT_GRAPH_WEBHOOK_URL=https://<tunnel>.ngrok.io/api/webhooks/microsoft-outlook` (overrides the default `${NEXT_PUBLIC_APP_URL}/...`).
6. **Validation handshake test.** Once env vars are set and the tunnel is running, hitting `POST /api/webhooks/microsoft-outlook?validationToken=foo` should return `foo` as `text/plain` 200 within 10s. This is the same handshake Microsoft does on subscription create.

None of the above is required for Slice 6's e2e — the `mockMicrosoftServer` simulates the entire wire-format. Real Azure setup is on the user's runway when they're ready to flip the integration on in production.

---

## V1 rot fixes carried into V2

1. **No inline refresh in renewal.** V1's `renew-microsoft-subscriptions/route.ts:40` passes `subscription.accessToken` (always empty per the data model). V2's renewal handler uses `refreshAndRetry` so token validity is a property of the dispatcher, not the renewal cron's accident.
2. **`clientState` persisted before the create call.** V1 generates `clientState` inside `createSubscription` and only persists it via the `trigger_resources` write the lifecycle manager does after success. A retried request (network blip) could produce two server-side subscriptions with the same `clientState` but only one DB row. V2 generates + persists the clientState BEFORE the Graph POST and uses it as the body field, eliminating the race.
3. **Scope minimalism.** V1 requests 8 scopes for "microsoft-outlook" including Calendar, Files, User.Read. V2 requests exactly `offline_access`, `Mail.Send`, `Mail.Read`. Slice 7 will additively widen via a re-auth flow when Calendar lands; users granting Slice 6 don't get over-prompted.
4. **DB-backed dedup.** V1 has no webhook dedup for Microsoft (relies on idempotency at the workflow level). V2 uses `repositories/webhookEventDedup` with the key shape above.
5. **Per-provider env vars.** V1 uses `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET` for the `microsoft-outlook` provider, but other Microsoft surfaces in V1 use `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`. Inconsistent. V2 uses `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` from the start so Slice 7+ providers naturally share.
6. **`refreshable: true` honesty.** V1's [`authSchemes.ts`](../../../nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts) tags Microsoft as `oauth_with_refresh` — correct. V2 sets `refreshable: true` in the manifest.
7. **No multiplexer route.** V1 ships one `/api/webhooks/microsoft/route.ts` that fans out to Outlook, Calendar, Excel, OneDrive, Teams, OneNote based on the resource string (the file is 2400+ lines). V2 ships per-provider `/api/webhooks/microsoft-outlook` from day one. Slice 7 will add `/api/webhooks/microsoft-calendar`. Each route is small and provider-scoped.

---

## Risk callouts

1. **10-second validation timeout.** The webhook route MUST respond to validation within 10s. Any synchronous DB I/O on the validation branch is a failure mode. Slice 6's POST handler short-circuits validation before any DB call.
2. **Subscription expiry math is in minutes, not days.** Graph's `expirationDateTime` is an ISO-8601 string but the maximum is 4230 minutes for Outlook mail (per [`subscriptionManager.ts:43`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/subscriptionManager.ts#L43)). 4230 / 60 = 70.5h ≈ 2.94 days — NOT the rounded "3 days" CLAUDE.md mentions. The handler hardcodes 4230; tests verify the resulting `expirationDateTime` is within 1 minute of `now + 4230 min`.
3. **Renewal cron tick rate.** V2's `renew-watch-subscriptions` cron runs every 10 min (per Slice 4 plan). With a 1h renewal threshold, a worst-case sub renewing at exactly 1h-before-expiry has 6 cron ticks to attempt renewal before the sub expires. After one failed renewal at 1h-before, we still have 11h × 6 = ~66 retry attempts before any data loss. Sufficient.
4. **Personal vs work account quirks.** Personal Microsoft accounts (consumer Outlook) sometimes return `mail: null` and require fallback to `userPrincipalName`. V2's account ID lookup handles this. Tests mock both shapes.
5. **`text/plain` validation body.** Some Microsoft tooling sends the validation token as the request body with `Content-Type: text/plain` and NO query parameter. V1's [`route.ts:1580`](../../../nstoddard17/chainreact-app-9e/app/api/webhooks/microsoft/route.ts#L1580) handles this by checking the content-type. V2 mirrors the check.
6. **Refresh token rotation can omit a new token.** V1's [`auth.ts:113`](../../../nstoddard17/chainreact-app-9e/lib/microsoft-graph/auth.ts#L113) preserves the old refresh token when the response omits one. V2's `refreshGoogleToken` shared helper has the same policy for Google. The Microsoft refresh helper must replicate it explicitly.
7. **`me/sendMail` returns 202 with no body.** Don't try to JSON-parse the response. V1 doesn't make this mistake; V2's API wrapper must also skip parsing on 202.
8. **`me/messages/{id}` returns the FULL body.** Outlook bodies can be large (HTML emails with embedded base64 images). Slice 6 emits the full body in the trigger payload — workflows that don't need it pay the storage cost. Slice 6 deliberately doesn't add a `bodyPreviewOnly` config field; it's a follow-up if real workflows trip storage limits.

---

## Out-of-scope (echoed from approved scope)

- Outlook Calendar (Slice 7 — separate provider, separate manifest).
- Outlook Contacts.
- Microsoft Teams, OneDrive, Excel, OneNote (each their own slice later).
- `send_email` attachments + `applyEmailMetaVariables` resolver.
- Shared / delegated mailbox support (`/users/{id}/sendMail`).
- `new_email` trigger filter fields (sender, subject, importance, folder, has-attachment) — Slice 6 emits one event per Graph notification.
- `email_sent`, `email_flagged`, `email_received` triggers (V1 has them; deferred).
- Reauthorization handler for `lifecycleNotificationUrl` (stub-only in Slice 6).
- Auto-disable workflows on persistent renewal failure — handled by the proactive-health system, not Slice 6.
- Push or PR or remote sharing of any kind.
- Cross-provider helper extraction to `_shared/microsoft/` (defer until Slice 7).
- Unrelated cleanup.
