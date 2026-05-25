# Shopify — Builder Metadata Coverage Plan (SHOPIFY-META-1)

**Slice:** 4.PROVIDER-DOCS-1 (this plan) → SHOPIFY-META-2 (implementation)
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md)
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Shopify is the **first** of the 9 pending-metadata providers and the chosen lead because its action surface is the flattest (scalars, IDs, enums; no nested-object pickers required for a correct first pass) and its single trigger mirrors the already-shipped HubSpot consolidated `webhook_received` pattern.

**Current state (code-verified):** 11 runtime actions + 1 webhook trigger registered and real; **0 ActionMeta, 0 TriggerMeta**; absent from the discovery registry; `/api/providers` reports `hasMetadata: false` → Shopify renders as **"coming soon"** in the Builder. Runtime handlers are not changed by this track.

---

## 1. Current Shopify runtime inventory

**Manifest** (`integrations/shopify/manifest.ts`): id `shopify`, displayName "Shopify". OAuth per-shop (`tokenScope: "user"`, `accountIdField: "shopDomain"`, non-refreshable offline tokens). API version pinned 2024-10. Scopes: read/write orders, products, customers, inventory, fulfillments + read_checkouts. Capabilities `oauth/webhookTrigger/actions: true`, `pollingTrigger: false`. Shared API helpers under `integrations/_shared/shopify/api/` (`orders`, `products`, `customers`, `fulfillments`, `inventoryLevels`, `webhooks`, `_base`, `_request`, `errors`). `actions/_resolveShop.ts` is a helper (shop domain from the integration row), not an action.

### 1.1 Registered action handlers (11)

| # | Action key | Handler file | Config schema (fields) | Output shape | Risk / side-effect | Sensitive outputs | Field nature |
|---|---|---|---|---|---|---|---|
| 1 | `create_order` | `actions/createOrder.ts` | `email`*(text), `line_items`*(array{variant_id:num*, quantity:num*}), `send_receipt`*(bool, Q11), `financial_status`(enum: pending/authorized/paid/partially_paid/refunded/voided), `note`, `tags`, `shipping_address`(obj), `billing_address`(obj) | orderId, orderNumber, orderName, email, totalPrice, currency, financialStatus, fulfillmentStatus, adminUrl, createdAt | create + **customer email** (send_receipt) | email | scalars + 1 array-of-obj + 2 nested addr objects → paste-JSON/textarea for arrays/objects v1; `variant_id` is an ID |
| 2 | `update_order_status` | `actions/updateOrderStatus.ts` | discriminated on `action`: **cancel**{order_id*, notify_customer*(bool), reason(enum: customer/fraud/inventory/declined/other), restock(bool)} / **add_tags**{order_id*, notify_customer*, tags*} / **add_note**{order_id*, notify_customer*, note*} | success, orderId, orderNumber, status, adminUrl, updatedAt | update; **cancel** is significant + customer email | — | `order_id` ID; `action`/`reason` enums |
| 3 | `add_order_note` | `actions/addOrderNote.ts` | order_id*, note*, append*(bool) | success, orderId, note, updatedAt | update (internal note, no email) | — | `order_id` ID + scalars |
| 4 | `create_fulfillment` | `actions/createFulfillment.ts` | order_id*, notify_customer*(bool, Q11), tracking_number, tracking_company, tracking_url(url) | success, fulfillmentId, orderId, status, trackingNumber, trackingUrl, adminUrl, createdAt | create + **customer shipping email** | — | `order_id` ID + scalars |
| 5 | `create_product` | `actions/createProduct.ts` | title*, price*(decimal-string), body_html, vendor, product_type, sku, inventory_quantity(num) | productId, variantId, title, vendor, adminUrl, createdAt | create | — | all scalars |
| 6 | `update_product` | `actions/updateProduct.ts` | product_id*, title, body_html, vendor, product_type, tags, published(bool) | success, productId, title, status, adminUrl, updatedAt | update | — | `product_id` ID + scalars |
| 7 | `create_product_variant` | `actions/createProductVariant.ts` | product_id*, price*(decimal-string), option1/2/3, sku, inventory_quantity(num), weight(num), barcode | success, variantId, productId, sku, price, adminUrl, createdAt | create | — | `product_id` ID + scalars |
| 8 | `update_product_variant` | `actions/updateProductVariant.ts` | variant_id*, price, compare_at_price, sku, barcode, option1/2/3, weight(num), weight_unit(enum g/kg/oz/lb), taxable(bool) — ≥1 mutable required | success, variantId, productId, title, price, compareAtPrice, sku, barcode, option1-3, inventoryItemId, adminUrl, updatedAt | update | — | `variant_id` ID + scalars/enum |
| 9 | `create_customer` | `actions/createCustomer.ts` | email*, send_welcome_email*(bool, Q11), first_name, last_name, phone, tags | customerId, email, firstName, lastName, adminUrl, createdAt | create + **customer welcome email** | email, firstName, lastName, phone | scalars |
| 10 | `update_customer` | `actions/updateCustomer.ts` | customer_id*, email, first_name, last_name, phone, tags, note, accepts_marketing(bool) | success, customerId, email, adminUrl, updatedAt | update; `accepts_marketing` is a consent field | email | `customer_id` ID + scalars |
| 11 | `update_inventory` | `actions/updateInventory.ts` | inventory_item_id*, location_id*, adjustment_type*(enum set/add/subtract), quantity*(num≥0) | success, inventoryItemId, locationId, newQuantity, updatedAt | update (can oversell/undersell) | — | 2 IDs + enum + number |

`*` = required at the handler schema layer.

### 1.2 Registered trigger (1)

| Trigger key | Files | Model | Activation | Config | Payload |
|---|---|---|---|---|---|
| `webhook_received` | `triggers/webhookReceived/{index,activate,deactivate,allowedTopics,normalize,receive}.ts` | **Webhook** (no polling; Shopify webhooks are permanent — no renewal cron, no `subscription-watch` marker) | `index.ts` registers activation/deactivation. Activate creates one webhook subscription per selected topic (`POST /webhooks.json`), persists `{webhookEnabled, shopDomain, topics[], subscriptions[{topic,webhookId}], notificationUrl}` to `trigger_resources.config`; best-effort rollback on partial failure. Deactivate DELETEs each subscription (swallows 404/401). | `topics`*(string[], non-empty) chosen from the 8-entry allowlist (`allowedTopics.ts`): `orders/create`, `orders/paid`, `orders/fulfilled`, `orders/updated`, `customers/create`, `products/update`, `checkouts/create`, `inventory_levels/update` | Discriminated on `topic`; HMAC-SHA256 verified (`X-Shopify-Hmac-SHA256`), deduped via `X-Shopify-Webhook-Id` → `webhook_event_dedup` |

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern reference: `integrations/stripe/actions/createCustomer.meta.ts` (flat object-id provider, closest analog). Each action gets a co-located `<action>.meta.ts` mirroring its `.schema.ts` 1:1.

**Defaults common to all 11:** `requiresIntegration: true`; `category: "commerce"`; `producesFileRef/consumesFileRef: false`; sequential `displayOrder`; outputs mirror the handler `return` exactly (no raw spread).

**Risk classification (per `contracts/actionMeta.ts` `RiskLevel`):** all 11 mutate external Shopify state → none are pure-read `low`. Recommended baseline `riskLevel: "medium"`, `isDestructive: false`, `requiresConfirmation: false`, with a `riskDescription`. **Two call-outs decided in §5:** `update_order_status` (cancel route) and `create_fulfillment` carry the strongest side effects.

**Field-type mapping (FieldType vocabulary):**
- text → `email`, IDs (`order_id`, `product_id`, `variant_id`, `customer_id`, `inventory_item_id`, `location_id`), `sku`, `barcode`, `vendor`, `product_type`, `tags`, `price`/`compare_at_price` (decimal-as-string), `option1/2/3`, names, `phone`, `tracking_*`.
- textarea → `note`, `body_html`, and the array/object fields shipped as **paste-JSON** for v1 (`create_order.line_items`, `shipping_address`, `billing_address`) — mirrors the established Notion/HubSpot/Stripe paste-JSON bridge; the handler schema remains authoritative.
- number → `quantity`, `inventory_quantity`, `weight` (with `numeric` bounds: `min:0`, `integer` where applicable).
- boolean → `send_receipt`, `notify_customer`, `restock`, `append`, `published`, `taxable`, `accepts_marketing`, `send_welcome_email`.
- select → enums: `financial_status`, `update_order_status.action`, `update_order_status.reason`, `weight_unit`, `update_inventory.adjustment_type` (static `options[]`).

**Q11 (no hidden high-risk defaults):** `send_receipt`, `notify_customer`, `send_welcome_email` are already required at the schema layer — the metas mark them `required: true` with no `defaultValue`, preserving explicit consent.

**`update_order_status` discriminated union:** model `action` as a `select` with `dependsOn`-gated visibility for route-specific fields (`reason`/`restock` under cancel; `tags` under add_tags; `note` under add_note). The builder supports single-hop `dependsOn`; if per-route visibility proves awkward in v1, fall back to surfacing all fields with descriptions stating which `action` each applies to (the handler schema rejects mismatches). Decision recorded in §5.

**Sensitive outputs (mark `sensitive: true`, mirror Stripe):** `create_order.email`, `create_customer.email/firstName/lastName/phone`, `update_customer.email`. IDs/URLs/timestamps/status are structural (not sensitive).

**Task cost:** no per-meta cost is set — the central policy (`taskCostPolicy.ts`) bills a grounded provider action at the default **1 task on success**. Registering these metas makes all 11 Shopify actions billable automatically via grounding (no billing code change; see tracker §6).

---

## 3. Options resolver audit

Shopify's ID fields are currently free-text. A picker is an ergonomic upgrade, **not a correctness blocker** — users can paste IDs (Shopify admin URLs expose them).

| Candidate resolver | Would serve | Endpoint/helper | Needed for SHOPIFY-META-2? | Manual-ID fallback? |
|---|---|---|---|---|
| `shopify:products` | `update_product.product_id`, `create_product_variant.product_id` | `GET /products.json` | **No — defer to SHOPIFY-META-3** | Yes |
| `shopify:variants` | `create_order.line_items[].variant_id`, `update_product_variant.variant_id` | `GET /products/{id}/variants.json` (depends on product) | No — defer (and variant lives inside paste-JSON `line_items` for v1) | Yes |
| `shopify:orders` | `update_order_status.order_id`, `add_order_note.order_id`, `create_fulfillment.order_id` | `GET /orders.json` | No — defer | Yes |
| `shopify:customers` | `update_customer.customer_id` | `GET /customers.json` | No — defer | Yes |
| `shopify:locations` | `update_inventory.location_id` | `GET /locations.json` | No — defer | Yes |
| `shopify:inventory_items` | `update_inventory.inventory_item_id` | (chained from variant) | No — defer (chained; awkward without variant picker) | Yes |

**Recommendation:** ship SHOPIFY-META-2 with **zero resolvers** (all IDs as `text`). This matches the Stripe precedent (Stripe shipped COVERED with no resolvers because its fields are flat object-ids) and gets Shopify into the Builder fastest. Add resolvers later in an optional **SHOPIFY-META-3** if usage shows friction — priority order: `orders` > `products`/`variants` > `customers` > `locations`/`inventory_items`. Do not overbuild pickers up front.

---

## 4. Trigger metadata audit

- **Runtime confirmed:** `webhook_received` is implemented (activate/deactivate/receive/normalize) and exercised by `tests/e2e/slice-12-shopify-walkthrough.spec.ts` + `tests/unit/app/api/webhooks/shopify.route.test.ts`.
- **Activation invariant:** `index.ts` registers the activation hook → `trigger-meta-activation-invariant.test.ts` will pass once the meta is added (no `SHARED_INFRA_EXEMPT_KEYS` entry needed). Webhook activation, mirrors HubSpot.
- **TriggerMeta shape** (pattern: `integrations/hubspot/triggers/webhookReceived/webhookReceived.meta.ts`): `key: "shopify:webhook_received"`, `category: "commerce"`, `activation: "webhook"`, `requiresIntegration: true`. **Fields:** single `topics` field — model as `select` + `multiple: true` with the 8 static allowlist `options[]` (cleaner than HubSpot's paste-JSON because Shopify's topics are a fixed enum, not a per-property object). **payloadShape:** `topic` (string, discriminator) + per-topic body. Because the body shape varies by topic and is not flattened in V2 Batch 1, surface `topic` (structural) + a `payload`/`event` object marked `sensitive: true` (carries order/customer PII), with a description telling authors to branch on `topic` and drill in. Refine field-by-field in a follow-up if needed.
- **Include in the same arc** as the actions (single small provider; one webhook trigger). No reason to split.

---

## 5. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is already settled (the parity closeout: Shopify = 11 actions + 1 consolidated webhook trigger; the 5 NPD-S product decisions deferred). This slice's decisions are about the **metadata facet only**:

- **All 11 actions → COPY (surface as-is).** Each registered handler gets a meta; no runtime change. Rationale: handlers are real, schemas are authoritative, and the action set is the accepted V2 surface.
- **Array/object fields (`line_items`, `shipping_address`, `billing_address`) → ADAPT via paste-JSON textarea for v1.** Rationale: no dedicated array-of-object FieldType exists yet; paste-JSON is the established correct bridge (Notion/HubSpot/Stripe). A structured editor is a future FieldType, not a Shopify blocker.
- **ID fields → ADAPT as `text` (resolvers DEFERRED to SHOPIFY-META-3).** Rationale: correctness doesn't require pickers; Stripe precedent; fastest path to builder-visible.
- **`update_order_status` route visibility → ADAPT with single-hop `dependsOn` gating; fallback to all-fields-with-descriptions if awkward.** Decision: attempt `dependsOn` first; the handler's discriminated union is the safety net.
- **`webhook_received.topics` → REPLACE HubSpot's paste-JSON shape with a `select multiple` over the 8-topic allowlist.** Rationale: Shopify topics are a fixed enum, so a native multi-select is strictly better UX than paste-JSON.
- **Risk review call-outs:** `update_order_status` (cancel route) and `create_fulfillment` are the strongest side effects. **Recommendation:** keep all 11 at `riskLevel: "medium"` for v1 (none are money-moving like a Stripe refund/capture; cancel is recoverable-ish and the customer email is already an explicit `notify_customer` consent field). **Open decision for Marcus:** should `update_order_status` with `action: "cancel"` be elevated to `high` + `requiresConfirmation`? Defaulting to medium; flag for sign-off in SHOPIFY-META-2.
- **REJECT:** none. **DEFER:** options resolvers (SHOPIFY-META-3); per-topic payloadShape flattening (follow-up).

---

## 6. Implementation slices

| Slice | Scope | Files (implementation slice — NOT this slice) |
|---|---|---|
| **SHOPIFY-META-1** (this slice) | Audit + plan (doc-only) | this doc + tracker |
| **SHOPIFY-META-2** | 11 ActionMeta + 1 TriggerMeta + discovery sub-registry + COVERED flip + tests | `integrations/shopify/actions/*.meta.ts` (11), `integrations/shopify/triggers/webhookReceived/webhookReceived.meta.ts`, **new** `services/discovery/providers/shopify.ts` (`SHOPIFY_ACTION_METAS` + `SHOPIFY_TRIGGER_METAS`), wire into `services/discovery/_registry.ts`, add `"shopify"` to `COVERED_PROVIDERS` in `tests/structure/discovery-meta-coverage.test.ts`, + tests (§7) |
| **SHOPIFY-META-3** (optional, deferred) | Options resolvers (`orders`/`products`/`variants`/`customers`/`locations`) + flip relevant `text` fields to async `combobox` | `integrations/shopify/options/*.ts`, `services/options/_registry.ts`, field-meta edits, resolver tests |

Shopify is simple enough to land metas + trigger + COVERED flip in **one** implementation slice (SHOPIFY-META-2). Use the `services/discovery/providers/shopify.ts` sub-registry pattern (mirror `providers/mailchimp.ts`) so the central `_registry.ts` stays under the 400-line lint cap. **Do not skip tests** to compress.

---

## 7. Tests required (for SHOPIFY-META-2)

- **ActionMeta shape:** each of the 11 metas parses under `ActionMetaSchema`; `key === "shopify:<type>"`; outputs mirror handler returns; sensitive flags on customer email/PII outputs.
- **Discovery registry:** Shopify metas load without duplicate-key errors; `listActionMetasForProvider("shopify")` returns 11; `listProvidersWithMetadata()` includes `shopify`.
- **Provider route:** `/api/providers` returns `shopify` with `hasMetadata: true`; `/api/providers/shopify/actions` returns 11; `/api/providers/shopify/triggers` returns 1.
- **COVERED_PROVIDERS 1:1 invariant:** `discovery-meta-coverage.test.ts` passes with `shopify` added (every registered handler has a meta, no orphan metas).
- **TriggerMeta activation invariant:** `trigger-meta-activation-invariant.test.ts` passes for `shopify:webhook_received`.
- **Sensitive-output coverage:** `sensitive-output-coverage.test.ts` passes; customer email/PII outputs flagged.
- **Config field rendering (integration):** at least the representative flows — `create_customer` (consent boolean), `update_inventory` (enum + number), `create_order` (paste-JSON line_items + addresses), `update_order_status` (dependsOn route gating) — following the existing `tests/integration/features/workflow-builder/` pattern.
- **Options resolver tests:** only if SHOPIFY-META-3 ships resolvers.
- **Guards:** no secret/token leakage in metas or outputs; **no provider API calls in unit tests** (metas are static data; resolvers, if added, mock the HTTP boundary).

---

## 8. Acceptance criteria

Shopify is metadata/builder-complete only when:

- [ ] all 11 runtime actions have `ActionMeta`;
- [ ] `webhook_received` has `TriggerMeta` + passing activation invariant;
- [ ] required options resolvers exist OR are explicitly deferred to SHOPIFY-META-3 with rationale (this plan defers them);
- [ ] `/api/providers` reports Shopify `hasMetadata: true` (no longer "coming soon"); actions/triggers render in the Builder library;
- [ ] `shopify` is in `COVERED_PROVIDERS`;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Shopify tests (§7) pass;
- [ ] **no Shopify runtime handler behavior changed** (this is a metadata-only arc);
- [ ] the `update_order_status` cancel-route risk decision (§5) is signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md) §5/§8 (Shopify → covered; 8 providers remaining).
