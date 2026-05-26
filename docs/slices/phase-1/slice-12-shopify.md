# Slice 12 — **Shopify** provider port

**Branch:** `slice-12-shopify` (off `slice-11-stripe` @ `becc38dc1`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Shopify from V1 as the **first per-shop multi-tenant OAuth provider** in V2 *and* the **first `X-Shopify-Hmac-SHA256` (HMAC-SHA256-base64-of-raw-body) webhook**. Ships an OAuth dispatcher entry (per-shop dynamic token URL + body-JSON exchange + non-refreshable offline tokens), 10 typed action handlers covering orders / products / customers / inventory (REST `/admin/api/<version>/`), plus a single consolidated `webhook_received` trigger that dispatches per Shopify `topic` discriminator.

Slice 12 introduces THREE new V2 patterns simultaneously:

1. **Per-shop multi-tenant OAuth.** Every existing V2 OAuth provider has a static authorize+token URL — Stripe Connect uses `https://connect.stripe.com`, Microsoft uses `https://login.microsoftonline.com`, Google uses `https://accounts.google.com/o/oauth2/v2/auth`, Notion uses `https://api.notion.com/v1/oauth`. **Shopify's authorize and token URLs are per-shop** (`https://{shop}.myshopify.com/admin/oauth/{authorize,access_token}`) — the URL itself depends on user input. The `shop` subdomain is captured at connect time, validated strictly, bound to the OAuth state JWT, and threaded through `buildAuthUrl` + `handleCallback`. This is the substrate for any future per-tenant-subdomain provider (Zendesk, certain Atlassian flows).
2. **Connection-scoped shop domains + per-shop API base routing.** One `shopify` integration row per (user, shop). Every action picks up the shop subdomain from the integration's `providerAccountId` and routes the REST call to `https://{shop}.myshopify.com/admin/api/<version>/...`. Different from Stripe's "single API base, account discriminated by token" model. Validates V2's `accountIdField` contract on a true multi-tenant target.
3. **`X-Shopify-Hmac-SHA256` (base64) webhook signature verification.** Different from every existing V2 webhook signature shape. Slack's `X-Slack-Signature` is hex-of-SHA256-of-`v0:${ts}:${body}`. Stripe's `Stripe-Signature` is `t=,v1=hex` over `${t}.${body}` with replay tolerance. Airtable's `X-Airtable-Content-MAC` is hex-of-SHA256-of-raw-body keyed with the per-webhook MAC secret. **Shopify's `X-Shopify-Hmac-SHA256` is base64-of-SHA256 of the raw body, keyed with the SHOPIFY_CLIENT_SECRET (one global app-secret, not per-webhook).** No timestamp, no replay tolerance — Shopify's docs state the receiver should rely on the HTTPS transport + dedup-by-webhook-id. Slice 12 builds the helper that future single-app-secret-base64-HMAC providers (GitHub apps, Zoom, certain Square surfaces) can reuse.

Slice 12 also **uses the Stripe-like strict-direct-lookup pattern** (`?workflowId=X&nodeId=Y` query params on the notification URL drive the receive route's lookup) but **with the global app secret for verification, not a per-trigger-row secret** — drops the `endpointSecret` storage step from Slice 11's shape.

---

## Why Shopify now

Confirmed via deep V1 audit + cross-check against current Shopify Admin API docs (this commit):

1. **Validates V2's per-shop multi-tenant OAuth contract.** None of V2's current 11 providers exercise a tenant-discriminating subdomain at the OAuth-URL layer. Shopify is the cleanest test of "the user inputs a tenant identifier BEFORE the OAuth dance starts" — same shape HubSpot multi-portal, Atlassian per-cloud-id, and any custom enterprise provider will need.
2. **Validates the Stripe HMAC-base helper generalizes.** Slice 11 introduced `_shared/stripe/webhooks/signature.ts`. Slice 12 introduces `_shared/shopify/webhooks/signature.ts` — same shape (raw-body in, header in, secret in, typed result out) but a different algorithm (base64 over raw body, no timestamp, app-secret-keyed). Validates that V2's "one helper per HMAC variant, never a generic HMAC verifier" boundary discipline holds.
3. **Establishes the per-action shop-base-routing primitive.** `_shared/shopify/api/_request.ts` takes `{ shopDomain, accessToken, ...rest }` instead of `{ accessToken, ...rest }` (V2's existing shape for Stripe / Notion / Google). One thin extra parameter; future per-tenant-API providers reuse the shape.
4. **High product value.** E-commerce automation is the highest-requested non-Stripe destination in V1 telemetry. V1 has 8 trigger event types and 11 action types — V2 ships a focused 10-action / single-trigger-with-topic-discriminator subset that covers the 80% case.
5. **V1 has strong reusable code with one critical security gap.** The `getShopDomain` resolution chain (`app/api/integrations/shopify/data/utils.ts:14-53`) is solid; the GraphQL/REST request helpers translate cleanly. **The OAuth callback in V1 does NOT validate the `shop` parameter format** ([`provider-registry.ts:1453-1456`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1453)) — it accepts whatever the URL says. Slice 12 fixes this during the port. The `Q11` notify_customer consent gate (V1 surfaces it inline at `update_order_status` + `create_fulfillment`) is preserved as a required schema field — no silent default.
6. **Light external setup, deterministic local-dev story.** Shopify Partner account + a single development store gives you a `mystore.myshopify.com` domain, a Custom App with `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`, and webhook delivery to a publicly-reachable URL (ngrok or equivalent). The mocked e2e mirrors the Stripe pattern — port 9882 stands in for both `*.myshopify.com` and Shopify's webhook signing path; no real Shopify credentials needed for the test suite to run green.

---

## Confirmed scope decisions

1. **New provider id — `shopify`.** Standard V2 provider folder (`integrations/shopify/`) + dispatcher route. One Shopify integration per (user, shop). Re-installing the same shop overwrites the existing row (V2's `upsertActive` semantics on `providerAccountId`).
2. **Ten actions — `create_order`, `update_order_status`, `add_order_note`, `create_fulfillment`, `create_product`, `update_product`, `create_product_variant`, `create_customer`, `update_customer`, `update_inventory`.** Per-action V1 audit + classification in §"V1 audit" below. **Defer:** `update_product_variant` (low-value duplicate of create+update_product surface), V1's Shopify GraphQL-mutations beyond order/product/customer (subscription contracts, fulfillment tracking updates, shop metafields, draft orders, returns).
3. **One consolidated trigger — `webhook_received`** with payload `topic` discriminator (the Shopify webhook topic string, e.g. `"orders/create"`, `"customers/create"`). V1 splits into 8 separate trigger node types (`shopify_trigger_new_order`, …) each mapping to a curated topic. V2 normalizes to ONE trigger that workflows can branch on via the `topic` field — mirrors Slice 11 (Stripe `event_received`), Slice 10 (Airtable `record_changed`), Slice 7 (calendar `event_changed`). The trigger config presents a multi-select of supported Shopify topics; activation creates one webhook per topic per workflow with the user-selected list.
4. **Curated topic allowlist (Batch 1) — 8 topics:** `orders/create`, `orders/paid`, `orders/fulfilled`, `orders/updated`, `customers/create`, `products/update`, `checkouts/create` (abandoned cart), `inventory_levels/update`. Mirrors V1's 8 trigger node types exactly. Deferred topics (any not in the allowlist) are rejected at activation with a typed validation error so workflow authors fail loud at design time. Allowlist lives as a const in `integrations/shopify/triggers/webhookReceived/allowedTopics.ts`.
5. **OAuth — non-refreshable + per-shop body-JSON token exchange + no PKCE.** Manifest declares `refreshable: false`. **`refreshToken()` throws `RefreshNotSupportedError("shopify")`** — same shape as Slack / Notion. Token exchange POSTs `https://{shop}.myshopify.com/admin/oauth/access_token` with `application/json` body containing `{ client_id, client_secret, code }`. **Body is JSON, NOT form-urlencoded** (different from every other V2 provider's body-auth shape — V1 [`provider-registry.ts:1458-1462`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1458) confirms). Response: `{ access_token, scope }` — **no `refresh_token`, no `expires_in`** (Shopify offline access tokens don't expire and have no refresh grant; revocation is the only end-state). `scope` is a **comma-separated** string (V1: `tokenData.scope.split(',')` at `provider-registry.ts:1474`). **No PKCE** — Shopify's authorize endpoint doesn't require or accept `code_challenge`.
6. **OAuth scopes — exactly the 8 V1 ships:** `read_orders`, `write_orders`, `read_products`, `write_products`, `read_customers`, `write_customers`, `read_inventory`, `write_inventory` (+ the V1 trigger-only `read_checkouts` for abandoned-cart, `read_fulfillments` + `write_fulfillments` for create_fulfillment). Total 11 scopes — covers every action and every trigger in Batch 1. Defer `read_orders_count` / `read_marketing_events` / `read_shipping` / `read_themes` / `read_locales` — none used by Slice 12 actions or triggers.
7. **`tokenScope` — `user`.** One Shopify integration per (user, `providerAccountId=shopDomain`). A user re-authorizing to a different shop creates a sibling integration row.
8. **`accountIdField` — `shopDomain`** (the full `*.myshopify.com` domain). Stable for the life of the merchant's Shopify account; uniquely identifies which shop the access token belongs to. V1 stores this as a top-level `integrations.shop_domain` column AND as `metadata.shop` (test fixtures); V2 stores it as `providerAccountId` directly (fits V2's contract — the field exists on every integration row), and mirrors it into `metadata.shopDomain` + `metadata.shopName` + `metadata.shopPlan` for the connection-management UI.
9. **`apiVersion` — `2024-10`.** Shopify pins API versions per quarter; `2024-10` is V1's pinned version (`ShopifyTriggerLifecycle.ts:97`, `app/api/integrations/shopify/data/utils.ts:83`) and is current as of the Slice 12 implementation window. All `_shared/shopify/api/_request.ts` calls use `/admin/api/2024-10/...`. The `apiVersion` const lives in `_shared/shopify/api/_base.ts`.
10. **Health check interval — 12h.** Matches V2's "other providers" tier (Notion, Slack, Discord, Airtable, Stripe). Shopify Admin API is gentle on rate limits; a 12h `GET /admin/api/2024-10/shop.json` ping confirms the shop's offline access token still works. Slice 12 doesn't ship the health-check route itself — manifest declares the cadence so the future health-engine cron picks it up.
11. **Webhook subscription resource — `/admin/api/2024-10/webhooks.json`.** One subscription per (workflow, topic) — workflows pick a curated topic set at trigger config time, activation creates N webhooks (one per selected topic). Body: `{ webhook: { topic, address, format: "json" } }`. Response: `{ webhook: { id, ... } }`. V2 stores per-topic webhook IDs in `trigger_resources.config.subscriptions[]`.
12. **Webhook signature — HMAC-SHA256 base64, `X-Shopify-Hmac-SHA256: <base64>`.** Constant-time compare via `crypto.timingSafeEqual`. **No replay tolerance** (Shopify omits a timestamp; the docs rely on transport + dedup-by-id). **One global app secret** (`SHOPIFY_CLIENT_SECRET`) — every webhook V2 creates against any merchant's shop verifies against the same secret. Drops Slice 11's per-trigger-row `endpointSecret` storage (Stripe needed it because Stripe issues per-endpoint secrets; Shopify doesn't).
13. **Webhook endpoint expiration — never.** Shopify webhooks don't expire — they live until explicit deactivation OR until the merchant uninstalls the app. V2 does NOT register a renewal handler with `subscriptionRegistry` for Shopify (mirrors Slice 11 / Stripe). The trigger's index file registers activation + deactivation only.
14. **Trigger dedup key — `X-Shopify-Webhook-Id` header (preferred) or fallback `${shop}:${topic}:${payload.id}:${payload.updated_at|created_at}`.** Each webhook delivery carries a unique `X-Shopify-Webhook-Id` header (per Shopify docs as of 2024-10). V2 uses it as the canonical dedup key; falls back to the derived key when the header is absent (defensive — should always be present per current Shopify docs but the fallback prevents lost dedup on legacy delivery paths). V2's `webhook_event_dedup` keyed on `(provider, dedupKey)` blocks duplicates from retry storms.
15. **Webhook receive route — `/api/webhooks/shopify`.** **Strict direct lookup by `workflowId` + `nodeId` query params** (Slice 11 pattern) — endpoint URL is `https://<host>/api/webhooks/shopify?workflowId=X&nodeId=Y`. Receive route reads both, looks up the single `trigger_resources` row, verifies signature against `SHOPIFY_CLIENT_SECRET`, dispatches. Missing query params → 200 quiet ack (in-flight delivery for a deleted workflow). Bad signature → 401. Unsupported topic → 200 ack without dispatch (defense-in-depth against dashboard re-config drift).
16. **No webhook payload normalization in receive.** V1's receive route ([`app/api/webhooks/shopify/route.ts:243-326`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts#L243)) flattens Shopify's wire shape (camelCase fields, line_items array, address objects) into a per-topic `triggerOutput` map. **V2 forwards the raw Shopify payload to the workflow runner.** Workflows reference `{{nodeId.payload.id}}` / `{{nodeId.payload.email}}` directly. Reasons: (a) V1's flattening is lossy (drops shipping_lines, discount_codes, taxes, tax_lines, etc.); (b) per-topic flattening is a code-volume tax for every new topic added; (c) Slice 11 (Stripe) already establishes the precedent — Stripe events forward through unchanged with workflows using `{{nodeId.payload.data.object.amount}}`-style refs; (d) Shopify's REST shape is stable across API versions, so workflows authored against the wire shape stay valid.
17. **Per-trigger-config filtering moves into the workflow's logic node, NOT the receive route.** V1 has `shouldProcessWebhook` filters at `app/api/webhooks/shopify/route.ts:332-402` (fulfillment_status, financial_status, minimum_value, threshold, location_id). V2's consolidated trigger doesn't ship these as receive-route filters because (a) workflow logic-nodes (filter, branch) already cover them, (b) Slice 11 / Stripe doesn't have receive-route filtering, (c) V2's contract is "trigger fires; workflow decides what to do." The trigger config schema documents the topic-specific filter helpers as recommended workflow patterns rather than baking them into the receive route.
18. **Q11 explicit consent gate — `notify_customer` is required (no default) on `update_order_status` and `create_fulfillment`.** V1's `update_order_status` already requires it ([`shopify/index.ts:810-821`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L810) — V1 has the gate). V1's `create_fulfillment` defaults to `true` (V1 line 1693) — Slice 12 fixes this during port. Schema-level `notify_customer: z.boolean()` (no default) — workflow authors must explicitly choose true / false. Same shape as Q11 elsewhere (Slice 7 calendar, Slice 6 outlook send-mail's `saveToSentItems`).
19. **No new DB migration.** State fits existing tables: `integrations` (`providerAccountId = shopDomain`, scopes encrypted, no refresh token), `oauth_states` (signed JWT carries the shop in payload — see §"OAuth model — per-shop validation"), `trigger_resources` (`config.subscriptions[]: { topic, webhookId }`). **STOP-AND-REPORT** if a new table is needed.
20. **No multi-store metadata fields ported.** V1 has half-implemented multi-store support (`metadata.stores[]`, `metadata.active_store`, `metadata.shop` test-fixture key — see [`stores.ts:9-49`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/shopify/data/handlers/stores.ts) and [`utils.ts:14-53`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/shopify/data/utils.ts#L14)). The user's accepted plan explicitly says "do not over-port stubbed multi-store metadata if V1 never wired it." V2 ships ONE shop per integration row; users with multiple shops authorize each separately and pick the integration in the workflow node. The `STORE_SELECTOR_FIELD` UI affordance from V1 ([`shopify/index.ts:32-43`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L32)) is unnecessary in V2 because the integration row IS the store.
21. **No GraphQL Admin API in Slice 12.** V1 uses GraphQL for `create_order` ([`createOrder.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createOrder.ts)) and the `makeShopifyGraphQLRequest` helper ([`utils.ts:74-135`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/shopify/data/utils.ts#L74)) but REST for everything else. **V2 standardizes on REST for Batch 1** — V2's `_shared/shopify/api/_request.ts` is REST-only, Bearer-token-equivalent (Shopify's actual header is `X-Shopify-Access-Token` — no "Bearer" prefix), JSON content-type. Reasons: (a) REST is the simpler shape for the 10 actions we ship; (b) Shopify's REST API is fully GA and not deprecated for the 10 actions' resources (orders, products, customers, fulfillments, inventory_levels); (c) V2 keeps a future `_shared/shopify/api/_graphql.ts` door open for Batch 2 if specific GraphQL-only mutations show up. V1's `create_order` GraphQL pattern ports to REST `POST /admin/api/2024-10/orders.json`.

---

## Six confirmation answers

| Question | Answer | Citation |
|---|---|---|
| **1. Shopify OAuth refreshable?** | **No.** Offline access tokens issued at install time don't expire and don't have a refresh grant. The only end-state for an offline token is merchant-side app uninstall (token revoked). On 401 → `action_required` immediately; the per-provider `refreshToken()` throws `RefreshNotSupportedError("shopify")`. V1's `authSchemes.ts:69` confirms `'non_refreshable'`. | Current Shopify docs: shopify.dev/docs/apps/build/authentication-authorization/access-tokens (this commit). V1: [`authSchemes.ts:65-69`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L65), [`provider-registry.ts:1473-1475`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1473). |
| **2. PKCE required?** | **No.** Shopify's authorize endpoint at `https://{shop}.myshopify.com/admin/oauth/authorize` doesn't require or accept `code_challenge` parameters. Manifest omits `generatePkce()`. | Current Shopify docs (this commit). V1: no PKCE config for Shopify in [`oauthConfig.ts:490-525`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L490) or [`provider-registry.ts:1445-1503`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1445). |
| **3. OAuth wire-format?** | **Per-shop dynamic URL + JSON body.** Authorize: `GET https://{shop}.myshopify.com/admin/oauth/authorize?client_id=…&scope=…&redirect_uri=…&state=…` (scopes comma-separated per Shopify convention). Token exchange: `POST https://{shop}.myshopify.com/admin/oauth/access_token` with `Content-Type: application/json` body `{ client_id, client_secret, code }`. **NOT form-urlencoded.** Response: `{ access_token, scope }` (scope comma-separated). No `refresh_token`, no `expires_in`. | Current Shopify docs. V1: [`provider-registry.ts:1453-1476`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1453). |
| **4. Webhook subscription model?** | **Programmatic via the merchant's access token.** POST `https://{shop}.myshopify.com/admin/api/2024-10/webhooks.json` with `Content-Type: application/json` and header `X-Shopify-Access-Token: <merchant-token>`. Body: `{ webhook: { topic, address, format: "json" } }`. Response: `{ webhook: { id, address, topic, format, created_at } }`. **Different from Stripe** — Stripe webhooks are created with the platform secret on the platform's account; Shopify webhooks are created with the merchant's offline access token on the merchant's shop. Endpoint becomes active immediately — no validation handshake. **Endpoints don't expire.** | Current Shopify docs: shopify.dev/docs/api/admin-rest/2024-10/resources/webhook (this commit). V1: [`ShopifyTriggerLifecycle.ts:96-115`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/ShopifyTriggerLifecycle.ts#L96). |
| **5. Inbound notification format?** | **Full payload in POST body** (like Stripe; unlike Airtable). Headers carry routing metadata: `X-Shopify-Topic` (e.g. `"orders/create"`), `X-Shopify-Shop-Domain` (e.g. `"mystore.myshopify.com"`), `X-Shopify-Hmac-SHA256` (base64-of-HMAC-SHA256-of-raw-body), `X-Shopify-Webhook-Id` (per-delivery unique id). Body is the resource snapshot — for `orders/*` it's the full Order REST resource; for `customers/create` it's the Customer; for `products/update` it's the Product; for `inventory_levels/update` it's the InventoryLevel. V2 forwards the raw payload (Q16). | Current Shopify docs: shopify.dev/docs/apps/build/webhooks/configuration/headers (this commit). V1: [`app/api/webhooks/shopify/route.ts:54-66`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts#L54). |
| **6. Signature algorithm?** | **HMAC-SHA256 over raw body, keyed with `SHOPIFY_CLIENT_SECRET`, encoded base64.** Compare via `crypto.timingSafeEqual`. **No timestamp, no replay tolerance window** — Shopify's docs rely on the per-delivery `X-Shopify-Webhook-Id` for dedup and on HTTPS for transport integrity. **Single global app secret** — every webhook V2 creates against any merchant verifies against the same `SHOPIFY_CLIENT_SECRET` (different from Stripe's per-endpoint `whsec_xxx`). | Current Shopify docs: shopify.dev/docs/apps/build/webhooks/subscribe/get-started?framework=remix#step-5-verify-the-webhook (this commit). V1: [`app/api/webhooks/shopify/route.ts:207-236`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts#L207). |

---

## V1 audit + port classification

V1 paths inspected:

| V1 path | What's there | Slice 12 classification |
|---|---|---|
| [`lib/integrations/oauthConfig.ts:490-525`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L490) | OAuth config: per-shop authorize/token URL templates, `authMethod: "body"`, `refreshTokenExpirationSupported: false`, scope list | **Reference for OAuth wire-format only.** V2 implements via typed `integrations/shopify/oauth.ts` with a dedicated `customTokenExchange`-equivalent path that handles per-shop URLs. |
| [`lib/integrations/provider-registry.ts:1445-1503`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1445) | OAuth callback — dynamic `customTokenExchange` reads `shop` from URL, posts JSON body, fetches `/shop.json` for shop_name + shop_plan | **Port intent.** V2's `handleCallback` does the same flow with strict shop validation added (V1 gap — see §"V1 rot to fix"). |
| [`lib/integrations/authSchemes.ts:65-69`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L65) | `shopify: 'non_refreshable'` with explanatory comment | **Confirmation only.** V2's per-provider `refreshToken()` throws `RefreshNotSupportedError("shopify")` — same shape as Slack / Notion. |
| [`lib/triggers/providers/ShopifyTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/ShopifyTriggerLifecycle.ts) (337 LOC) | onActivate (creates webhook per topic + writes `trigger_resources`), onDeactivate (deletes), onDelete (alias), checkHealth, getTopicForTrigger map | **Port mostly as-is, adapted to V2 patterns.** V2 splits into `triggers/webhookReceived/{activate,deactivate,index}.ts` matching Slice 7 / 10 / 11 shape. The per-trigger-type → topic map (V1 `getTopicForTrigger`) is replaced with the consolidated allowlist (Q4). The activate hook iterates the user's selected topics and creates one webhook per topic, storing all webhook IDs in `trigger_resources.config.subscriptions[]`. The FK-23503 swallow at V1 line 144-148 is removed — V2 lets the error propagate (matches Slice 10's removal of the equivalent Airtable path). |
| [`app/api/webhooks/shopify/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts) (~402 LOC) | Webhook receive: HMAC verify, topic→trigger-type lookup, payload normalization (transformShopifyPayload), per-trigger-config filtering (shouldProcessWebhook), workflow execution | **Rewrite per V2 boundary.** V2 ships ONE clean receive route at `/api/webhooks/shopify/route.ts` (~110 LOC) — strict workflowId+nodeId query params required, single-secret verify against `SHOPIFY_CLIENT_SECRET`, sync dispatch via `dispatchTriggerEvent`. **Drops `transformShopifyPayload` entirely** (Q16). **Drops `shouldProcessWebhook`** (Q17 — workflow logic-nodes own filtering). |
| [`app/api/integrations/shopify/data/utils.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/shopify/data/utils.ts) (260 LOC) | `getShopDomain` (multi-store fallback chain), `getShopifyHeaders` (decrypt token + bearer), `makeShopifyGraphQLRequest`, `makeShopifyRequest` (REST), error normalization, validation | **Port the request shape, drop multi-store fallback and GraphQL.** V2's `_shared/shopify/api/_request.ts` (REST-only, ~120 LOC): takes `{ shopDomain, accessToken, method, path, body? }`, builds `https://{shopDomain}/admin/api/2024-10/{path}`, sends `X-Shopify-Access-Token: ${accessToken}` + `Content-Type: application/json`, handles 401 / 403 / 404 / 422 / 429 with typed error mapping (mirrors Stripe's `_request.ts`). |
| [`app/api/integrations/shopify/data/handlers/stores.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/shopify/data/handlers/stores.ts) (51 LOC) | Returns connected stores list from metadata for the multi-store selector dropdown | **Skip per Q20.** V2's "one shop per integration" model removes the need for a stores-list field entirely. |
| [`app/api/integrations/shopify/data/handlers/{products,orders,customers,inventory-items,locations,collections,variants}.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/shopify/data/handlers/) | Dynamic options loaders for action-config dropdowns | **Reference, not a Slice 12 ship.** V2's V1-equivalent dynamic-options layer hasn't shipped yet across providers; Shopify will gain it when V2's options-loader infrastructure lands (out of scope for Slice 12). Slice 12 actions accept ID strings directly (workflow authors paste from the Shopify admin UI for Batch 1). |
| [`lib/workflows/actions/shopify/createOrder.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createOrder.ts) (199 LOC) | GraphQL `orderCreate` mutation with shipping/billing addresses | **Reference for create_order contract; rewrite to REST.** V2 ships ~150 LOC: typed schema (Q11), POST `/admin/api/2024-10/orders.json` with `{ order: { email, line_items: [{ variant_id, quantity }], financial_status, shipping_address?, billing_address?, tags?, note? } }`. The country-code mapping helper (`getCountryCode` at V1 lines 21-50) ports verbatim — Shopify accepts ISO 3166-1 alpha-2 codes, and translating common country names is pure UX. |
| [`lib/workflows/actions/shopify/updateOrderStatus.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateOrderStatus.ts) (~250 LOC est.) | Multi-mode handler: fulfill / cancel / add_tags / add_note routing + `notify_customer` Q11 gate | **Port mostly as-is.** ~180 LOC. Q11 `notify_customer` already required in V1 — preserved. |
| [`lib/workflows/actions/shopify/addOrderNote.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/addOrderNote.ts) | Append-or-replace mode for order note | **Port mostly as-is.** ~80 LOC. |
| [`lib/workflows/actions/shopify/createFulfillment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createFulfillment.ts) | POST `/orders/{id}/fulfillments` with tracking + `notify_customer` (defaults true in V1) | **Port with Q11 fix.** ~100 LOC. **`notify_customer` becomes required-no-default** (Q18) — V1's `defaultValue: true` ([`shopify/index.ts:1693`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L1693)) silently emails customers, fix during port. |
| [`lib/workflows/actions/shopify/createProduct.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createProduct.ts) | POST `/products.json` with title/body_html/vendor/product_type/variants | **Port mostly as-is.** ~120 LOC. Single-variant initial inventory captured via the `inventory_quantity` on the default variant. |
| [`lib/workflows/actions/shopify/updateProduct.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProduct.ts) | PUT `/products/{id}.json` (Shopify accepts both PUT and POST for updates) | **Port mostly as-is.** ~110 LOC. V2 uses PUT (Shopify's REST convention for resource updates); V1 may use POST — check during commit 3. |
| [`lib/workflows/actions/shopify/createProductVariant.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createProductVariant.ts) | POST `/products/{id}/variants.json` | **Port mostly as-is.** ~100 LOC. |
| [`lib/workflows/actions/shopify/createCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createCustomer.ts) | POST `/customers.json` with optional `send_welcome_email` | **Port mostly as-is.** ~100 LOC. |
| [`lib/workflows/actions/shopify/updateCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateCustomer.ts) | PUT `/customers/{id}.json` | **Port mostly as-is.** ~110 LOC. |
| [`lib/workflows/actions/shopify/updateInventory.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateInventory.ts) | POST `/inventory_levels/set.json` (or `/adjust.json` for delta) — adjustment_type set/add/subtract routing | **Port mostly as-is.** ~120 LOC. Routes to `/set.json` for set; `/adjust.json` for add/subtract. |
| [`lib/workflows/actions/shopify/updateProductVariant.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProductVariant.ts) | PUT `/variants/{id}.json` | **Skip per Q2.** Deferred — covered by `update_product` for most flows. |
| [`lib/workflows/actions/shopify/graphqlHelpers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/graphqlHelpers.ts) | GraphQL-specific helpers (extractNumericId, etc.) | **Skip per Q21.** REST-only in Batch 1. The `extractNumericId` helper ports verbatim into V2 wherever GIDs surface (e.g. webhook payload `admin_graphql_api_id` fields show up in REST too). |
| [`__tests__/nodes/shopify-create-customer.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/shopify-create-customer.test.ts) | Single test file for shopify | **Reference only.** V2 builds its own suite. |

---

## In-scope action list (final)

1. **`create_order`** — `{ customer_email, line_items: [{ variant_id, quantity }], financial_status?, send_receipt?, note?, tags?, shipping_address?, billing_address? }` → POST `/orders.json`. `send_receipt` is required (Q11 — the receipt is a customer-facing email). Country names in addresses pass through `getCountryCode` for ISO conversion. Returns `{ orderId, orderNumber, totalPrice, currency, financialStatus, adminUrl, createdAt }`.
2. **`update_order_status`** — `{ orderId, action: "fulfill" | "cancel" | "add_tags" | "add_note", tags?, note?, notify_customer }` → routes to POST `/orders/{id}/fulfillments`, POST `/orders/{id}/cancel`, PUT `/orders/{id}` (tags/note). `notify_customer` REQUIRED (Q11/Q18). Returns `{ success, orderId, status, updatedAt }`.
3. **`add_order_note`** — `{ orderId, note, append? }` → GET `/orders/{id}` (auxiliary fetch — wrapped in `refreshAndRetry`) when `append: true` to read existing note, then PUT `/orders/{id}` with merged note. Returns `{ success, orderId, note }`.
4. **`create_fulfillment`** — `{ orderId, tracking_number?, tracking_company?, tracking_url?, notify_customer }` → POST `/orders/{id}/fulfillments.json`. `notify_customer` REQUIRED (Q18 — V1's `defaultValue: true` is fixed). Returns `{ success, fulfillmentId, orderId, trackingNumber, trackingUrl, createdAt }`.
5. **`create_product`** — `{ title, body_html?, vendor?, product_type?, price, sku?, inventory_quantity? }` → POST `/products.json` with default-variant nesting. Returns `{ productId, variantId, title, adminUrl, createdAt }`.
6. **`update_product`** — `{ productId, title?, body_html?, vendor?, product_type?, tags?, published? }` → PUT `/products/{id}.json`. Returns `{ success, productId, title, adminUrl, updatedAt }`.
7. **`create_product_variant`** — `{ productId, option1?, option2?, option3?, price, sku?, inventory_quantity?, weight?, barcode? }` → POST `/products/{id}/variants.json`. Returns `{ success, variantId, productId, sku, price, createdAt }`.
8. **`create_customer`** — `{ email, first_name?, last_name?, phone?, tags?, send_welcome_email }` → POST `/customers.json`. `send_welcome_email` REQUIRED (Q11 — customer-facing email). Returns `{ customerId, email, adminUrl, createdAt }`.
9. **`update_customer`** — `{ customerId, email?, first_name?, last_name?, phone?, tags?, note?, accepts_marketing? }` → PUT `/customers/{id}.json`. Returns `{ success, customerId, email, adminUrl, updatedAt }`.
10. **`update_inventory`** — `{ inventory_item_id, location_id, adjustment_type: "set" | "add" | "subtract", quantity }` → POST `/inventory_levels/set.json` (set) or `/inventory_levels/adjust.json` (add/subtract). Returns `{ success, inventoryItemId, newQuantity, locationId }`.

All actions wrap their **principal** API call in `refreshAndRetry` (which translates 401 to `IntegrationActionRequiredError` for Shopify since it's non-refreshable — same shape as Slack / Notion). Auxiliary calls (`add_order_note`'s pre-fetch GET) are also wrapped per CLAUDE.md §6 contract.

---

## OAuth model — per-shop validation + state-bound shop + non-refreshable

V2's first per-tenant-subdomain provider. Different shape from every existing V2 provider.

### Per-shop validation (load-bearing — V1 rot fixed during port)

V1's OAuth callback ([`provider-registry.ts:1453-1469`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1453)) accepts whatever `?shop=` is in the callback URL — host injection if an attacker can manipulate the connect-flow start. V2 fixes this with two layers:

1. **Connect-time validation.** The connect endpoint accepts `shop` as a JSON body field (POST `/api/integrations/oauth/shopify/connect` body `{ shop: "mystore" | "mystore.myshopify.com" }`). The route normalizes the input:
   - Strip whitespace + lowercase.
   - If the value lacks `.myshopify.com`, append it.
   - Validate against `^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$` (per Shopify's shop-name format rules — alphanumeric + hyphens, 1-60 chars before `.myshopify.com`). Reject otherwise with 400.
   - Reject any value containing a path component, query string, port, or non-`.myshopify.com` host.
2. **State-bound shop.** The validated shop string goes into the signed OAuth state JWT payload (NEW `OAuthStatePayload.providerHint?: { shop: string }`). At callback time, the state's bound `shop` is the source of truth for both the token-exchange URL and the `shop_domain` written to the integration row. The `?shop=` param Shopify sends in the callback URL is **compared** against the state's bound value; a mismatch → 400. This neutralizes the host-injection vector even if an attacker could manipulate the authorize-step redirect.

The `OAuthStatePayload` extension is a single optional field — non-Shopify providers default to `undefined` and ignore it. The state JWT shape generalizes for future per-tenant providers (Mailchimp `dc`, Atlassian `cloudid`, Zendesk `subdomain`).

### Wire-format

1. **`integrations/shopify/oauth.ts`** implements `ProviderOAuth`:
   - **No `generatePkce()`** method.
   - `buildAuthUrl(state, scopes, _pkce, providerHint)` — V2 Slice 12 extends the `ProviderOAuth.buildAuthUrl` signature with an optional 4th argument `providerHint?: Record<string, string> | null`. Shopify reads `providerHint.shop`. Builds `https://${shop}/admin/oauth/authorize?client_id=…&scope=${scopes.join(",")}&redirect_uri=…&state=${state}`. **Comma-separated scopes** (Shopify convention; V1 line 1474 splits on `,`).
   - `handleCallback(code, state, _pkce, providerHint)` — same 4th-arg extension. Reads `providerHint.shop`, **validates the URL's `?shop=` matches** (passed via the dispatcher when it consumes state — see §"Dispatcher changes"), then POSTs `https://${shop}/admin/oauth/access_token` with `Content-Type: application/json` body `{ client_id, client_secret, code }`. Response: `{ access_token, scope }`. Auxiliary GET `/admin/api/2024-10/shop.json` (wrapped in plain fetch — no refreshAndRetry needed; this is during initial OAuth, no integration row exists yet) fetches `{ name, plan_name }`. Returns `{ tokens: { accessTokenEncrypted: encrypt(access_token), refreshTokenEncrypted: null, accessTokenExpiresAt: null, scopes: scope.split(",") }, account: { providerAccountId: shop, displayName: shopName ?? shop, metadata: { shopDomain: shop, shopName, shopPlan, scopesGranted: scope.split(",") } } }`. **Throws** if `access_token` is missing.
   - `refreshToken()` throws `RefreshNotSupportedError("shopify")`. Same shape as Slack / Notion.
   - `revoke()` is a stub deferred to disconnect-UX slice.

### Dispatcher changes

Slice 12 makes three small, targeted changes to shared OAuth infra. All are backward-compatible — non-Shopify providers continue to work unchanged.

1. **`ConnectInput.providerHint?: Record<string, string>`** — optional field for per-tenant inputs. The connect route reads it from the request body when present. Validated by the provider-specific OAuth's optional `validateProviderHint?(hint): void` (Shopify implements; others omit).
2. **`OAuthStatePayload.providerHint?: Record<string, string>`** — optional field on the JWT payload. JWT-only — NOT a new column on the `oauth_states` DB row (no migration). Shopify writes `{ shop: "mystore.myshopify.com" }`; others omit.
3. **`ProviderOAuth.buildAuthUrl` and `handleCallback` 4th argument** — optional `providerHint?: Record<string, string> | null`. The dispatcher routes the JWT's `providerHint` to both. Existing providers receive `null` and ignore.

The dispatcher's `consumeState` already returns the JWT payload — extending it to surface `providerHint` is a one-line change. The dispatcher also calls `validateProviderHint` at connect time IF the provider implements it, so format errors fail at the start of the flow rather than at the callback.

Tests cover (a) Shopify rejects malformed shops at the connect layer, (b) the state JWT carries the shop end-to-end, (c) a callback `?shop=` mismatch is rejected, (d) non-Shopify providers continue to work unchanged.

### Manifest

- `refreshable: false`
- `accountIdField: "shopDomain"`
- `tokenScope: "user"`
- `oauthFlows: ["v2"]`
- `scopes.required: ["read_orders","write_orders","read_products","write_products","read_customers","write_customers","read_inventory","write_inventory","read_checkouts","read_fulfillments","write_fulfillments"]`
- `apiVersion: "2024-10"`
- `healthCheckIntervalMs: 12 * 60 * 60 * 1000` (12h)

---

## Webhook trigger model — per-topic + global-secret + no expiration

V2's first single-app-secret HMAC-base64 webhook trigger.

1. **Activate** (`triggers/webhookReceived/activate.ts`):
   - Reads `node.config.topics: string[]` (required, non-empty, all entries in `STRIPE_ALLOWED_TOPICS` const). Reads the workflow + node id from activation context.
   - For each topic: builds notification URL `${V2_BASE_URL}/api/webhooks/shopify?workflowId=X&nodeId=Y&topic=<topic>` (the topic in the URL is defense-in-depth; the receive route also reads `X-Shopify-Topic` and trusts that for routing). Calls `webhooksCreate({ shopDomain, accessToken, topic, address, format: "json" })` from `_shared/shopify/api/webhooks.ts`. Stores response webhook id.
   - After all topics succeed, persists `trigger_resources.config = { webhookEnabled: true, shopDomain, subscriptions: [{ topic, webhookId }, ...] }`. Activation is not transactional — partial failures (e.g. 4th of 5 topics 500s) leave a half-created state. Implementation choice: collect all successes, fail loud on first error and roll back created webhooks (best-effort `webhooksDelete` call for each; ignore errors).
   - **No `type: "subscription-watch"` field** — Shopify webhooks don't expire (Q13). Mirrors Stripe.

2. **Deactivate** (`triggers/webhookReceived/deactivate.ts`):
   - Iterates `config.subscriptions`, DELETEs `/admin/api/2024-10/webhooks/{id}.json` for each via the merchant's access token. Swallows 404 (already deleted server-side) and 401 (merchant uninstalled the app — token revoked). Other errors propagate.

3. **Webhook receive** (`app/api/webhooks/shopify/route.ts`):
   - POST handler. Reads raw body BEFORE parse (signature is over the bytes).
   - Parses `?workflowId=X&nodeId=Y` query params. Missing → 200 quiet ack.
   - Verifies `X-Shopify-Hmac-SHA256` against `SHOPIFY_CLIENT_SECRET` via `_shared/shopify/webhooks/signature.ts`. Mismatch / missing header → 401.
   - Looks up trigger row via `findByWorkflowAndNode(workflowId, nodeId)`. Filter to `provider === "shopify"` + `eventType === "webhook_received"`. Missing → 200 quiet ack.
   - Reads `X-Shopify-Topic` for routing; checks against the trigger row's selected topics; if topic not in selection → 200 ack without dispatch (defense-in-depth).
   - Computes dedup key — `X-Shopify-Webhook-Id` if present, else fallback (Q14).
   - Normalizes to canonical `TriggerEvent` shape via `normalize.ts`. Forwards raw payload (Q16).
   - Dispatches via `dispatchTriggerEvent` — DB-backed `webhook_event_dedup` blocks duplicates.

4. **Signature helper** (`_shared/shopify/webhooks/signature.ts`):

   ```ts
   export function verifyShopifySignature(
     rawBody: string,
     header: string | null,
     secret: string,
   ): { valid: true } | { valid: false; reason: "missing_header" | "mismatch" | "malformed" }
   ```

   - Compute `expected = createHmac("sha256", secret).update(rawBody, "utf8").digest()` (raw bytes).
   - Decode `header` from base64 to bytes. Length-mismatch → `"malformed"`.
   - Constant-time compare via `timingSafeEqual` → `valid: true` / `mismatch`.
   - **No timestamp parsing, no replay tolerance** — Shopify's wire format omits both.

---

## V1 patterns to skip

- **Multi-store metadata fields** (`metadata.stores[]`, `metadata.active_store`, `metadata.shop` test fixtures, `getShopDomain` fallback chain). Q20 — V2 ships one shop per integration row.
- **`STORE_SELECTOR_FIELD`** ([`shopify/index.ts:32-43`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L32)) at the top of every action / trigger config schema. Q20 — the integration row IS the store.
- **GraphQL Admin API** ([`utils.ts:74-135`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/shopify/data/utils.ts#L74) + [`createOrder.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createOrder.ts)). Q21 — REST-only Batch 1.
- **8 separate trigger node types** (`shopify_trigger_new_order`, `shopify_trigger_new_paid_order`, …). Q3 — V2 ships one consolidated `webhook_received` with `topic` discriminator.
- **`transformShopifyPayload`** ([`route.ts:243-326`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts#L243)). Q16 — V2 forwards the raw Shopify wire shape; workflows reference `{{nodeId.payload.foo}}` directly.
- **`shouldProcessWebhook`** ([`route.ts:332-402`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts#L332)). Q17 — workflow logic-nodes own filtering.
- **FK-23503 swallow** ([`ShopifyTriggerLifecycle.ts:144-148`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/ShopifyTriggerLifecycle.ts#L144)). V2 lets the error propagate.
- **`update_product_variant`** action. Q2 — deferred; `update_product` covers most flows.
- **Dynamic options handlers** (`/data/handlers/{products,orders,…}.ts`). V2's options-loader infrastructure is out of scope for Slice 12 — workflows accept ID strings directly.
- **Per-handler test-mode short-circuits.** V2's engine-level `executeNode` testMode interception covers this (CLAUDE.md §10).

---

## V1 rot to fix during port

- **Strict shop-domain validation at OAuth callback.** V1's `customTokenExchange` at [`provider-registry.ts:1454-1456`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L1454) reads `?shop=` from the callback URL with no format check beyond "missing" — host injection vector. V2 enforces strict regex + state-binding (per §"OAuth model").
- **`notify_customer` consent gate fixed** on `create_fulfillment`. V1 silently defaults `true` ([`shopify/index.ts:1693`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L1693)) — V2 makes it required-no-default (Q18).
- **`send_welcome_email` consent gate added** on `create_customer`. V1 defaults `false` ([`shopify/index.ts:1387`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L1387)) — V2 promotes it to required-no-default (Q11 — symmetric with `notify_customer`; the false default is a sensible choice but the workflow author should confirm it).
- **`send_receipt` consent gate added** on `create_order`. V1 defaults `true` ([`shopify/index.ts:477`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L477)) — V2 promotes it to required-no-default (Q11).
- **Single source of truth for trigger state — `trigger_resources` only.** V1 has scattered metadata fields V2 collapses.
- **Strict Q11 schemas** for every action — no `config: any` handlers.
- **One clean receive route** (~110 LOC) instead of V1's ~402-LOC mega-route with payload normalization + per-trigger filtering inline.
- **Drop multi-secret fallback if it ever existed** — Slice 12 commits to the single-app-secret model from the start.

---

## Open questions / decisions to flag

1. **Shop-domain normalization edge cases.** The V2 connect route accepts both `mystore` and `mystore.myshopify.com`. What about uppercase (`MyStore`)? Periods elsewhere in the input (`mystore.myshopify.com.`)? Trailing whitespace? Slice 12 Commit 2 normalizes via `.trim().toLowerCase()` and validates the resulting string against the regex; rejects all other shapes. This is documented in the connect route's JSDoc.
2. **Activation atomicity.** Creating webhooks for N topics is not transactional. If topic #4 of #5 fails, V2 best-effort deletes the 3 successful webhooks via `webhooksDelete` and returns the activation error. Acceptable trade-off — Shopify webhook creation is rare enough that the half-failure case shouldn't matter much; the rollback path is honest about which webhooks remain.
3. **`ConnectInput.providerHint` as a generalization vector.** This slice introduces the field for Shopify alone. If a future provider needs it (Mailchimp `dc`, Atlassian `cloudid`), they add their own `validateProviderHint` and read their own keys. The field is a `Record<string, string>` not a typed union — providers own validation. STOP-AND-REPORT if the shape needs widening to `Record<string, unknown>` or stricter typing.
4. **Webhook secret rotation.** Shopify's `SHOPIFY_CLIENT_SECRET` rotation is a manual env-var swap by an operator. V2 doesn't ship multi-secret fallback (Q12). If rotation becomes a real concern, a future slice can add a `SHOPIFY_CLIENT_SECRET_PREVIOUS` env var with explicit pre-period acceptance — out of scope for Slice 12.
5. **Webhook delivery on app uninstall.** When a merchant uninstalls the app, Shopify revokes the offline access token AND deletes all the merchant's webhooks. V2's deactivate path swallows 401 specifically because the webhook is already gone (Shopify cleaned up). Health-check 401 on the integration also fires `IntegrationActionRequiredError(reason: "token_revoked")`. This is the natural happy path of "merchant disconnects" — no special V2 handling needed beyond the existing 401 mapping.
6. **`X-Shopify-Webhook-Id` header presence.** Per current docs the header is always sent; V2's fallback dedup key (`${shop}:${topic}:${payload.id}:${payload.updated_at|created_at}`) protects against legacy delivery paths or missing headers. Slice 12 e2e tests the fallback path explicitly.

---

## Revised commit shape

| Commit | Title | Scope |
|---|---|---|
| **1** | `docs: slice 12 shopify plan` | This file. |
| **2** | `feat(shopify): manifest + per-shop OAuth + dispatcher registration` | `integrations/shopify/{manifest,oauth}.ts`, `services/oauth/dispatcher.ts` register, `_shared/shopify/api/_base.ts` (`apiVersion = "2024-10"` const + base URL builder), connect route accepts `shop` body field, validates strict format, threads through `ConnectInput.providerHint`. **Cross-cutting changes:** `OAuthStatePayload.providerHint`, `CreateStateInput.providerHint`, `ProviderOAuth.{buildAuthUrl,handleCallback}` 4th-arg `providerHint`. `state.ts` includes providerHint in the JWT payload. Dispatcher routes providerHint at connect + callback. Manifest capabilities: `oauth: true`, others `false`. Tests: shop format validation (regex + normalization), state-bound shop end-to-end, callback `?shop=` mismatch rejected, OAuth wire-format (per-shop URLs, JSON body, comma-separated scopes), `RefreshNotSupportedError("shopify")`, providerHint backward-compat (other providers' OAuth flows continue to pass `null`). |
| **3** | `feat(shopify): 10 actions + REST wrappers + per-shop API base routing` | `_shared/shopify/api/_request.ts` (REST wrapper — `{shopDomain, accessToken, method, path, body?}`, Bearer-equivalent header, JSON content-type, typed errors), `_shared/shopify/api/{orders,products,customers,fulfillments,inventoryLevels,webhooks}.ts` per-resource wrappers, 10 typed action handlers + Q11 schemas (Q11 gates on `notify_customer` × 2, `send_welcome_email`, `send_receipt`), country-code helper, registry updates. Manifest flips `actions: true`. Tests: every handler's body construction (snapshot test on the wire-format payload), Q11 gate enforcement (schema validation rejects missing booleans on the 4 consent fields), per-shop API base routing (handler uses the integration row's shop), 401 mapping to `IntegrationActionRequiredError`. |
| **4** | `feat(shopify): webhook_received trigger + HMAC-SHA256-base64 verification` | `_shared/shopify/api/webhooks.ts` (create + delete via merchant token), `_shared/shopify/webhooks/signature.ts` (HMAC-SHA256-base64 over raw body + global-secret + constant-time compare), `integrations/shopify/triggers/webhookReceived/{activate,deactivate,allowedTopics,normalize,index}.ts`, `app/api/webhooks/shopify/route.ts` (signature verify, lookup, dispatch, dedup). Manifest flips `webhookTrigger: true`. Tests: signature verify (valid / mismatched / malformed-base64 / missing-header), receive route (200 ack on missing query params, 401 on signature fail, 200 + dispatch on success, 200 ack on unsupported topic), topic-allowlist enforcement at activation, dedup on duplicate `X-Shopify-Webhook-Id`, fallback dedup key when header absent, multi-topic activation atomicity (rollback on partial failure). |
| **5** | `test(e2e): add Shopify walkthrough with mocked Shopify boundary` | New `tests/e2e/helpers/mockShopifyServer.ts` (port 9882) — OAuth (per-shop authorize 302, JSON-body token exchange, `/admin/api/2024-10/shop.json` for shop info), shop-scoped REST endpoints (`/admin/api/2024-10/orders.json`, `/customers.json`, `/products.json`, `/inventory_levels/set.json`), webhook subscription create + delete (`/admin/api/2024-10/webhooks.json`), signed webhook delivery via test control plane. New `tests/e2e/slice-12-shopify-walkthrough.spec.ts` exercising: shop-format validation rejects bad input, OAuth state consume binds the shop, integration row stores `shop_domain`, tokens encrypted, action call uses shop-scoped API base URL, signed webhook dispatches workflow, duplicate `X-Shopify-Webhook-Id` dedups, invalid signature rejected, mismatched-shop-on-callback rejected, multi-topic activation creates N webhooks with rollback on partial failure. |

**Total estimated output:** ~700 LOC OAuth + dispatcher cross-cuts + helpers + ~1,400 LOC actions + REST wrappers + ~600 LOC trigger + receive + signature + ~1,000 LOC e2e ≈ **~3,700 LOC** + **~170 new unit tests** + **1 e2e**. Slightly larger than Slice 11 because the cross-cutting `providerHint` plumbing adds ~150 LOC across `state.ts` / `dispatcher.ts` / `contracts/integration.ts` plus migration tests.

---

## Validation gates

After each meaningful commit:

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For Commit 5 (e2e), run all sequential provider walkthroughs + Shopify twice for stability:

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
npx playwright test tests/e2e/slice-12-shopify-walkthrough.spec.ts
```

---

## External setup

- **Shopify Partner account.** Free at partners.shopify.com. Used to register a Custom App with `client_id` + `client_secret` and to create a development store for OAuth + webhook testing.
- **Custom App configuration:**
  - **App URL** — `${V2_BASE_URL}` (the V2 deployment's public root).
  - **Allowed redirection URL** — `${V2_BASE_URL}/api/integrations/oauth/shopify/callback` (V2's standard OAuth callback path; the dynamic `[provider]` route handles routing).
  - **API scopes** — the 11 scopes listed in Q6.
- **Development store.** Free at partners.shopify.com → "Stores" → "Add store" → "Development store". Provides a `*.myshopify.com` domain for testing.
- **Env vars required:**
  - `SHOPIFY_CLIENT_ID` — Custom App's client id.
  - `SHOPIFY_CLIENT_SECRET` — Custom App's secret. Used for OAuth token exchange (body-JSON) AND for webhook signature verification (single-app-secret model). Same secret, two purposes — Shopify's design.
- **Public webhook URL.** For real webhook activation against a development store, the V2 deployment must be reachable at `${V2_BASE_URL}/api/webhooks/shopify` over HTTPS. Local-dev story: ngrok tunnel pointing at the local V2 dev server (same flow used for Slice 11 Stripe). The mocked e2e (`mockShopifyServer.ts`) does NOT require any of this — runs entirely on port 9882 with fixture credentials.

---

## Constraints

- No push.
- No PR.
- No DB migration (stop and report if one becomes necessary).
- No PKCE (Shopify doesn't accept it).
- No multi-secret webhook fallback.
- No multi-store metadata port.
- No GraphQL Admin API in Batch 1.
- No 8-trigger-type explosion — one consolidated `webhook_received` with `topic` discriminator.
- No 11+ action handlers — focused 10-action Batch 1 (`update_product_variant` deferred).
- No webhook-payload normalization at receive — raw forwarding only.
- No per-trigger-config filtering at receive — workflow logic-nodes own it.
- No silent default for `notify_customer` / `send_welcome_email` / `send_receipt` — Q11 explicit consent gates.
- No host injection — strict shop-format validation + state-binding.
- No support for unsupported topics — fail loud at activation with typed validation error.
- No per-handler test-mode short-circuits — engine-level interception only.
