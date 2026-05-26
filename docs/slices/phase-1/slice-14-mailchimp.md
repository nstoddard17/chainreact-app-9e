# Slice 14 — **Mailchimp** provider port

**Branch:** `slice-14-mailchimp` (off `slice-13-hubspot` @ `e991010d3`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Mailchimp from V1 as **V2's first email-marketing provider** AND **V2's first per-datacenter API-host routing model**, AND **V2's first hybrid webhook+polling lifecycle inside one provider**. Ships an OAuth dispatcher entry (non-refreshable opaque bearer + dc-metadata-on-callback), 10 typed action handlers covering audience / subscriber / segment / event surfaces, one consolidated `audience_event` webhook trigger that dispatches per Mailchimp event-type discriminator (subscribe/unsubscribe/profile/upemail/cleaned/campaign), and three polling triggers for campaign-report surfaces Mailchimp doesn't webhook (email_opened, link_clicked, campaign_created).

Slice 14 introduces **two genuinely new V2 patterns**:

1. **Per-datacenter API-host routing.** Mailchimp shards its API by datacenter prefix — every account lives on `us1`, `us2`, …, `us21`, `eu1`, etc. The bearer token alone does not tell you which datacenter to hit; the `dc` value comes from `GET https://login.mailchimp.com/oauth2/metadata` (authenticated `Authorization: OAuth <token>`) and must be persisted on the integration row at OAuth-callback time. Every subsequent API call routes through `https://${dc}.api.mailchimp.com/3.0/...`. This is the **first V2 provider** whose API base URL is per-integration (Shopify routes per-shop, but the shop domain IS the account identifier — Mailchimp routes by a separate `dc` value alongside the account name). The `_shared/mailchimp/api/_base.ts` + `_request.ts` helpers in Commit 2 establish this pattern; future providers with similar sharding (SendGrid EU/US, Zendesk subdomain) reuse the shape.

2. **Hybrid webhook + polling lifecycle inside one provider.** Every V2 trigger provider so far is either webhook-only (Slack, Stripe, Shopify, HubSpot, Microsoft Graph, Notion) or polling-only (Gmail, Google Calendar/Drive/Sheets, Outlook, OneDrive, Airtable). **Mailchimp is the first that needs both inside the same provider**: subscribe/unsubscribe/profile/upemail/cleaned/campaign-sent are first-class list webhook events; email-opens, link-clicks, and campaign-created are reporting surfaces with no webhook support — Mailchimp ships them only via the `/reports/{campaignId}` and `/campaigns` endpoints. Slice 14 cleanly separates these into two distinct trigger families that share the OAuth foundation but use different activation/dispatch paths. Polling triggers follow V2's snapshot-baseline-on-activate pattern (matches Gmail's first-poll-miss fix); webhook triggers follow V2's HubSpot/Shopify per-trigger-resource pattern.

Slice 14 also **uses the HubSpot/Shopify-style consolidated trigger** — `audience_event` with `eventTypes: string[]` discriminator — collapsing V1's five separate subscriber-webhook trigger types into ONE V2 trigger. Polling triggers stay separate because each carries a distinct config shape (per-campaign filter for opens/clicks, status filter for campaign_created).

---

## Why Mailchimp now

1. **First email-marketing provider in V2.** Highest-requested non-CRM category after the CRM bucket landed in Slice 13. Email marketing pairs naturally with the V2 CRM (HubSpot) and e-commerce (Shopify, Stripe) surfaces — `new contact in HubSpot → add subscriber to Mailchimp` and `Stripe customer.created → tag subscriber` are common workflows.
2. **Validates per-datacenter API-host routing.** First V2 provider with a per-integration API base URL that's neither the account id nor a hardcoded global URL. The `_shared/mailchimp/api/_base.ts` pattern future-proofs SendGrid (EU vs US split), Zendesk (subdomain-based), Atlassian (cloud-id-based), and Freshworks (subdomain-based).
3. **Validates hybrid webhook+polling lifecycle.** First V2 provider that ships both kinds of triggers under one OAuth flow. The split clarifies V2's trigger-family taxonomy for future providers like Intercom (webhook contacts, polling conversations) and ActiveCampaign (webhook contacts, polling automation events).
4. **Closes V1 OAuth misclassification.** V1's [`authSchemes.ts:64`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L64) classifies Mailchimp as `oauth_with_refresh`, but Mailchimp **does not issue refresh tokens** — V1's [`provider-registry.ts:662`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L662) `transformTokenData` hardcodes `refresh_token: null`. The `oauth_with_refresh` classification is dead config; refresh is never attempted. V2 fixes this during the port — manifest `refreshable: false`, `refreshToken()` throws `RefreshNotSupportedError`, 401 → `IntegrationActionRequiredError`. Matches V2's Shopify / Slack / Notion non-refreshable shape.
5. **Strong reusable code with surgical fixes needed.** V1 has 15 action handlers in [`lib/workflows/actions/mailchimp/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp) plus a full lifecycle at [`lib/triggers/providers/MailchimpTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts). The MD5-email-hash subscriber-endpoint pattern (`crypto.createHash('md5').update(email.toLowerCase()).digest('hex')`) lifts cleanly. V1's Q11 `requireExplicitField('status')` is already in place and ports forward unchanged.
6. **Light external setup.** Free Mailchimp account → register one OAuth app via `https://login.mailchimp.com/account/oauth2/client/list` → `MAILCHIMP_CLIENT_ID` + `MAILCHIMP_CLIENT_SECRET`. Mock owns the boundary for e2e — no real Mailchimp credentials needed for the test suite to pass green.

---

## V1 audit — paths and findings

### Manifest / node definitions (V1 has 10 triggers + 13 actions)

- Main manifest: [`lib/workflows/nodes/providers/mailchimp/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/mailchimp/index.ts) — 10 trigger types + 13 action types declared inline + 7 split-schema actions.
- Split action schemas in [`lib/workflows/nodes/providers/mailchimp/actions/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/mailchimp/actions):
  - `addNote.schema.ts`, `createSegment.schema.ts`, `getCampaign.schema.ts`, `getCampaignStats.schema.ts`, `getSubscriber.schema.ts`, `scheduleCampaign.schema.ts`, `unsubscribeSubscriber.schema.ts`
- Trigger types (10 total):
  - `mailchimp_trigger_new_subscriber` — webhook (`subscribe` event)
  - `mailchimp_trigger_unsubscribed` — webhook (`unsubscribe` event)
  - `mailchimp_trigger_subscriber_updated` — webhook (`subscribe` + `profile` + `upemail` events)
  - `mailchimp_trigger_new_campaign` — webhook (`campaign` event, fires on send)
  - `mailchimp_trigger_email_opened` — polling (no webhook)
  - `mailchimp_trigger_link_clicked` — polling (no webhook)
  - `mailchimp_trigger_campaign_created` — polling (campaign webhook only fires on SEND, not creation)
  - `mailchimp_trigger_subscriber_added_to_segment` — polling (no webhook for tag/segment membership)
  - `mailchimp_trigger_segment_updated` — polling (no webhook)
  - `mailchimp_trigger_new_audience` — polling (no webhook)

### OAuth flow

- Config: [`lib/integrations/oauthConfig.ts:577-590`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L577).
  - `authEndpoint: "https://login.mailchimp.com/oauth2/authorize"`.
  - `tokenEndpoint: "https://login.mailchimp.com/oauth2/token"`.
  - `authMethod: "body"` — `client_id` + `client_secret` go in the form body, NOT a Basic auth header.
  - `refreshTokenExpirationSupported: false`, `sendRedirectUriWithRefresh: true` — **DEAD CONFIG.** Mailchimp does not issue refresh tokens; refresh is never actually attempted.
- Provider registry: [`lib/integrations/provider-registry.ts:654-694`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L654).
  - `transformTokenData: (tokenData) => ({ access_token: tokenData.access_token, refresh_token: null, ... })` — explicitly nulls out any refresh_token even if Mailchimp ever included one.
  - `additionalIntegrationData` fetches `https://login.mailchimp.com/oauth2/metadata` (`Authorization: OAuth <token>`) for the `dc` value, then `https://${dc}.api.mailchimp.com/3.0/` for `account_name`. Both results are persisted into `integrations.metadata`.
- Auth-URL generator: [`app/api/integrations/auth/generate-url/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts) (generic path, no Mailchimp-specific branch).
- Token / refresh body shape: form-urlencoded with `grant_type=authorization_code`, `client_id`, `client_secret`, `redirect_uri`, `code`. **No PKCE.**
- DC fallback fetch on every API call: [`lib/workflows/actions/mailchimp/utils.ts:11-88`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L11) — `getMailchimpAuth(userId)` checks `metadata?.dc`; if missing, re-fetches from `/oauth2/metadata` and writes it back. **V2 fix:** OAuth callback in Commit 2 captures `dc` deterministically so the runtime fallback is unnecessary; if `dc` is missing at action time, throw `Error("Mailchimp dc missing — reconnect")` rather than re-fetching.

### Action handlers — V1 endpoints + quirks

- All actions use Bearer auth: `Authorization: Bearer ${accessToken}`.
- Body content-type: JSON for write operations.
- No idempotency keys (Mailchimp has no equivalent of Stripe's `Idempotency-Key`).
- 401 handling: ad-hoc per handler — V2 wraps every action in `refreshAndRetry` (Mailchimp is `non_refreshable`, so 401 → `RefreshNotSupportedError` → `IntegrationActionRequiredError`).
- MD5 email hash for subscriber endpoints: `crypto.createHash('md5').update(email.toLowerCase()).digest('hex')` ([addSubscriber.ts:102](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts#L102)). Required for `PUT/PATCH/DELETE /lists/{id}/members/{subscriberHash}`. Goes in `_shared/mailchimp/api/_subscriberHash.ts`.
- Q11 explicit status: V1's `addSubscriber.ts` already uses `requireExplicitField('status')` ([line 23](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts#L23)) — CAN-SPAM / GDPR consideration. Ports forward unchanged.
- Tag handling: `POST /lists/{id}/members/{hash}/tags` with `{ tags: [{ name, status: 'active'|'inactive' }] }` (add) or `status: 'inactive'` (remove). V1 has both endpoints; V2 keeps them as separate actions.
- Sample endpoints:
  - `PUT /lists/{audienceId}/members/{subscriberHash}` (upsert subscriber) — [addSubscriber.ts:104](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts#L104).
  - `PATCH /lists/{audienceId}/members/{subscriberHash}` (update subscriber) — [updateSubscriber.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/updateSubscriber.ts).
  - `POST /lists/{audienceId}/members/{subscriberHash}/tags` (add/remove tag) — [addTag.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addTag.ts).
  - `POST /lists/{audienceId}/segments` (create segment / tag) — [createSegment.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createSegment.ts).
  - `POST /lists` (create audience) — [createAudience.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createAudience.ts).
  - `POST /lists/{audienceId}/members/{subscriberHash}/notes` (add note) — [addNote.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addNote.ts).
  - `POST /lists/{audienceId}/members/{subscriberHash}/events` (create custom event) — [createEvent.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/createEvent.ts).

### Triggers / webhooks

- Lifecycle: [`lib/triggers/providers/MailchimpTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts). Hybrid lifecycle handles both webhook and polling triggers in the same class — switches on `getEventsForTrigger()` and routes either to `POST /lists/{audienceId}/webhooks` or to the polling-snapshot capture path.
- Webhook events declared at [`getEventsForTrigger`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L47): `subscribe`, `unsubscribe`, `profile`, `cleaned`, `upemail`, `campaign`. Mailchimp's webhook create endpoint requires every event field to be explicitly set (true/false) — see V1 line 56.
- **Duplicate-URL handling:** V1 attempts `POST /lists/{audienceId}/webhooks`, catches the `"can't set up multiple WebHooks"` error, lists existing webhooks for the audience, finds the matching URL, and PATCHes the events on the existing webhook. V2 replicates this on activation — see §"V1 patterns to keep" below.
- Receive route: [`app/api/webhooks/mailchimp/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/mailchimp/route.ts).
  - **No signature verification — and per current Mailchimp docs, none is available.** Mailchimp does NOT sign webhook deliveries; there is no `X-Mailchimp-Signature` header. Authenticity relies on URL secrecy + per-audience scoping. See §"Webhook signature decision" below.
  - **Verification handshake:** Mailchimp sends a `GET /your-webhook-url` immediately after webhook create. The route must return 200 OK. V1 handles this at [line 126-132](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/mailchimp/route.ts#L126).
  - Body format: `application/x-www-form-urlencoded` with bracket-notation keys (`data[email]`, `data[list_id]`, `data[merges][FNAME]`). V1 transforms via `transformMailchimpPayload`. V2 keeps the transform inside `_shared/mailchimp/webhooks/normalize.ts`.
  - Dedup: none in V1's receive route.
- Polling: snapshot-on-activate pattern at [`captureInitialSnapshot`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L536). Each polling trigger type has its own snapshot shape (`email_opened` snapshots open totals per campaign; `link_clicked` snapshots click totals; `campaign_created` snapshots campaign id sets). Ports cleanly into V2's `pollingRegistry` pattern.

### Shared utilities / scope model

- Scopes: Mailchimp **requires no explicit scope parameters** — the OAuth flow grants full account access; the `scope` parameter on the authorize URL is ignored (V1's `availableIntegrations.ts:301` declares `["campaigns", "lists", "automations"]` but these are documentation-only, not enforced by Mailchimp). V2 ships `scopes.required: []` and treats access as account-wide.
- Inline OAuth helper: [`lib/workflows/actions/mailchimp/utils.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts) — `getMailchimpAuth(userId)`. V2 replaces with `_shared/mailchimp/api/_base.ts` (`mailchimpAuthFor(userId)` + `mailchimpApiUrl(dc, path)`).

### Tests

- Zero Mailchimp-specific tests in V1.

---

## Confirmed scope decisions

1. **New provider id — `mailchimp`.** Standard V2 provider folder (`integrations/mailchimp/`) + dispatcher entry. One Mailchimp integration per (user, mailchimpAccountId).

2. **OAuth — non-refreshable + form-urlencoded body-auth + no PKCE.** Manifest declares `refreshable: false`. Token exchange POSTs `https://login.mailchimp.com/oauth2/token` with `application/x-www-form-urlencoded` body containing `grant_type`, `client_id`, `client_secret`, `redirect_uri`, `code`. No PKCE. **`refreshToken()` throws `RefreshNotSupportedError("mailchimp")`** — same contract as V2's Shopify (Slice 12), Slack, Notion. On 401, `refreshAndRetry` catches and translates to `IntegrationActionRequiredError` → user sees a "reconnect your Mailchimp account" prompt.

   **V1 misclassification fix.** V1's [`authSchemes.ts:64`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L64) `'oauth_with_refresh'` is wrong — Mailchimp issues an opaque long-lived bearer with no refresh grant. V1's [`provider-registry.ts:662`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L662) hardcodes `refresh_token: null` on every token exchange, confirming this. V2 manifest gets it right.

3. **OAuth scopes — empty.** Mailchimp doesn't honor the `scope` parameter; the OAuth flow grants account-wide access. `scopes.required: []`, `optional: []`. Validates V2's empty-scope-allowed code path (most providers have at least one required scope).

4. **`tokenScope` — `user`.** One Mailchimp integration per (user, `providerAccountId=mailchimpAccountId`). Re-authorizing to a different Mailchimp account creates a sibling integration row.

5. **`accountIdField` — `mailchimpAccountId`.** Resolved at OAuth callback time via the `/3.0/` root endpoint, which returns `{ account_id, account_name, login: { email }, total_subscribers, ... }`. V2 stores the string `account_id` as `providerAccountId`. Stable for the life of the Mailchimp account.

6. **`dc` (datacenter) — captured at OAuth callback, persisted in `accountMetadata.dc`.** Resolved by `GET https://login.mailchimp.com/oauth2/metadata` with `Authorization: OAuth <token>`. Required for every subsequent API call. If `dc` is missing at action time (data drift, manual edits), the action throws a deterministic `Error("Mailchimp dc missing — reconnect integration")` rather than silently re-fetching. The `_shared/mailchimp/api/_base.ts` helper centralizes this.

7. **`apiVersion` — `3.0`.** Pinned. Mailchimp's API base is `https://${dc}.api.mailchimp.com/3.0/...`. The const lives in `_shared/mailchimp/api/_base.ts` and `manifest.ts` (kept in lockstep with Shopify's `apiVersion` pattern).

8. **Token caching shape.** Access token encrypted (AES-256-GCM) on `integrations.access_token_encrypted`. `refresh_token_encrypted: null`. `accessTokenExpiresAt: null` (Mailchimp tokens don't expire). DC + account name persisted on `accountMetadata` per item 6.

9. **Health check interval — 12h.** Matches V2's "other providers" tier (Notion, Slack, Discord, Airtable, Stripe, Shopify). Mailchimp's API is gentle on rate limits; a 12h `GET /3.0/` ping confirms the bearer still works. Slice 14 doesn't ship the health-check route itself — manifest declares the cadence so the future health-engine cron picks it up.

10. **Action surface — 10 actions** matching the approved outline:
    - `add_subscriber`, `update_subscriber`, `remove_subscriber`
    - `add_tag`, `remove_tag`
    - `get_subscriber`
    - `create_segment`, `create_audience`, `create_custom_event`, `add_note`

11. **Q11 explicit field — `status` on `add_subscriber`.** Mailchimp's subscription status has CAN-SPAM / GDPR implications: `subscribed` implies prior consent, `pending` triggers a confirmation email (double opt-in). V2 requires explicit choice via `requireExplicitField('status')`. Other Q11 candidates audited and ruled out: `delete_permanently` (`remove_subscriber` boolean — defaults `false`, mirrors V1, low-risk; archive ≠ delete in Mailchimp's data model so this is reversible); `email_type_option` (`create_audience` boolean — boolean defaults are typically safe; not an explicit-consent surface).

12. **One consolidated webhook trigger — `audience_event`** with `eventTypes: string[]` multi-select discriminator. V1's five webhook-driven trigger types collapse into one V2 trigger:
    - `subscribe` (mapped from V1's `mailchimp_trigger_new_subscriber`)
    - `unsubscribe` (mapped from V1's `mailchimp_trigger_unsubscribed`)
    - `profile` (mapped from V1's `mailchimp_trigger_subscriber_updated`)
    - `upemail` (mapped from V1's `mailchimp_trigger_subscriber_updated`)
    - `cleaned` (new in V2 — V1 didn't surface this as a workflow trigger but Mailchimp natively webhooks it)
    - `campaign` (mapped from V1's `mailchimp_trigger_new_campaign`)
    - Trigger config: `audienceId` + `eventTypes: string[]` (multi-select). Allowlist lives as a const in `integrations/mailchimp/triggers/audienceEvent/allowedEventTypes.ts`.

13. **Three polling triggers — separate.** Each carries a distinct config shape so consolidation hurts readability:
    - `email_opened` — config: optional `campaignId` filter. Polls `GET /3.0/reports/{campaignId}` or `GET /3.0/campaigns?status=sent`.
    - `link_clicked` — config: optional `campaignId` filter + optional `url` filter. Polls `GET /3.0/reports/{campaignId}/click-details/{linkId}`.
    - `campaign_created` — config: optional `audienceId` filter + `status: 'all'|'sent'|'save'` filter. Polls `GET /3.0/campaigns?sort_field=create_time&sort_dir=DESC&count=50`.
    - Each ships with a baseline-on-activate snapshot to prevent first-poll-miss / first-poll-storm. Mirrors V1's `captureInitialSnapshot` at [MailchimpTriggerLifecycle.ts:536-723](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L536).
    - Polling cadence: **5 min** per trigger (matches V1's `pollInterval: 300000`).

14. **Triggers DEFERRED from V1:**
    - `mailchimp_trigger_subscriber_added_to_segment` — V1's all-tags-mode walks up to 20 static segments and fetches 1000 members each per poll (cap is hacky and the dedup story across tags is messy). Per outline §"Important accepted deferrals". Single-tag mode could come back in a follow-up slice if validated.
    - `mailchimp_trigger_segment_updated` — low product value. Per outline.
    - `mailchimp_trigger_new_audience` — low product value (audiences are rarely created programmatically). Per outline.

15. **Webhook signature verification — NONE (Mailchimp doesn't sign).** Per current Mailchimp docs (cross-checked against V1's [route.ts:30-122](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/mailchimp/route.ts#L30)), Mailchimp list webhooks do **NOT** include an HMAC signature header. Authenticity model is URL secrecy + per-audience scoping. V2's `_shared/mailchimp/webhooks/signature.ts` (if added at all) is a stub explaining this; the receive route's only "verification" is:
    1. Validate `?workflowId=&nodeId=` query params match a `trigger_resources` row with `provider='mailchimp'`.
    2. Validate the payload's `data[list_id]` matches the trigger's stored `audienceId`.
    3. Validate the payload's event `type` is in the trigger's stored `eventTypes` allowlist.
    The webhook URL itself is the shared secret (chosen at activation time, includes random workflowId + nodeId).

16. **Webhook expiration — never.** Mailchimp list webhooks don't expire. V2 does NOT register a renewal handler with `subscriptionRegistry` for Mailchimp (mirrors Slice 11 / Stripe and Slice 12 / Shopify and Slice 13 / HubSpot).

17. **Webhook dedup key — `sha256(rawBody)`.** Mailchimp webhook payloads have no native event id. V2 hashes the canonical raw body for cross-retry stability — Mailchimp re-sends identical payloads on retry (no retry-id rotation per Mailchimp docs). V2's `webhook_event_dedup` keyed on `(provider='mailchimp', dedupeKey=sha256(rawBody))`.

18. **Webhook receive route — `/api/webhooks/mailchimp`** (per-trigger URL with `?workflowId=&nodeId=` like V1 — this is necessary because Mailchimp webhooks are per-audience, not per-app, AND the URL is the only authentication signal). Routing logic:
    1. Read query params: `workflowId`, `nodeId`. Reject with 400 if missing.
    2. Read form body. Mailchimp's `Content-Type: application/x-www-form-urlencoded` with `data[...]` bracket-notation keys.
    3. Look up `trigger_resources` for `(workflow_id, node_id, provider='mailchimp', status='active')`. Reject with 404 if absent (the workflow may have been deactivated).
    4. Read top-level `type` field from form body. Reject with 200 OK (silent ignore) if `type` is not in the trigger's stored `eventTypes` allowlist — Mailchimp may deliver event types we didn't subscribe to if the webhook configuration drifted.
    5. Validate `data[list_id]` matches the trigger's stored `audienceId`. Reject with 200 OK (silent ignore) on mismatch.
    6. Compute `dedupeKey = sha256(rawBody)`. Pass to `executeWebhookWorkflow`.
    7. Return 200 OK with `{ ok: true, dispatched: 1 }` (or `{ ok: true, ignored: true }` if dedup blocked).
    8. **GET handler:** verification handshake — return 200 OK with empty body. Mailchimp tests the webhook URL on creation and disables it if the GET fails.

19. **No webhook payload normalization in the receive route.** V1's `transformMailchimpPayload` normalizes to flat fields. V2 forwards the raw form-decoded payload under `payload` AND ships a separate `normalize()` helper in `_shared/mailchimp/webhooks/normalize.ts` that workflow authors can opt into. Same precedent as Stripe / Shopify / HubSpot.

20. **No new DB migrations.** Slice 14 uses existing tables (`integrations`, `trigger_resources`, `webhook_event_dedup`). No Mailchimp-specific schema additions. The deferred subscriber-added-to-segment trigger would need a separate table for per-tag baseline state — by deferring that trigger we avoid the migration.

---

## Webhook signature decision — explicit

The outline says "Implement Mailchimp signature verification if current docs/V1 confirm the scheme." **Both V1 and current Mailchimp docs confirm there is no signature scheme to implement.**

- V1's receive route: no signature verification.
- Mailchimp Marketing API webhook docs (current): no `X-Mailchimp-Signature` header documented; no shared secret beyond the webhook URL itself; verification model is URL secrecy + GET handshake on create.
- The closest analog is Mailchimp Transactional (Mandrill), which DOES sign with `X-Mandrill-Signature` — but Transactional is a separate product with separate auth, deferred per outline.

Slice 14 ships the receive route WITHOUT signature verification, but adds **three URL-based authentication layers** (workflowId/nodeId match → audienceId match → eventType allowlist match) so an attacker who knows the URL can only fire events that match a real workflow's configuration. The receive route is documented as `provider="mailchimp"` in `webhook_event_dedup` so audit logs separate Mailchimp from signed-webhook providers.

If a future webhook-signing capability is added by Mailchimp, the `_shared/mailchimp/webhooks/signature.ts` placeholder file gives a clear extension point. For now it explains the absence with a doc comment.

---

## V1 patterns to keep

1. **Duplicate-URL recovery on webhook create.** V1's `onActivate` ([MailchimpTriggerLifecycle.ts:218-302](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L218)) handles the `"can't set up multiple WebHooks"` error by listing existing webhooks for the audience, finding the matching URL, and PATCHing the events on the existing webhook. V2 keeps this — reactivation after `trigger_resources` rows were deleted but the Mailchimp-side webhook was not is a real scenario.
2. **Polling-trigger baseline snapshot on activate.** V1's `captureInitialSnapshot` ([line 536](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MailchimpTriggerLifecycle.ts#L536)) is the polling first-poll-miss fix. V2 ports the pattern per polling-trigger family (one snapshot per trigger type, persisted in `trigger_resources.config.mailchimpSnapshot`).
3. **MD5 email hash helper.** Mailchimp's subscriber endpoints require `/lists/{id}/members/{md5(lowercase email)}`. V1 inlines this in every handler. V2 centralizes in `_shared/mailchimp/api/_subscriberHash.ts`.
4. **Form-encoded webhook body transform.** V1's `transformMailchimpPayload` converts bracket-notation form keys (`data[email]`, `data[merges][FNAME]`) into a flat normalized object. V2 ports to `_shared/mailchimp/webhooks/normalize.ts` and offers it as opt-in.

---

## V1 patterns to skip

1. **`oauth_with_refresh` classification.** V1's `authSchemes.ts:64` lie — refresh is never attempted; V2 honest-state declares non-refreshable.
2. **Runtime `dc` refetch fallback.** V1's `getMailchimpAuth` ([utils.ts:37-75](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/utils.ts#L37)) re-fetches metadata on every action if dc is missing and writes it back. Slow on cold paths; masks data drift. V2 captures dc at OAuth callback deterministically; missing dc → fail loud.
3. **`subscriber_added_to_segment` polling.** V1's all-tags-mode caps at 20 static segments × 1000 members each per poll. Cap is hacky, dedup story is fragile, and per the outline this trigger is acceptably deferred.
4. **`segment_updated` polling.** Low product value.
5. **`new_audience` polling.** Low product value.
6. **`send_campaign` action and `create_campaign` action.** V1 ships these; V2 omits from Batch 1. Email-sending is a higher-stakes Q11 surface that deserves its own follow-up slice with explicit consent fields, preview-text recommendations, and a `from_name` defaults audit.
7. **eCommerce API.** Out of scope per outline.
8. **Mandrill / Transactional API.** Out of scope per outline.
9. **`getSubscribers` (bulk listing).** Bulk listing is a UI/dropdown helper, not a workflow primitive. Workflows that need per-subscriber lookup use `get_subscriber` by email.
10. **`scheduleCampaign`, `getCampaignStats`, `getCampaign` actions.** All campaign-level surfaces; deferred along with the campaign builder per outline.
11. **Mailchimp-specific `data` route at `/api/integrations/mailchimp/data`.** V2 doesn't ship per-provider data routes (different architectural choice; see HubSpot Slice 13 audit for the same call-out). Workflow config UIs query the generic integration data path.

---

## External setup checklist

To run Slice 14's e2e against real Mailchimp (optional — mock server owns the boundary for the test suite):

1. **Mailchimp account** at mailchimp.com (free tier works).
2. **Register OAuth app** at `https://login.mailchimp.com/account/oauth2/client/list`:
   - **Redirect URI:** `http://localhost:3001/api/integrations/oauth/mailchimp/callback` (e2e port) or your dev URL.
   - **Scopes:** N/A — Mailchimp doesn't honor scopes; access is account-wide.
3. **Env vars** (for the V2 dev server):
   - `MAILCHIMP_CLIENT_ID` — from app settings.
   - `MAILCHIMP_CLIENT_SECRET` — from app settings.
   - No `MAILCHIMP_DC` env var — the dc is resolved per-integration at OAuth callback time and stored on the integration row.
4. **For e2e:** none of the above is required. The mocked Playwright suite ships throwaway values via `playwright.config.ts` `webServer.env` and the mock server validates them shape-only.

---

## Six-commit shape

| Commit | Scope |
|---|---|
| **1. `docs: slice 14 mailchimp plan`** | THIS DOC. V1 audit + OAuth/refresh decisions + dc-routing decision + webhook signature decision + trigger shape + action list. |
| 2. `feat(mailchimp): manifest + OAuth + dispatcher registration + dc routing foundation` | `integrations/mailchimp/manifest.ts`, `integrations/mailchimp/oauth.ts`, dispatcher entry, `_shared/mailchimp/api/_base.ts` (dc-routing helpers), `_shared/mailchimp/api/_subscriberHash.ts` (MD5 helper), `_shared/mailchimp/api/me.ts` (account+dc resolution on callback). Capabilities honest: `oauth: true`, all others `false`. Refresh throws `RefreshNotSupportedError`. Unit tests cover OAuth + dc resolution + missing-dc-fail-loud + non-refreshable contract. |
| 3. `feat(mailchimp): core subscriber/audience actions` | 10 typed handlers + Zod schemas (`add_subscriber`, `update_subscriber`, `remove_subscriber`, `add_tag`, `remove_tag`, `get_subscriber`, `create_segment`, `create_audience`, `create_custom_event`, `add_note`). `_shared/mailchimp/api/_request.ts` (Bearer auth, JSON, `refreshAndRetry`-wrapped, 401→action_required via Mailchimp's non-refreshable contract), `_shared/mailchimp/errors.ts`. Q11 `requireExplicitField('status')` on `add_subscriber`. `capabilities.actions: true`. |
| 4. `feat(mailchimp): audience_event webhook trigger + V2 hybrid lifecycle` | `_shared/mailchimp/webhooks/signature.ts` (placeholder explaining no-signature model), `_shared/mailchimp/webhooks/normalize.ts` (form-encoded body transform), consolidated `audience_event` trigger with `eventTypes: string[]` multi-select (allowlist: `subscribe`, `unsubscribe`, `profile`, `upemail`, `cleaned`, `campaign`). Activation: `POST /lists/{audienceId}/webhooks` with duplicate-URL recovery (lists existing webhooks, PATCHes if URL match). Deactivation: `DELETE /lists/{audienceId}/webhooks/{id}`. Receive route at `/api/webhooks/mailchimp` with `?workflowId=&nodeId=` routing + audienceId match + eventType allowlist + sha256(rawBody) dedup. GET handler returns 200 OK for verification handshake. `capabilities.webhookTrigger: true`. |
| 5. `feat(mailchimp): polling triggers — email_opened, link_clicked, campaign_created` | Three polling-trigger modules. Each registers an activation hook (snapshot capture) + polling handler (5-min cadence, baseline-then-diff). Polling handler reads previousSnapshot from `trigger_resources.config.mailchimpSnapshot`, fetches current state via `_shared/mailchimp/api/_request.ts`, computes diff (new opens / new clicks / new campaigns), fires `executeWebhookWorkflow` per change with a stable dedupeKey (`${triggerType}:${audienceId}:${campaignId}:${email}:${event_ts}` for opens/clicks; `${triggerType}:${campaignId}` for campaign_created), updates snapshot. `capabilities.pollingTrigger: true`. |
| 6. `test(e2e): add Mailchimp walkthrough with mocked Mailchimp boundary` | `tests/e2e/helpers/mockMailchimpServer.ts` (port TBD, separate from existing mocks). `tests/e2e/slice-14-mailchimp-walkthrough.spec.ts`. Asserts: OAuth state consumed, encrypted token storage (no refresh token persisted), dc captured and used for API host routing, missing-dc-fails-loud, 10 actions exercised via at least one representative each (likely `add_subscriber` covers most surface), webhook trigger activation creates webhook with duplicate-URL recovery, webhook delivery dispatches workflow with sha256-dedup blocking replay, GET handshake returns 200, polling trigger baseline snapshot captured on activate, second poll detects diff and dispatches workflow, polling first-poll-miss prevented (no dispatch on the activation poll), non-refreshable 401 → action_required signal. |

---

## Validation gates (per commit)

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For the final e2e commit (Commit 6), run all 14 provider walkthroughs in order + Slice 14 twice for stability:

```bash
npx playwright test tests/e2e/slice-1-slack-walkthrough.spec.ts
npx playwright test tests/e2e/slice-2f-gmail-walkthrough.spec.ts
npx playwright test tests/e2e/slice-3b-google-calendar-walkthrough.spec.ts
npx playwright test tests/e2e/slice-4b-google-drive-walkthrough.spec.ts
npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts
npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts
npx playwright test tests/e2e/slice-7-outlook-calendar-walkthrough.spec.ts
npx playwright test tests/e2e/slice-8-onedrive-walkthrough.spec.ts
npx playwright test tests/e2e/slice-9-notion-walkthrough.spec.ts
npx playwright test tests/e2e/slice-10-airtable-walkthrough.spec.ts
npx playwright test tests/e2e/slice-11-stripe-walkthrough.spec.ts
npx playwright test tests/e2e/slice-12-shopify-walkthrough.spec.ts
npx playwright test tests/e2e/slice-13-hubspot-walkthrough.spec.ts
npx playwright test tests/e2e/slice-14-mailchimp-walkthrough.spec.ts
npx playwright test tests/e2e/slice-14-mailchimp-walkthrough.spec.ts
```

---

## Stop-and-report rules (per CLAUDE.md)

- **Anything that grows beyond a Mailchimp-specific change** — for example, if dc-routing needs to be generalized into a per-integration-base-URL primitive that other providers will share — STOP and report.
- **If V1 vs current Mailchimp docs disagree on OAuth refresh behavior** — STOP and confirm before implementing. (Already confirmed: V1 hardcodes `refresh_token: null` and Mailchimp issues none; V2's `refreshable: false` is correct.)
- **If V1 vs current Mailchimp docs disagree on webhook signature support** — STOP and confirm before adding signature verification. (Already confirmed: no signature scheme.)
- **If the `subscriber_added_to_segment` deferral becomes a hard product requirement before Slice 14 ships** — STOP and discuss; revisiting the 20-tag-cap hackiness needs design before reintroducing the trigger.
