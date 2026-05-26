# Parity audit — Shopify

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/shopify/`](../../integrations/shopify/) (Slice 12, shipped locally)
**Phase 1 surface shipped:** 10 actions + 1 consolidated `webhook_received` trigger (8-topic allowlist). Per-shop OAuth (first V2 multi-tenant per-shop model). HMAC-SHA256-base64 webhook signature (first V2 base64 variant). REST-only (`2024-10` API version). Non-refreshable offline access tokens.

**Recommendation up front.** Slice 12 shipped a near-complete Shopify port. The set difference of V1's 11 actions and V2's 10 is **exactly one action** (`update_product_variant`); V1's 8 trigger types are already collapsed into V2's consolidated `webhook_received` discriminator (per [`docs/slices/slice-12-shopify.md`](slice-12-shopify.md)). Two open product decisions surface and **block any larger Shopify 2.x slice**: **(NPD-S1) REST vs GraphQL.** V1 ships all 11 actions through GraphQL `2024-10`; V2 ships all 10 through REST `2024-10`. Shopify has publicly signaled that REST will eventually be deprecated for public apps. Migration cost: re-do every action wrapper, e2e mock, and unit test. **Defer to a separate slice with explicit Marcus signoff** — not pre-committed here. **(NPD-S2) Multi-shop routing for non-Shopify-triggered runs.** V2's `_resolveShop.ts` falls back to "arbitrarily first integration row" when the trigger is not Shopify-provenanced — explicitly documented as unsupported in Slice 12. A typed `shopDomain` config field on every action (V1's pattern) would close the gap; needs Marcus signoff on the UX. **Recommended next slice — Shopify 2.1** ≈ **2 commits**: port `update_product_variant` + permanent skip table for V2-uncovered V1 absences (zero net-new domain expansion). No platform-tier work. No GraphQL migration. The audit also surfaces **6 V2-domain gaps neither V1 nor V2 covers** (draft orders, discount codes, collections, gift cards, transactions, shop info) — these are **product-expansion candidates, NOT parity ports** and are explicitly out of scope unless Marcus signs off.

---

## 1. V1 source paths audited

**Action handlers** (`lib/workflows/actions/shopify/`, 12 `.ts` files, ~1,680 LOC):
- [`createOrder.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createOrder.ts) — **200 LOC**. GraphQL `orderCreate`. Line items + shipping/billing addresses + tags + notes.
- [`updateOrderStatus.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateOrderStatus.ts) — **290 LOC**. Kitchen-sink dispatcher on `config.action` (fulfill / cancel / add_tags / add_note). Requires explicit `notify_customer`.
- [`createCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createCustomer.ts) — **171 LOC**. GraphQL `customerCreate`.
- [`updateCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateCustomer.ts) — **133 LOC**. GraphQL `customerUpdate`.
- [`createFulfillment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createFulfillment.ts) — **174 LOC**. GraphQL `fulfillmentCreateV2`. **Silently defaults `notifyCustomer=true`** (V1 rot).
- [`createProduct.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createProduct.ts) — **113 LOC**. GraphQL `productCreate`.
- [`updateProduct.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProduct.ts) — **130 LOC**. GraphQL `productUpdate`.
- [`createProductVariant.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createProductVariant.ts) — **135 LOC**. GraphQL `productVariantsBulkCreate` (single-record use).
- [`updateProductVariant.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProductVariant.ts) — **155 LOC**. GraphQL `productVariantsBulkUpdate` (single-record use). **Carries the explicit comment that variant inventory update requires a separate `update_inventory` call** — clean port boundary.
- [`addOrderNote.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/addOrderNote.ts) — **103 LOC**. GraphQL `orderUpdate`; append or replace mode.
- [`updateInventory.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateInventory.ts) — **178 LOC**. GraphQL `inventoryAdjustQuantities`. add / subtract / set modes.
- [`graphqlHelpers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/graphqlHelpers.ts) — **40 LOC** shared utility (`toProductGid` / `toVariantGid` / `toOrderGid` / `toCustomerGid` / `toInventoryItemGid` / `toLocationGid` / `extractNumericId`).

**Registry:** [`lib/workflows/actions/registry.ts:1485-1512`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/registry.ts) — 11 Shopify entries, all wired.

**Node definitions:** [`lib/workflows/nodes/providers/shopify/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts) — **2,161 LOC** single consolidated file (no subdirectories). 8 trigger types + 11 action types. Per-node `shopify_store` selector field injected to support multi-shop. No `comingSoon: true` flags. Custom UI field type: `shopify_line_items`.

**Trigger lifecycle:** [`lib/triggers/providers/ShopifyTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/ShopifyTriggerLifecycle.ts) — **338 LOC**. `onActivate` POSTs Shopify Admin REST `/admin/api/2024-10/webhooks.json`; `onDeactivate` / `onDelete` DELETEs. No expiry (Shopify webhooks permanent). Topic-to-trigger-type mapping is bidirectional.

**OAuth config:** [`lib/integrations/oauthConfig.ts:490-529`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) — per-shop dynamic authorize / token endpoints (`https://{shop}.myshopify.com/admin/oauth/*`). **24 scopes** (11 read + 11 write + 2 third-party fulfillment-order pairs). Body-form token exchange. Non-refreshable. Multi-shop modeled via `metadata.stores: [{shop, name, id}]` array on a SINGLE integration row.

**Webhook receive route:** [`app/api/webhooks/shopify/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts) — **403 LOC**. HMAC-SHA256 over raw body; base64; constant-time compare. Topic dispatch via 8-entry map. Optional `?workflowId=` query param for strict-direct routing. No in-memory dedup; relies on `trigger_resources` lookup uniqueness.

**Webhook subscription management:** Programmatic via `ShopifyTriggerLifecycle`. No per-provider cron; Shopify webhooks don't expire.

**Rate limiting:** None V1-side. 429 returns failure result to workflow with a user-facing message "Shopify API rate limit exceeded. Please try again later." No backoff, queue, or retry.

**API versioning:** GraphQL `2024-10` for all actions. REST `2024-10` for webhook management. Legacy REST `2024-01` path exists in a deprecated `makeShopifyRequest()` helper but is unused.

**Tests:** [`__tests__/nodes/shopify-create-customer.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/shopify-create-customer.test.ts) — **401 LOC**. Single comprehensive action test; covers GraphQL mutation shape, userError handling, integration validation, HTTP errors, 401 → action_required, idempotency, safety floors. Plus [`__tests__/workflows/pr-g5-mailchimp-shopify-ai-required-fields.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/pr-g5-mailchimp-shopify-ai-required-fields.test.ts) — **217 LOC** cross-provider test. **Sparse coverage** for the other 10 actions.

---

## 2. V1 actions inventory

11 V1-registered actions (no orphans, no unregistered files):

| # | V1 action type | One-line description | Status |
|---|---|---|---|
| 1 | `shopify_action_create_order` | Create order with line items + addresses + tags + notes. GraphQL `orderCreate`. | live |
| 2 | `shopify_action_update_order_status` | Fulfill / cancel / add_tags / add_note router on `config.action`. Requires explicit `notify_customer`. GraphQL. | live |
| 3 | `shopify_action_add_order_note` | Append or replace order note. GraphQL `orderUpdate`. | live |
| 4 | `shopify_action_create_customer` | Create customer with email / name / phone / tags / marketing consent. GraphQL `customerCreate`. | live |
| 5 | `shopify_action_update_customer` | Update customer fields incl. marketing state. GraphQL `customerUpdate`. | live |
| 6 | `shopify_action_create_fulfillment` | Create fulfillment from fulfillment orders + tracking info. **Silently defaults `notifyCustomer=true`** (V1 rot). GraphQL `fulfillmentCreateV2`. | live |
| 7 | `shopify_action_create_product` | Create product (auto-creates default variant). GraphQL `productCreate`. | live |
| 8 | `shopify_action_update_product` | Update product title / description / vendor / type / tags / publish status. GraphQL `productUpdate`. | live |
| 9 | `shopify_action_create_product_variant` | Add variant to existing product. GraphQL `productVariantsBulkCreate` (single-record use). | live |
| 10 | `shopify_action_update_product_variant` | Update variant price / SKU / barcode / weight / options. GraphQL `productVariantsBulkUpdate` (single-record use). Variant inventory update requires separate `update_inventory` call. | live |
| 11 | `shopify_action_update_inventory` | Adjust inventory by delta (add/subtract) or absolute (set). GraphQL `inventoryAdjustQuantities`. | live |

No V1 Shopify orphans. No `comingSoon: true` flags. No "kitchen-sink" multi-purpose router beyond `updateOrderStatus`.

---

## 3. V1 triggers inventory

8 V1 trigger types — all webhook, per-workflow lifecycle (one Shopify webhook subscription per (workflow, topic)):

| # | V1 trigger type | Shopify webhook topic | Filters |
|---|---|---|---|
| 1 | `shopify_trigger_new_order` | `orders/create` | fulfillment + payment status |
| 2 | `shopify_trigger_new_paid_order` | `orders/paid` | fulfillment status |
| 3 | `shopify_trigger_order_fulfilled` | `orders/fulfilled` | — |
| 4 | `shopify_trigger_abandoned_cart` | `checkouts/create` | minimum_value |
| 5 | `shopify_trigger_order_updated` | `orders/updated` | watch_field (fulfillment_status / financial_status / tags / note) |
| 6 | `shopify_trigger_new_customer` | `customers/create` | — |
| 7 | `shopify_trigger_product_updated` | `products/update` | collection_id |
| 8 | `shopify_trigger_inventory_low` | `inventory_levels/update` | threshold + location |

Lifecycle: one webhook per (workflow, topic) via `ShopifyTriggerLifecycle.onActivate`. Renewal: not needed (Shopify webhooks don't expire). Deactivation: `onDeactivate`.

---

## 4. V2 current surface

10 actions (Slice 12 Commit 3, registered in [`services/execution/handlers/_registry.ts:399-408`](../../services/execution/handlers/_registry.ts)):

1. `create_order` — REST POST `/orders.json`. Wrapper: [`ordersCreate`](../../integrations/_shared/shopify/api/orders.ts).
2. `update_order_status` — Fulfill / cancel / add_tags / add_note discriminator (Zod `discriminatedUnion`). REST POST/POST/PUT/PUT.
3. `add_order_note` — REST PUT `/orders/{id}.json`; append or replace.
4. `create_fulfillment` — REST POST `/orders/{id}/fulfillments.json`. **`notify_customer` REQUIRED** (Q11 — V1's silent default rejected).
5. `create_product` — REST POST `/products.json` with initial variant.
6. `update_product` — REST PUT `/products/{id}.json`.
7. `create_product_variant` — REST POST `/products/{id}/variants.json`.
8. `create_customer` — REST POST `/customers.json`.
9. `update_customer` — REST PUT `/customers/{id}.json`.
10. `update_inventory` — REST POST `/inventory_levels/set.json` or `/adjust.json`; set / add / subtract routing.

1 consolidated trigger (Slice 12 Commit 4, [`integrations/shopify/triggers/webhookReceived/`](../../integrations/shopify/triggers/webhookReceived/)):

- `webhook_received` — webhook trigger. Activation creates one subscription per selected topic from an 8-entry allowlist (`orders/create`, `orders/paid`, `orders/fulfilled`, `orders/updated`, `customers/create`, `products/update`, `checkouts/create`, `inventory_levels/update`). Payload exposes `{topic, shopDomain, webhookId, body}`. HMAC-SHA256-base64 verification at receive route ([`app/api/webhooks/shopify/route.ts`](../../app/api/webhooks/shopify/route.ts) — 113 LOC). Dedup via `X-Shopify-Webhook-Id` header. Strict-direct routing via `?workflowId=X&nodeId=Y`. Renewal: NONE — Shopify webhooks don't expire (matches Stripe pattern).

Manifest ([`integrations/shopify/manifest.ts`](../../integrations/shopify/manifest.ts), 129 LOC):
- `tokenScope: "user"` (per-shop multi-tenant), `accountIdField: "shopDomain"` (full `*.myshopify.com` host).
- `apiVersion: "2024-10"`, `oauthFlows: ["v2"]`, `refreshable: false`.
- **11 required scopes** (down from V1's 24 — Slice 12 dropped read-only duplicates and the three third-party fulfillment-order pairs).
- `healthCheckIntervalMs: 12h`.
- Capabilities: `oauth: true`, `webhookTrigger: true`, `pollingTrigger: false`, `actions: true`.

OAuth ([`integrations/shopify/oauth.ts`](../../integrations/shopify/oauth.ts), 349 LOC):
- Per-shop dynamic URLs. Shop-domain regex-validated against `^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$`.
- **JSON body** token exchange (Shopify-specific; not form-urlencoded).
- `refreshToken()` throws `RefreshNotSupportedError("shopify")`.
- Comma-separated scopes (Shopify-specific format).
- Backward-compatible `ConnectInput.providerHint?: { shop?: string }` extension to the OAuth dispatcher contract.
- Per-shop integration ROW (one per `(user, shopDomain)`). No `metadata.stores: []` array. **V1's single-row-multi-shop model is NOT ported.**

E2E: [`tests/e2e/slice-12-shopify-walkthrough.spec.ts`](../../tests/e2e/slice-12-shopify-walkthrough.spec.ts) (608 LOC). Covers OAuth (per-shop validation), all 10 actions, webhook activate/receive/deactivate, multi-shop scenario (two integration rows), HMAC verification, dedup.

Unit tests: **3,918 LOC across 28 files** under `tests/unit/integrations/shopify/` (1,477 actions + 557 oauth + 69 manifest + 701 triggers/webhookReceived) + `tests/unit/integrations/_shared/shopify/` (860 api wrappers + 134 signature + 71 errors).

---

## 5. Missing actions

Set difference: V1 registered (11) minus V2 (10) = 1 candidate.

| V1 action | One-line gap |
|---|---|
| `shopify_action_update_product_variant` | Update variant price / SKU / barcode / weight / options on an existing variant. V1 uses GraphQL `productVariantsBulkUpdate` (single-record use). V2 lacks both a wrapper (`variantsUpdate`) and an action. Variant inventory update is **out of scope** — that goes through `update_inventory` (already shipped). |

No V1 Shopify orphans.

**Six V2-domain absences neither V1 nor V2 covers** (not parity gaps; product-expansion candidates):
- **draft orders** — create / update / complete. V1 has no draft order actions.
- **discount codes / price rules** — create / delete. V1 has none.
- **collections** — create / update. V1 has none (only a `collection_id` filter on the `product_updated` trigger via a dynamic data selector).
- **gift cards** — create / disable. V1 has none.
- **transactions** — capture / refund. V1 has none (V1 has a `cancel` sub-action on `update_order_status` that triggers a refund as a side effect, but no explicit refund/capture action).
- **shop info read** — GET `/shop.json` for store metadata. V1 uses this internally during OAuth callback for displayName + plan; no exposed action.

---

## 6. Missing triggers

Set difference: V1 (8 trigger types) minus V2 (1 consolidated trigger covering V1's 8 topics) = **0 candidates**.

Slice 12 already folded V1's 8 trigger types into `webhook_received` with an 8-topic allowlist. Workflows branch on `payload.topic` for topic-specific behavior.

**Topic coverage gaps neither V1 nor V2 covers** (not parity gaps; product-expansion candidates):
- `app/uninstalled` — fires when the merchant uninstalls the app. Useful for cleanup / disconnect flows.
- `products/create`, `products/delete` — V1 only listens to `products/update`.
- `orders/cancelled` — V1 derives cancellation from `orders/updated` watch_field. A dedicated topic would simplify workflows.
- `orders/refunded`, `refunds/create` — refund-specific signals not in either V1 or V2.
- `fulfillments/create`, `fulfillments/update` — fulfillment-lifecycle granularity not in either V1 or V2 (V1's `orders/fulfilled` and V2's `orders/fulfilled` cover only the order-level transition).
- `inventory_levels/connect`, `inventory_levels/disconnect` — inventory-tracking enablement events not in either.

---

## 7. Port / skip / defer table

Every row from §5 + §6.

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `update_product_variant` | action | **PORT (Shopify 2.1)** | The single net-new action gap. Mirror the existing `update_product` / `create_product_variant` Slice 12 shape. REST PUT `/variants/{id}.json` for Slice 12 consistency (REST-only); GraphQL migration is a separate decision (NPD-S1). Variant inventory update intentionally NOT included — workflow authors compose `update_inventory` downstream (same boundary V1 enforces). |
| Draft orders (V1 absent) | action | **DEFER pending product signal** | Not a parity gap — V1 doesn't have these. Real product demand may justify a future Shopify 2.2; not pre-committed. |
| Discount codes / price rules (V1 absent) | action | **DEFER pending product signal** | Same. Phase 5 AI planner may flag this if customer workflows reference promo codes; revisit then. |
| Collections (V1 absent) | action | **DEFER pending product signal** | Same. V1 only exposes the collection-id selector on the `product_updated` trigger via a dynamic-data lookup. |
| Gift cards (V1 absent) | action | **PERMANENT SKIP** | Gift-card creation has financial / compliance implications (KYC, regulatory). Workflow automation of gift-card minting is a high-blast-radius use case; recommend never auto-mint from workflows. |
| Transactions / refunds (V1 absent) | action | **DEFER pending product signal** | High-blast-radius (real money movement). Q11 explicit-consent guard required. Revisit when a workflow author asks. |
| Shop info read (V1 absent) | action | **DEFER pending product signal** | Trivial read action. Workflow recipe doesn't have a strong use case beyond debugging. Add if requested. |
| `app/uninstalled` topic | trigger | **DEFER pending platform integration** | The topic itself is straightforward to add to the allowlist; usefulness depends on whether V2 hooks app-uninstall into integration cleanup (a Phase 7 ops concern). |
| `products/create`, `products/delete` | trigger | **DEFER pending product signal** | Trivial allowlist extension once a workflow author asks. |
| `orders/cancelled`, `orders/refunded`, `refunds/create` | trigger | **DEFER pending product signal** | Same. Currently derivable from `orders/updated`. |
| `fulfillments/create`, `fulfillments/update` | trigger | **DEFER pending product signal** | Same. |
| `inventory_levels/connect`, `inventory_levels/disconnect` | trigger | **DEFER pending product signal** | Same. |

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 categories:

| ID | Pattern | Citation | V2 status |
|---|---|---|---|
| S-R1 | `updateOrderStatus.ts` is a 4-mode kitchen-sink dispatcher on `config.action` | [`updateOrderStatus.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateOrderStatus.ts) — 290 LOC, 4 sub-actions (fulfill / cancel / add_tags / add_note) | **PORTED with bounded dispatcher** — V2's `update_order_status` uses a Zod `discriminatedUnion` so the dispatcher is bounded + type-safe rather than a stringly-typed router. Not a per-sub-action split because the four ops share input shape (orderId + notify_customer) and are conceptually one order-lifecycle surface. |
| S-R2 | `createFulfillment` silently defaults `notifyCustomer=true` | [`createFulfillment.ts:36-40`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createFulfillment.ts) | **NOT PORTED — fixed.** V2 requires explicit `notify_customer: z.boolean()` at the schema layer (Q11 — verified at `integrations/shopify/actions/createFulfillment.schema.ts:8-20`). |
| S-R3 | `createOrder` has NO `send_receipt` flag — relies on Shopify's silent default | [`createOrder.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createOrder.ts) | **NOT PORTED — fixed.** V2 requires explicit `send_receipt: z.boolean()` at the schema layer (Q11 — verified at `integrations/shopify/actions/createOrder.schema.ts:8-58`). |
| S-R4 | `productVariantsBulkCreate` / `productVariantsBulkUpdate` GraphQL mutations used for single-record operations | `createProductVariant.ts` + `updateProductVariant.ts` | **NOT PORTED.** V2 uses REST single-record endpoints (`POST /products/{id}/variants.json`, future `PUT /variants/{id}.json`). The Shopify GraphQL "bulk" mutation naming is misleading — these are not true batch APIs (max 1 variant typical usage); V1 paid the GraphQL complexity cost for no batch benefit. |
| S-R5 | `metadata.stores: [{shop, name, id}]` array model on a SINGLE integration row | [`oauthConfig.ts:490-529`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) + every action's `config.shopify_store` selector | **NOT PORTED.** V2 ships per-shop integration rows (one row per `(user, shopDomain)`). `providerAccountId` IS the shop domain. Cleaner, but exposes the multi-shop routing ambiguity surfaced as NPD-S2 below. |
| S-R6 | V1 supports 24 OAuth scopes including third-party fulfillment-order pairs | V1 `oauthConfig.ts:490-529` | **NOT PORTED.** V2 ships exactly 11 required scopes (`read_orders` / `write_orders` / `read_products` / `write_products` / `read_customers` / `write_customers` / `read_inventory` / `write_inventory` / `read_checkouts` / `read_fulfillments` / `write_fulfillments`). V1's `read_locations`, `write_locations`, `read_assigned_fulfillment_orders` etc. are unused by any V1 action — defensive bloat. |
| S-R7 | Legacy `makeShopifyRequest()` helper supports REST `2024-01` | V1 deprecated function | NOT PORTED — V2 uses REST `2024-10` exclusively. |
| S-R8 | `STORE_SELECTOR_FIELD` (`shopify_store`) injected into EVERY V1 action + trigger schema | [`lib/workflows/nodes/providers/shopify/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts) | **NOT PORTED.** V2 deliberately omits per-action shop selection: the integration row IS the store (`_resolveShop.ts` resolves via `triggerEvent.accountId` or DB fallback). This is cleaner BUT creates the NPD-S2 ambiguity for cross-provider triggers. |
| S-R9 | 401 error message + token-refresh attempt despite Shopify being non-refreshable | V1 `createCustomer.ts` has `refreshAndRetry` wrapping despite Shopify offline tokens not refreshing | NOT PORTED — V2's `authSchemes.ts` lists Shopify as `non_refreshable`; 401 short-circuits to `IntegrationActionRequiredError(reason: "action_required")` without a refresh attempt. |
| S-R10 | No V1-side rate-limit handling on 429 | V1's `createShopifyApiError` maps 429 to a user-facing message; no retry, no backoff | NOT PORTED — V2 has the same passthrough behavior. **NPD-S3**: rate-limit handling is an open product decision (see §10 + §12). |
| S-R11 | V1 webhook receive route has 403-LOC handler logic | [`app/api/webhooks/shopify/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/shopify/route.ts) (403 LOC) | NOT PORTED as-is — V2 ships a 113-LOC receive route that delegates to `dispatchTriggerEvent` and the shared `webhook_event_dedup`. V1's per-topic payload transformation is replaced by V2's `normalize.ts` which forwards the raw Shopify body verbatim under `payload.body`. |
| S-R12 | V1 sparse test coverage — only 1 dedicated Shopify test file covering 1 of 11 actions | [`__tests__/nodes/shopify-create-customer.test.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/nodes/shopify-create-customer.test.ts) | NOT PORTED as a problem — V2 ships 28 unit files (3,918 LOC) covering every action + wrapper + trigger + OAuth + manifest. |
| S-R13 | V1 has no monitored topic for `app/uninstalled` cleanup | V1 webhook receive route lacks the topic | NOT PORTED — neither does V2. Tracked as deferred product expansion. |

---

## 9. V2 dependency map

Which V2 contracts each ported / redesigned item depends on. Identifies contract gaps.

| Item | Dependencies | Contract gap |
|---|---|---|
| `update_product_variant` | `shopifyRequest`, `refreshAndRetry` (no-op for non-refreshable Shopify; 401 → action_required), `variantsUpdate` wrapper (**NEW**), action handler registry | **One new wrapper** in `integrations/_shared/shopify/api/products.ts`: `variantsUpdate({variantId, fields, ...})` → REST `PUT /variants/{id}.json`. Shopify's REST API supports variant updates at the `/variants/{id}` endpoint without the parent product path (handles the orphan-variant case cleanly). |
| (Deferred) Domain expansions (draft orders / discount codes / collections / refunds) | Each needs new wrappers + new action schemas | Multiple new wrappers per resource type. Each is a separate slice candidate, NOT bundled into Shopify 2.1. |

Everything else (`shopifyRequest`, `refreshAndRetry`, action handler registry, `subscriptionRegistry` opt-out via Stripe pattern, `webhook_event_dedup`, HMAC base64 verification) **already exists**.

---

## 10. Required platform gaps (if any)

**Zero platform-tier prerequisites for Shopify 2.1** (`update_product_variant`).

Two open product decisions block any larger Shopify 2.x slice — listed for clarity, not required for 2.1:

- **NPD-S1: REST vs GraphQL.** V2 chose REST in Slice 12 (alignment with most other V2 providers; simpler error handling; no GraphQL helper layer required). Shopify has publicly stated (Apr 2024 announcement) that all NEW public apps must use GraphQL, with REST eventually deprecated for new public apps. Custom / private apps (which ChainReact's per-shop OAuth could be modeled as) still allowed on REST per current policy. **Open decision:** migrate to GraphQL preemptively (cost: re-wrap every action + e2e mock + unit tests, roughly Slice 12 again), or stay on REST until Shopify forces the migration. The decision is product-strategic, not a parity question. Recommend deferring until either (a) Shopify announces a concrete REST sunset date, or (b) a customer hits a GraphQL-only feature.

- **NPD-S2: Multi-shop routing for non-Shopify-triggered runs.** V2's [`_resolveShop.ts`](../../integrations/shopify/actions/_resolveShop.ts) documents the limitation explicitly: *"Multi-shop users without Shopify-triggered workflows are not supported in Batch 1: `getActiveForExecution(..., null)` returns the first active row arbitrarily."* This is a real production gap if a user has more than one Shopify integration row and runs a workflow with a non-Shopify trigger. **Closure options:**
  - **(a) Typed `shopDomain` field on every action schema.** Workflow authors pin the shop at config time. Adds one required field to all 10 (soon 11) Shopify actions; backward-incompatible unless wrapped in optional + DB fallback (which silently picks "first" again). Closest to V1's pattern.
  - **(b) UI / variable-mapping layer responsibility.** Phase 3 UI exposes a shop picker per Shopify action; resolved value flows into the existing `_resolveShop.ts` lookup. No schema change; pushes the problem one layer up.
  - **(c) Document the limitation; require Shopify-trigger provenance for multi-shop users.** Cheapest. Users with one shop are unaffected. Users with multiple shops must structure workflows around Shopify triggers.

Recommend **(c)** for Shopify 2.1, with explicit Marcus signoff. **(a)** or **(b)** is its own slice.

**NPD-S3: Rate-limit handling.** Neither V1 nor V2 handle Shopify 429 specially. Shopify's REST uses a leaky-bucket model (2 calls/sec per shop, burst to 40); GraphQL uses a cost-based bucket. A heavy workflow can saturate quickly. **Open decision:** add provider-tier backoff / queue (probably a `Retry-After` header reader inside `shopifyRequest`), or document the workflow-author guidance ("add a `wait` node before high-volume Shopify chains") and move on. Recommend deferring until a customer report surfaces.

---

## 11. Effort estimate

Compared to Phase 1 reference slices:

- **Shopify 2.1 = ~Stripe-2.1's-narrow-half.** One net-new action (`update_product_variant`) + one wrapper + ~150 test lines + e2e extension + outcomes doc. Roughly 3 commits in the same shape: audit → action ship → outcomes.

| Commit | Scope | Est. LOC |
|---|---|---|
| 0 | This audit. Doc-only. | — |
| 1 | `feat(shopify): add update_product_variant action` (new wrapper `variantsUpdate` + action + schema + tests + registry entry + manifest test count bump 10 → 11). | ~150 src + ~200 test |
| 2 | `test(shopify): extend walkthrough with update_product_variant scenario` (one new scenario in the existing e2e covering update path; assert REST PUT body + bounded output). | ~80 src + ~120 e2e |
| 3 | `docs(shopify): document 2.1 outcomes` + CLAUDE.md durable rules. | — |

**Total estimate: 2 implementation commits + 1 audit + 1 outcomes ≈ ~230 src LOC + ~320 test LOC + ~50 docs LOC.** Tiny vs Stripe 2.1 (6 actions) and Airtable 2.1 (3 actions + 1 trigger fold + field-type promotion). This reflects how complete Slice 12 already is.

**If Marcus accepts a GraphQL migration as part of Shopify 2.x:** add **~6 commits** for action-by-action GraphQL rewrites + GraphQL helper layer in `_shared/shopify/`. Treat as Shopify 2.2+, NOT bundled with the 2.1 `update_product_variant` port.

**If Marcus accepts NPD-S2 closure via option (a):** add **~2 commits** for a `shopDomain` field plumb across all 11 action schemas + V2 dispatch layer. Treat as Shopify 2.3 or a separate platform slice; NOT bundled with 2.1.

---

## 12. Risk estimate

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Marcus accepts Shopify 2.1 = single action + permanent skip table; later regrets not closing NPD-S2 multi-shop routing in the same slice | medium | low | Surface NPD-S2 explicitly in this audit's recommendation. Document the limitation in CLAUDE.md durable rules so future provider work doesn't drift. Closure is straightforward when product signal demands. |
| R2 | `variantsUpdate` REST endpoint behavior subtly differs from V1's GraphQL `productVariantsBulkUpdate` (option-field handling, inventory-tracked changes, etc.) | low | medium | V2 already uses REST for `create_product_variant`; the wire-format and edge cases are already validated. Mirror that shape. Test against Shopify's REST docs for `PUT /admin/api/2024-10/variants/{id}.json` explicitly. |
| R3 | Shopify announces a REST sunset date during Shopify 2.1 implementation, invalidating the REST-only strategy | low | high | Already declared as open product decision NPD-S1; Marcus has visibility. If a sunset announcement lands, Shopify 2.2 immediately pivots to GraphQL migration. |

---

## 13. Recommended parity batch plan

Ordered list of commits Shopify 2.1 would land if accepted:

| Commit | Title | Scope |
|---|---|---|
| **0** | `docs(shopify): add parity audit` | This doc. **Doc-only.** Pending Marcus's acceptance. |
| **1** | `feat(shopify): add update_product_variant action` | New wrapper `variantsUpdate` in `integrations/_shared/shopify/api/products.ts` (REST `PUT /variants/{id}.json`). New action handler + Zod schema. Registry entry. Manifest action-count test bumped 10 → 11. Variant inventory update intentionally NOT included — workflow authors compose `update_inventory` downstream (matches V1 boundary). |
| **2** | `test(shopify): extend walkthrough with update_product_variant scenario` | One new scenario in the existing e2e walkthrough covering update path; assert REST PUT body shape (price, sku, barcode, weight, options) + bounded output. Optionally chain create_product_variant → update_product_variant in one compressed test to validate the variant identifier flows correctly. |
| **3** | `docs(shopify): document 2.1 outcomes` | New `docs/slices/shopify-2-1-outcomes.md` + CLAUDE.md "Phase 2 progress (Shopify)" entry + Deep Gotchas "Shopify Phase 2 patterns" subsection capturing: REST-only choice + future GraphQL migration deferred (NPD-S1); per-shop integration row + multi-shop routing limitation documented (NPD-S2); rate-limit handling deferred (NPD-S3); explicit notification flags required (Q11); no GraphQL "bulk" mutation for single-record variant ops; permanent skip table for V2-uncovered V1 absences. |

**Each implementation commit independently passes gates:** `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`. Commit 2 additionally passes `npx playwright test tests/e2e/slice-12-shopify-walkthrough.spec.ts --workers=1`.

**No commit introduces a new platform contract.** No new shared utility module beyond the one wrapper; no new contract type; no new infrastructure cron; no schema migration.

---

## 14. Exit checklist

This audit is complete when:

- [ ] Marcus has read §1 (paths) + §2 (V1 actions) + §3 (V1 triggers) + §4 (V2 today) and agrees the inventory is accurate.
- [ ] §5 + §6 (missing items) match Marcus's understanding of the parity gap — specifically, that **only `update_product_variant` is a true parity gap** action-side and **zero triggers** are parity gaps (V1's 8 trigger types folded into V2's `webhook_received` already).
- [ ] §7 (port / skip / defer) decisions accepted, especially:
  - `update_product_variant` PORT in Shopify 2.1 (the only action port).
  - 6 V2-uncovered V1 absences (draft orders / discount codes / collections / gift cards / refunds / shop info) DEFER pending product signal OR PERMANENT SKIP for gift cards.
  - 6 V2-uncovered trigger topics (app/uninstalled / products/create / products/delete / orders/cancelled / refunds / fulfillments lifecycle) DEFER.
- [ ] §8 (V1 rot) inventory accepted — confirms most rot was already addressed in Slice 12, and that S-R2 (silent notifyCustomer default) and S-R3 (silent send_receipt) are intentional NOT-PORTED + Q11-required-flag fixes.
- [ ] §10 (platform gap) — no required prerequisites; three open product decisions (NPD-S1 / NPD-S2 / NPD-S3) called out for visibility, NOT bundled with 2.1.
- [ ] §11 (effort) ≈ 2 implementation commits + 1 audit + 1 outcomes is in the right ballpark.
- [ ] §13 (batch plan) commit ordering accepted.
- [ ] **Open decisions confirmed:**
  - **NPD-S1:** REST vs GraphQL strategy — recommendation: **DEFER. Stay on REST until Shopify announces a concrete REST sunset date or a customer hits a GraphQL-only feature.** A migration would be its own 6+ commit slice, treated as Shopify 2.2 or later. Accept/reject.
  - **NPD-S2:** Multi-shop routing for non-Shopify-triggered runs — recommendation: **DEFER. Document the limitation in CLAUDE.md durable rules and the Shopify 2.1 outcomes doc; users with multiple Shopify shops should structure workflows around Shopify triggers.** Closure via typed `shopDomain` field or UI shop picker is its own slice if signal emerges. Accept/reject.
  - **NPD-S3:** Shopify 429 / rate-limit handling — recommendation: **DEFER until a customer report surfaces.** Document workflow-author guidance ("add a `wait` node before high-volume Shopify chains"). Accept/reject.
  - **NPD-S4:** Gift card automation — recommendation: **PERMANENT SKIP** on Q11 / blast-radius grounds. Gift-card creation has financial / compliance implications (KYC, regulatory). Workflow auto-mint is high-blast-radius; recommend never expose. Accept/reject.
  - **NPD-S5:** Domain-expansion priority (draft orders / discount codes / collections / refunds / shop info) — recommendation: **DEFER pending Phase 5 AI planner / Phase 3 UI usage signal.** Revisit when at least one workflow template / customer demo references the domain. Accept/reject.
- [ ] Implementation does not start until all checkboxes are ticked.
