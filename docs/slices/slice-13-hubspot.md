# Slice 13 — **HubSpot** provider port

**Branch:** `slice-13-hubspot` (off `slice-12-shopify` @ `7ac05ab05`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port HubSpot from V1 as **V2's first CRM provider** AND **V2's first app-level webhook with global-app-secret HMAC verification + per-portal multi-tenant routing**. Ships an OAuth dispatcher entry (form-encoded body-auth, refreshable, no-PKCE, dual-endpoint hub-id resolution), ~22 typed action handlers covering CRM v3 standard objects (contacts / companies / deals / tickets / engagements / line items / products), plus a single consolidated `webhook_received` trigger that dispatches per HubSpot `subscriptionType` discriminator.

Slice 13 introduces **two genuinely new V2 patterns**:

1. **App-level shared webhook subscriptions with reference-counted lifecycle.** Every existing V2 webhook provider (Slack, Stripe, Shopify, Airtable, Microsoft Graph, Google) creates ONE webhook resource per workflow per trigger type. **HubSpot does not work that way.** Public Apps have a *single* webhook target URL configured globally in the developer-portal app settings; programmatic subscriptions live at the app level (`/webhooks/v3/{appId}/subscriptions`) keyed by `(appId, eventType, propertyName?)` — NOT per portal, NOT per workflow. ALL events from ALL installs of the app POST to ONE configured URL. V2 cannot fake "one subscription per workflow" — HubSpot returns `409 already exists` on the second create with the same `(eventType, propertyName)`. **This requires reference-counted shared subscriptions** so the first workflow asking for `contact.creation` creates the app-level subscription, additional workflows just bump a refcount, and the subscription is only deleted when the last workflow deactivates. **DESIGN CHECKPOINT REACHED — see §"Design checkpoint" below. Commit 1 stops here for user direction before Commit 5 lands the lifecycle.**
2. **HubSpot V3 webhook signature verification.** `X-HubSpot-Signature-V3` is HMAC-SHA256-base64 over a canonical string `${requestMethod}${requestUri}${rawBody}${requestTimestamp}` keyed with the **client secret** (not a per-subscription secret). The `X-HubSpot-Request-Timestamp` header drives a **5-minute replay tolerance** (per current HubSpot docs). This is **distinct from every existing V2 signature shape**: Slack hex-of-`v0:${ts}:${body}`, Stripe `t=,v1=hex` over `${t}.${body}`, Airtable hex-of-raw-body keyed per-webhook, Shopify base64-of-raw-body keyed app-secret no-timestamp. Slice 13 adds `_shared/hubspot/webhooks/signature.ts` as the canonical-string-builder + verifier. Critically, **V1 ships zero signature verification** ([`app/api/webhooks/hubspot/route.ts:62`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/hubspot/route.ts#L62) calls `req.json()` immediately) — Slice 13 closes this real security gap during the port.

Slice 13 also **uses the Shopify-style consolidated trigger** — `webhook_received` with `subscriptionType` discriminator (e.g. `"contact.creation"`, `"deal.propertyChange"`) — collapsing V1's 17 separate trigger node types into ONE V2 trigger.

---

## Design checkpoint — STOP for user direction

**Confirmed via V1 audit + cross-check against current HubSpot Webhooks API docs:**

V1 creates ONE `subscriptions` POST per workflow ([`HubSpotTriggerLifecycle.ts:129-148`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts#L129)) and stores the `subscription.id` in `trigger_resources.external_id` ([`HubSpotTriggerLifecycle.ts:159-177`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts#L159)). Each subscription carries a `targetUrl` per workflow with `?workflowId=...` (V1's [`HubSpotTriggerLifecycle.ts:378`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts#L378)).

**This V1 model is broken at scale.** HubSpot's actual webhook API:

- Each Public App has ONE globally-configured webhook URL (set in the developer-portal app-settings UI, NOT programmable per-subscription).
- Subscriptions are keyed `(appId, eventType, propertyName?)` — UNIQUE. A second create with the same key returns `409 SubscriptionAlreadyExistsException`.
- ALL events from ALL portals where the app is installed POST to the ONE configured URL. The payload identifies its source portal via top-level `portalId`.
- The `targetUrl` field on subscription create is **not honored** at delivery time — it exists in the API for legacy reasons but does not override the app-level webhook URL.

**V2 cannot replicate V1's "one subscription per workflow with workflowId in targetUrl"** without:
1. Hitting `409 SubscriptionAlreadyExistsException` the moment two workflows in two different portals (or even one portal) want the same `(eventType, propertyName)`.
2. Routing webhooks to `?workflowId=X` URLs that HubSpot does not actually call — they call the app's configured global URL.

**The correct V2 design needs three pieces of new infrastructure:**

### Option A — Shared subscriptions with portal-scoped reference counting (recommended)

- **New table `hubspot_app_subscriptions`** keyed `(appId, eventType, propertyName)` UNIQUE. Columns: id, app_id, event_type, property_name, hubspot_subscription_id, status, created_at, updated_at. Lifecycle: create-on-first-activate / delete-on-last-deactivate.
- **New table `hubspot_subscription_refs`** keyed `(subscription_id, workflow_id, node_id)` UNIQUE. Columns: id, subscription_id (FK), workflow_id, user_id, node_id, hub_id, status, config, created_at. One row per workflow that wants the subscription. Reference count = `count(*)` per `subscription_id`.
- **Activation flow:** workflow X with trigger config `{ subscriptionType: "contact.creation" }` →
  1. Look up `hubspot_app_subscriptions` row for `(appId, "contact.creation", null)`.
  2. If absent: `POST /webhooks/v3/{appId}/subscriptions` with the eventType — create the row, store the HubSpot subscription id.
  3. If present (or just created): insert a `hubspot_subscription_refs` row for this workflow.
  4. Idempotent — re-running activation for the same workflow no-ops on the ref row (`ON CONFLICT DO NOTHING`).
- **Deactivation flow:** delete the `hubspot_subscription_refs` row for this workflow → if `count(*)` for the subscription_id is now zero, `DELETE /webhooks/v3/{appId}/subscriptions/{id}` and delete the `hubspot_app_subscriptions` row.
- **Receive-route routing:** webhook arrives at `/api/webhooks/hubspot` (the app's globally-configured URL, no `?workflowId=`). Parse payload's `portalId` + `subscriptionType`. Look up `integrations` row by `(provider='hubspot', accountMetadata->>'hubId' = portalId)` to find the user. Look up `hubspot_subscription_refs` rows joined on `hubspot_app_subscriptions(eventType=subscriptionType)` filtered by that user's workflows. Dispatch each matching workflow.

  This is "portal → user → workflows" routing, NOT "URL query param → workflow" routing. It is the only correct implementation given HubSpot's API.

- Auth scope adds: `oauth` scope must be present (already in the V1 scope list — see §"OAuth model" below).
- Migration risk: creating two new tables is the first time Slice X has done so since slice 6. The migrations are simple inserts (no destructive ops), but they are real schema additions.

### Option B — Single dev-account install (simpler, doesn't scale)

- Skip the new tables. Skip reference counting.
- Per-workflow logic at activate time: try `POST /webhooks/v3/{appId}/subscriptions` — on `409`, list existing subscriptions, find the one matching `eventType`, store its id in `trigger_resources.external_id` like V1 does.
- Receive-route still has to route by `portalId + subscriptionType` (HubSpot delivers to one global URL no matter what), so the routing logic from Option A ships either way.
- **Limitation:** when the first user deactivates their workflow, the app-level subscription gets deleted, breaking webhook delivery for any other user/workflow that was relying on it. Acceptable only if the app is single-tenant (one HubSpot install).
- Effort: ~½ day less than Option A. Suitable for a private/internal HubSpot app or a dev-only port; **NOT suitable for a public-app multi-customer launch**.

### Option C — Defer Slice 13's trigger entirely; ship Commits 1–4 (OAuth + actions only) now

- Get HubSpot CRUD actions live in V2 first. Skip the webhook trigger. Slice 13 ends after Commit 4.
- A future slice (Slice 13.5 / Slice 14-prereq) lands the shared-subscription primitive once the design is more deeply validated.
- Workflows can use HubSpot as an **action target** triggered by other providers (Slack message → create HubSpot contact, Stripe event → update HubSpot deal). They cannot **be triggered by** HubSpot events until the follow-up.
- Effort: smallest. No new infrastructure. Ships value sooner.

### Recommendation

**Option A** is the correct multi-tenant design and the user's stated reason for picking HubSpot was specifically to validate "app-level webhook with global app secret + per-workflow routing". But that exact rationale is the thing the V1-style query-param approach can't actually deliver — the routing is per-portal, not per-workflow-via-URL. Option A delivers what the user wants, just with the schema needed to implement it correctly.

**Option B** is acceptable as a stepping stone if the user wants minimum schema churn this slice and is OK with single-tenant HubSpot apps for now.

**Option C** is the lowest-risk way to get HubSpot value live — the trigger work becomes a separate, focused future slice.

**STOP HERE.** Commit 1 (this plan doc) is the decision-forcing function. Commits 2–6 should not start until the user picks Option A / B / C.

---

## Why HubSpot now

1. **First CRM provider in V2.** Highest-requested non-messaging integration category in V1 telemetry; CRM is consistently a top-3 category for any automation platform.
2. **Validates app-level webhook patterns.** Even on Option B / C, the fact that HubSpot's webhook URL is global per app (vs Stripe/Shopify per-tenant) is a new pattern V2 hasn't exercised. The `_shared/hubspot/webhooks/signature.ts` helper future-proofs other public-app integrations (Atlassian, Asana, Pipedrive).
3. **Closes a real V1 security gap.** V1's HubSpot webhook receiver does NOT verify `X-HubSpot-Signature-V3` — see [`app/api/webhooks/hubspot/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/hubspot/route.ts) (entire file is `req.json()` then dispatch). V2 fixes this during the port.
4. **Strong reusable code with surgical fixes needed.** V1 has ~22 typed action handlers in [`lib/workflows/actions/hubspot/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot) that translate cleanly to V2's `_shared/hubspot/api/_request.ts` pattern. The duplicate-contact 409 regex (`/Existing ID: (\d+)/`) at [`hubspot.ts:182`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L182) is replaced with a deterministic `search-then-PATCH` flow during the port.
5. **Light external setup.** Free HubSpot Developer Account → create one Public App → `HUBSPOT_CLIENT_ID` + `HUBSPOT_CLIENT_SECRET` + `HUBSPOT_APP_ID`. Mock owns the boundary for e2e — no real HubSpot credentials needed for the test suite to pass green.

---

## V1 audit — paths and findings

### Manifest / node definitions (V1 has 17 triggers + ~30 actions)

- Main manifest: [`lib/workflows/nodes/providers/hubspot/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/hubspot/index.ts) — 9 trigger types + 8 action types declared inline.
- Split trigger files in [`lib/workflows/nodes/providers/hubspot/triggers/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/hubspot/triggers):
  - `tickets.ts` — 3 triggers (created/updated/deleted)
  - `engagements.ts` — 4 triggers (note/task/call/meeting created)
  - `forms.ts` — 1 trigger (form submission)
- Split action files in [`lib/workflows/nodes/providers/hubspot/actions/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/hubspot/actions):
  - `tickets.ts` — 3 actions (create/update/get)
  - `engagements.ts` — 4 actions (create note/task/call/meeting)
  - `lineItems.ts` — 4 actions (create/update/remove/get)
  - `productManagement.ts` — 3 actions (create/update/get)
  - `listManagement.ts` — 1 action (remove from list)
  - `workflowManagement.ts` — 2 actions (add to / remove from automation workflow)
  - `utilities.ts` — 3 actions (get owners/forms/deal-pipelines)
  - `updateContact.ts`, `updateCompany.ts` — 2 actions
- Inline action implementations in [`lib/workflows/actions/hubspot.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts) — `createHubSpotContact` / `createHubSpotCompany` / `createHubSpotDeal` / `addContactToHubSpotList` / `updateHubSpotDeal`.
- Modular split handlers in [`lib/workflows/actions/hubspot/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot) — 25 files covering tickets / engagements / line items / products / lists / owners / workflows / forms / deal-pipelines / get_*.

### OAuth flow

- Config: [`lib/integrations/oauthConfig.ts:386-404`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L386).
  - `authEndpoint: "https://app.hubspot.com/oauth/authorize"`.
  - `tokenEndpoint: "https://api.hubapi.com/oauth/v1/token"`.
  - `authMethod: "body"` — `client_id` + `client_secret` go in the form body, NOT a Basic auth header.
  - `refreshTokenExpirationSupported: false` — refresh tokens themselves do not expire and are not rotated. Access tokens expire (~6h) with a 30s buffer.
  - `sendRedirectUriWithRefresh: true` — refresh body MUST include `redirect_uri`.
- Auth-URL generator: [`app/api/integrations/auth/generate-url/route.ts:778-816`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts#L778).
  - **NO PKCE.** V1 generates `codeVerifier = crypto.randomBytes(32).toString("hex")` and writes it to the `pkce_flow` table — but the verifier is **never sent in the authorize URL** (no `code_challenge` / `code_challenge_method` params at line 805-813). It's dead code. **V2 will not implement PKCE either** — keeps the port aligned with the actual HubSpot Public App OAuth config and keeps the dispatcher entry simple.
- Token / refresh body shape: form-urlencoded with `grant_type=authorization_code`, `client_id`, `client_secret`, `redirect_uri`, `code` (or `refresh_token` for refresh).
- Token-exchange response transform: [`provider-registry.ts:555-602`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L555). `tokenData.refresh_token || null` (preserve refresh on rotation, accept null otherwise).
- Hub-id / portal resolution — **dual endpoint**:
  - Primary: `GET https://api.hubapi.com/oauth/v1/access-tokens/{accessToken}` returns `{ user, user_id, hub_id, hub_domain }` ([provider-registry.ts:566-579](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L566)).
  - Fallback: `GET https://api.hubapi.com/integrations/v1/me` with `Authorization: Bearer {token}` returns `{ user, hubDomain, userId, portalId }` ([provider-registry.ts:585-600](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L585)).
  - V2 stores `hub_id` (numeric → string-cast) as `providerAccountId` AND mirrors `hub_domain`, `user`, `user_id` into `accountMetadata`.

### Action handlers — V1 endpoints + quirks

- All actions use Bearer auth: `Authorization: Bearer ${accessToken}`.
- Body content-type: JSON.
- No idempotency keys (HubSpot has no equivalent of Stripe's `Idempotency-Key`).
- 401 handling: ad-hoc per handler — V2 wraps every action in `refreshAndRetry` (HubSpot is `oauth_with_refresh`, so 401 → refresh-once → retry).
- Duplicate handling: V1 regex-extracts existing record id from error message — see §"V1 rot to fix" below.
- Sample endpoints:
  - `POST /crm/v3/objects/contacts` (create) — [hubspot.ts:11-444](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L11).
  - `POST /crm/v3/objects/companies` (create) — [hubspot.ts:446](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L446).
  - `POST /crm/v3/objects/deals` (create) — [hubspot.ts:786](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L786).
  - `POST /crm/v3/objects/tickets` (create ticket with attachments) — [hubspot/createTicket.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createTicket.ts).
  - `POST /crm/v3/lists/{listId}/memberships/add-by-email` (add to list) — [hubspot.ts:566](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L566).
  - `GET /crm/v3/objects/{type}/search` (get_*) — across get_contacts/get_companies/get_deals.

### Triggers / webhooks

- Lifecycle: [`lib/triggers/providers/HubSpotTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts). Webhook-only (no polling). Activation hits `POST /webhooks/v3/{appId}/subscriptions` with `{ eventType, targetUrl, active: true }`. Deactivation hits `DELETE /webhooks/v3/{appId}/subscriptions/{id}`.
- Receive route: [`app/api/webhooks/hubspot/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/hubspot/route.ts). **No signature verification** ([line 62](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/hubspot/route.ts#L62) calls `req.json()` immediately).
- Routing: query-param `workflowId` is OPTIONAL ([line 101](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/hubspot/route.ts#L101)). Without it, V1 looks up `trigger_resources` by `provider='hubspot' AND trigger_type=X AND status=active` — **no portal isolation** (events from User A's portal could match User B's workflow with the same trigger type).
- Dedup: none in V1's receive route.

### Shared utilities / scope model

- Scopes: [`lib/integrations/hubspotScopes.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/hubspotScopes.ts) — 18 scopes total, statically declared, joined with spaces.
- Shared payload normalize: [`lib/webhooks/hubspotWebhookUtils.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/webhooks/hubspotWebhookUtils.ts) — `buildHubSpotTriggerData()` + `shouldSkipByConfig()` + `normalizeIdList()` for assoc parsing.
- Inline OAuth helper: [`lib/hubspot.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/hubspot.ts) — just exports `hubspotConfig` (clientId/secret/redirectUri).

### Tests

- One test file: [`__tests__/workflows/v2/hubspotWebhookUtils.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/v2/hubspotWebhookUtils.test.ts) — 10 cases on the webhook normalize helper.
- ZERO action-handler tests, ZERO OAuth tests, ZERO lifecycle tests.

---

## Confirmed scope decisions

1. **New provider id — `hubspot`.** Standard V2 provider folder (`integrations/hubspot/`) + dispatcher entry. One HubSpot integration per (user, hubId).
2. **OAuth — refreshable + form-urlencoded body-auth + no PKCE.** Manifest declares `refreshable: true`. Token exchange POSTs `https://api.hubapi.com/oauth/v1/token` with `application/x-www-form-urlencoded` body containing `grant_type`, `client_id`, `client_secret`, `redirect_uri`, `code`. No PKCE. Refresh body shape identical with `grant_type=refresh_token` + `refresh_token`. Refresh response: HubSpot may or may not return a new `refresh_token` — V2 preserves the original when omitted (mirrors V2's Stripe pattern). Validates V2's existing `refreshAndRetry` contract for body-auth + form-encoded providers (Notion was the precedent).
3. **OAuth scopes — exactly the 18 V1 ships.** `crm.objects.contacts.read/write`, `crm.objects.companies.read/write`, `crm.objects.deals.read/write`, `crm.objects.line_items.read/write`, `crm.objects.products.read/write`, `crm.objects.owners.read`, `crm.lists.read/write`, `crm.schemas.deals.read`, `tickets`, `automation`, `forms`, `oauth`. The `oauth` scope is REQUIRED for basic OAuth functionality. The `automation` scope covers workflow-management actions (deferred from Batch 1/2 — see action list below). Defer `webhooks` scope (NOT needed for activation — app-level subscriptions are managed with the user's standard CRM-write scopes per current HubSpot docs).
4. **`tokenScope` — `user`.** One HubSpot integration per (user, `providerAccountId=hubId`). Re-authorizing to a different portal creates a sibling integration row.
5. **`accountIdField` — `hubId`.** Stored as the string-cast of the numeric portal id. Stable for the life of the portal. V1's dual-endpoint resolution (access-tokens primary, integrations/v1/me fallback) ports to V2 as a single helper in `_shared/hubspot/api/me.ts`.
6. **Token caching shape.** Access token + refresh token both encrypted (AES-256-GCM) on `integrations.access_token_encrypted` / `refresh_token_encrypted`. `accessTokenExpiresAt` populated from `expires_in` (HubSpot returns ~21600 seconds = 6h).
7. **Health check interval — 4h.** Mid-tier (between Google/Microsoft 6h and "other" 12h). HubSpot CRM is high-traffic; a 4h `GET /oauth/v1/access-tokens/{token}` ping confirms the token still works and surfaces revocation faster.
8. **Action surface — Batch 1: 10 actions** covering CRM core (contacts + companies + deals + add-to-list).
9. **Action surface — Batch 2: 12 actions** covering tickets + engagements + line items + products + owners.
10. **Defer:** `add_to_workflow`, `remove_from_workflow` (HubSpot automation API — surface-heavy and non-CRM), `get_forms` (already covered by trigger config UI), `get_deal_pipelines` (UI dropdown helper, not a workflow primitive), `get_products`, `update_product` move to Batch 2 only if we can keep the surface bounded, `remove_from_list` (mirror of add but rarely used), `get_line_items`, `remove_line_item`. `update_line_item` keeps the schema lean.
11. **One consolidated trigger — `webhook_received`** with `subscriptionType` discriminator. V1's 17 separate trigger types collapse into one. Trigger config presents a multi-select of supported subscription types. Activation creates ONE app-level subscription per unique `(eventType, propertyName)` selected — NOT per workflow (Option A above). Plus optional `propertyName` filter for `*.propertyChange` types.
12. **Subscription type allowlist (Batch 1) — 10 subscription types** mapping to V1's 17:
    - `contact.creation`, `contact.propertyChange`, `contact.deletion`
    - `company.creation`, `company.propertyChange`, `company.deletion`
    - `deal.creation`, `deal.propertyChange`, `deal.deletion`
    - `ticket.creation`
    - Defer: `ticket.propertyChange`, `ticket.deletion`, `note.creation`, `task.creation`, `call.creation`, `meeting.creation`, `form.submission` (the form trigger requires a different subscription model — `forms` API not `webhooks/v3`).
    - Allowlist lives as a const in `integrations/hubspot/triggers/webhookReceived/allowedSubscriptionTypes.ts`.
13. **Webhook signature — HMAC-SHA256-base64 of canonical string.** Canonical string per current HubSpot docs: `${requestMethod}${requestUri}${rawBody}${requestTimestamp}` where `requestTimestamp` comes from header `X-HubSpot-Request-Timestamp`. Keyed with `HUBSPOT_CLIENT_SECRET`. **5-minute replay tolerance** (reject if timestamp is more than 5 min old or in the future). Constant-time compare via `crypto.timingSafeEqual`. Builds on Slice 11's Stripe pattern but with a more elaborate canonical string. V1 has zero verification — Slice 13 closes this.
14. **Webhook expiration — never.** App-level subscriptions don't expire. V2 does NOT register a renewal handler with `subscriptionRegistry` for HubSpot (mirrors Slice 11 / Stripe and Slice 12 / Shopify).
15. **Webhook dedup key — eventId** (HubSpot delivers `eventId` as a top-level field in each event in the payload's events array). V2's `webhook_event_dedup` keyed on `(provider='hubspot', eventId)`. Note: HubSpot batches multiple events into one POST — receive route iterates `payload[]` (an array of events), dedups each by `eventId`, dispatches each as a separate `TriggerEvent`.
16. **Webhook receive route — `/api/webhooks/hubspot`** (single global URL, NO `?workflowId=` query param — the URL is configured in HubSpot's app settings, not per-subscription). Routing logic:
    1. Read `X-HubSpot-Signature-V3` header + `X-HubSpot-Request-Timestamp` header.
    2. Capture raw body bytes BEFORE JSON parse.
    3. Verify signature against `HUBSPOT_CLIENT_SECRET`. Reject 401 on mismatch / missing / replay-window violation.
    4. Parse body as array of events. For each event:
       a. Look up the user via `integrations.providerAccountId = event.portalId` (string-cast).
       b. Look up active workflow trigger refs for this user with subscription_type matching `event.subscriptionType`.
       c. Dedup by `eventId` against `webhook_event_dedup`.
       d. Dispatch each match.
    5. Return 200 with summary `{ ok: true, dispatched: N }`.
17. **No webhook payload normalization in receive.** V1's `buildHubSpotTriggerData` normalizes to flat fields. V2 forwards the raw HubSpot event under `payload`. Same precedent as Stripe (Slice 11) and Shopify (Slice 12). Workflows reference `{{nodeId.payload.objectId}}` / `{{nodeId.payload.propertyName}}` / `{{nodeId.payload.propertyValue}}` directly.
18. **Per-trigger-config filtering moves into the workflow's logic node.** V1 has receive-route filters (`shouldSkipByConfig`). V2 doesn't ship these — workflow logic-nodes (filter, branch) cover them.
19. **Q11 explicit consent gate not applicable.** HubSpot CRM actions don't have direct customer-notification side effects on the actions in Batch 1 / 2. (Marketing emails are deferred — Forms and email-sends are NOT in Batch 1 or 2.) No `notify_customer`-style required-explicit-choice fields needed for this slice.
20. **Two new DB migrations needed if Option A approved:**
    - `hubspot_app_subscriptions` — keyed `(app_id, event_type, property_name)` UNIQUE. Tracks the actual HubSpot subscriptions.
    - `hubspot_subscription_refs` — FK to `hubspot_app_subscriptions` and `workflows`. Tracks which workflows reference each subscription.
    - **No new migration if Option B or C** — Option B reuses `trigger_resources`, Option C ships no trigger.

---

## Action Batch 1 — 10 CRM-core actions

| Action | V1 source | Endpoint | Notes |
|---|---|---|---|
| `create_contact` | [hubspot.ts:11](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L11) | `POST /crm/v3/objects/contacts` | Q duplicate handling — replace V1's regex-extract-existing-id with deterministic `search-by-email + PATCH` flow. Required: `email`. |
| `update_contact` | [hubspot/updateContact.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/updateContact.ts) | `PATCH /crm/v3/objects/contacts/{id}` | Required: `contactId`. |
| `get_contacts` | [hubspot/getContacts.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/getContacts.ts) | `POST /crm/v3/objects/contacts/search` | Filter + sort + pagination via cursor. |
| `create_company` | [hubspot.ts:446](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L446) | `POST /crm/v3/objects/companies` | Required: `domain` OR `name`. Same 409-handling fix. |
| `update_company` | [hubspot/updateCompany.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/updateCompany.ts) | `PATCH /crm/v3/objects/companies/{id}` | Required: `companyId`. |
| `get_companies` | [hubspot/getCompanies.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/getCompanies.ts) | `POST /crm/v3/objects/companies/search` | |
| `create_deal` | [hubspot.ts:786](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L786) | `POST /crm/v3/objects/deals` | Required: `dealname`, `pipeline`, `dealstage`. |
| `update_deal` | [hubspot.ts:684](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L684) | `PATCH /crm/v3/objects/deals/{id}` | Required: `dealId`. |
| `get_deals` | [hubspot/getDeals.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/getDeals.ts) | `POST /crm/v3/objects/deals/search` | |
| `add_contact_to_list` | [hubspot.ts:566](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L566) | `POST /crm/v3/lists/{listId}/memberships/add-by-email` | Required: `listId`, `email`. |

## Action Batch 2 — 12 secondary CRM actions

| Action | V1 source | Endpoint | Notes |
|---|---|---|---|
| `create_ticket` | [hubspot/createTicket.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createTicket.ts) | `POST /crm/v3/objects/tickets` | Attachments deferred (V1 has them; needs file-storage abstraction in V2 — separate slice). Required: `subject`, `hs_pipeline`, `hs_pipeline_stage`. |
| `update_ticket` | [hubspot/updateTicket.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/updateTicket.ts) | `PATCH /crm/v3/objects/tickets/{id}` | |
| `get_tickets` | [hubspot/getTickets.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/getTickets.ts) | `POST /crm/v3/objects/tickets/search` | |
| `create_note` | [hubspot/createNote.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createNote.ts) | `POST /crm/v3/objects/notes` | Required: `hs_note_body`. Optional `hs_timestamp`, `hubspot_owner_id`, associations. |
| `create_task` | [hubspot/createTask.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createTask.ts) | `POST /crm/v3/objects/tasks` | Required: `hs_task_subject`. |
| `create_call` | [hubspot/createCall.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createCall.ts) | `POST /crm/v3/objects/calls` | |
| `create_meeting` | [hubspot/createMeeting.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createMeeting.ts) | `POST /crm/v3/objects/meetings` | |
| `create_line_item` | [hubspot/createLineItem.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createLineItem.ts) | `POST /crm/v3/objects/line_items` | Required: `hs_product_id` OR `name`, `quantity`. |
| `update_line_item` | [hubspot/updateLineItem.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/updateLineItem.ts) | `PATCH /crm/v3/objects/line_items/{id}` | |
| `create_product` | [hubspot/createProduct.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/createProduct.ts) | `POST /crm/v3/objects/products` | Required: `name`. |
| `update_product` | [hubspot/updateProduct.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/updateProduct.ts) | `PATCH /crm/v3/objects/products/{id}` | |
| `get_owners` | [hubspot/getOwners.ts](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/getOwners.ts) | `GET /crm/v3/owners/` | Pagination via `limit` + `after`. |

**Deferred:** `get_line_items`, `remove_line_item`, `get_products`, `remove_from_list`, `add_to_workflow`, `remove_from_workflow`, `get_forms`, `get_deal_pipelines`. Each is either a UI helper (forms/pipelines used in dropdowns), a duplicate of existing functionality (remove_from_list), or surface-heavy automation API (`add_to_workflow` / `remove_from_workflow` need the `automation` scope's full surface and aren't core CRM).

---

## V1 rot to fix during port

1. **No webhook signature verification.** V1's receive route (entire file) accepts unsigned webhooks. **Slice 13 Commit 5 adds full V3 verification** — this is a real security gap closed by the port.
2. **Brittle duplicate-record handling.** V1 regex-extracts existing record id from the 409 error message: `errorData.message?.match(/Existing ID: (\d+)/)` ([hubspot.ts:182](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot.ts#L182)). HubSpot's 409 response body shape isn't guaranteed to include "Existing ID:" — small message changes break duplicate detection. **V2 fix:** on 409, do a deterministic `POST /crm/v3/objects/contacts/search` by email, get the canonical id, then PATCH.
3. **No portal isolation in webhook routing.** V1's receive route runs the workflow lookup with `provider='hubspot' AND trigger_type=X` — no `portalId` filter. Cross-portal event delivery (User A's portal triggering User B's workflow) is theoretically possible. **V2 fix:** Option A's design routes through `integrations.providerAccountId = portalId` first, then to that user's workflows only.
4. **Per-workflow `targetUrl` model that HubSpot doesn't honor.** V1 includes `?workflowId=X` in each subscription's `targetUrl`. HubSpot's app-level webhook URL overrides this — V1's design depends on HubSpot honoring per-subscription URLs, which is not the documented behavior. **V2 fix:** ship the correct app-level routing (Options A or B above). No `?workflowId=` in any URL.
5. **Subscription "one per workflow" assumption.** V1 attempts a fresh `POST /webhooks/v3/{appId}/subscriptions` per workflow activation. **HubSpot returns 409 on the second create with the same `(eventType, propertyName)`.** V1 doesn't handle this — activation simply throws. **V2 fix:** Option A reference-counts; Option B has explicit 409→reuse-existing-subscription handling.
6. **Dead PKCE code.** V1 generates a `code_verifier` and stores it in `pkce_flow` ([generate-url/route.ts:784-796](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/auth/generate-url/route.ts#L784)) but never sends `code_challenge` in the authorize URL. **V2 doesn't reproduce this** — HubSpot's authorize endpoint doesn't require PKCE for Public Apps as of current docs.
7. **`hubspotDynamic.ts` and `lib/workflows/actions/hubspotDynamic.ts`.** Existence noted; large dynamic field-mapping system. **NOT ported.** V2's typed-schema-per-action approach is structurally cleaner. Workflows that need dynamic field selection use the schema's optional fields directly.

---

## V1 patterns to skip

1. **`STORE_SELECTOR_FIELD`-style multi-portal selector** — N/A (HubSpot is one portal per integration).
2. **Marketing automation API** (`add_to_workflow` / `remove_from_workflow`) — defer.
3. **Forms API** as a trigger source — V1 has `form.submission` subscription; deferred to a future slice.
4. **CMS Hub APIs** — out of scope.
5. **Conversations API / Chat** — out of scope.
6. **Custom objects v3** — Batch 1 + 2 cover STANDARD CRM objects only.
7. **GraphQL** — HubSpot has minimal GraphQL surface; not used in V1; not used in V2.
8. **`hubspotDynamic.ts` runtime field-mapper** — replaced by typed Zod schemas per action.
9. **V1's `hubspotWebhookUtils.shouldSkipByConfig` receive-route filter** — moves to workflow logic nodes.

---

## External setup checklist

To run Slice 13's e2e against real HubSpot (optional — mock server owns the boundary for the test suite):

1. **HubSpot Developer Account** at developers.hubspot.com (free).
2. **Create one Public App** with these settings:
   - **Auth:** OAuth 2.0 enabled. Redirect URI: `http://localhost:3001/api/integrations/oauth/hubspot/callback` (e2e port) or your dev URL.
   - **Scopes:** all 18 from §"Confirmed scope decisions §3" above. The `oauth` scope is mandatory.
   - **Webhooks:** target URL set to `https://<your-public-host>/api/webhooks/hubspot` (must be publicly reachable for real webhooks; ngrok works).
3. **Env vars** (for the V2 dev server):
   - `HUBSPOT_CLIENT_ID` — from app settings.
   - `HUBSPOT_CLIENT_SECRET` — from app settings.
   - `HUBSPOT_APP_ID` — from app settings (numeric; needed for `/webhooks/v3/{appId}/subscriptions` URL construction).
4. **For e2e:** none of the above is required. The mocked Playwright suite ships throwaway values via `playwright.config.ts` `webServer.env` and the mock server validates them shape-only.

---

## Six-commit shape (proposed; awaiting design checkpoint resolution)

| Commit | Scope |
|---|---|
| **1. `docs: slice 13 hubspot plan`** | THIS DOC. Documents Option A / B / C and stops for user direction on the webhook subscription model. |
| 2. `feat(hubspot): manifest + OAuth + dispatcher registration` | `integrations/hubspot/manifest.ts`, `integrations/hubspot/oauth.ts`, dispatcher entry, `_shared/hubspot/api/me.ts` (dual-endpoint hub-id resolution), `_shared/hubspot/api/_base.ts`. Capabilities honest: `oauth: true`, all others `false`. Refresh-token rotation preserves original on omitted response. Unit tests cover OAuth + scope + hub-id resolution. |
| 3. `feat(hubspot): actions Batch 1 — contacts + companies + deals + add-to-list` | 10 typed handlers + Zod schemas. `_shared/hubspot/api/_request.ts` (Bearer auth, JSON, `refreshAndRetry`-wrapped, deterministic 409→search→PATCH), `_shared/hubspot/errors.ts`. `capabilities.actions: true`. |
| 4. `feat(hubspot): actions Batch 2 — tickets + engagements + line items + products + owners` | 12 more handlers + schemas. Same wrapper shape. |
| 5. `feat(hubspot): webhook_received trigger + V3 HMAC verification + shared subscriptions` | Adds `_shared/hubspot/webhooks/signature.ts` (canonical-string builder + verifier), `webhook_received` consolidated trigger, app-level subscription lifecycle (Option A: + `hubspot_app_subscriptions` + `hubspot_subscription_refs` migrations + reference-counting; Option B: 409→reuse-existing). Receive route at `/api/webhooks/hubspot` (single global URL, NO `?workflowId=`). Routing by `portalId → user → workflow refs`. Dedup by HubSpot `eventId`. `capabilities.webhookTrigger: true`. |
| 6. `test(e2e): add HubSpot walkthrough with mocked HubSpot boundary` | `tests/e2e/helpers/mockHubSpotServer.ts` (port 9883). `tests/e2e/slice-13-hubspot-walkthrough.spec.ts`. Asserts: OAuth state consumed, refresh token persisted, hub_id resolved, encrypted token storage, 10 Batch 1 + 12 Batch 2 actions exercised at least via one representative call (likely create_contact + create_deal), trigger activation creates app-level subscription with reference, second workflow with same subscription type bumps refcount instead of new subscription, valid V3-signed webhook → run succeeds, invalid signature → 401, replay window violation → 401, dedup blocks second-same-eventId, deactivation decrements ref → last-deactivate deletes subscription. |

---

## Validation gates (per commit)

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For final e2e commit (Commit 6), run all 13 provider walkthroughs in order + Slice 13 twice for stability.

---

## Stop-and-report rules (per CLAUDE.md)

- **Reference-counted shared-subscription primitive** — Commit 1 reaches this checkpoint and stops. Commits 2–6 do not start until the user picks Option A / B / C.
- **New tables `hubspot_app_subscriptions` + `hubspot_subscription_refs`** — only added under Option A and only after explicit user approval. Both are RLS-required (linter check).
- **Anything that grows beyond a HubSpot-specific change** — for example, if reference counting needs to be generalized into a cross-provider primitive — STOP and report.
