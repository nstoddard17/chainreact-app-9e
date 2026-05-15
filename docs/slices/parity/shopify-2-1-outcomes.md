# Shopify 2.1 — update_product_variant outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-shopify.md`](../parity-shopify.md) (accepted before Commit 1 began).
**Phase 1 predecessor:** [`docs/slices/slice-12-shopify.md`](../slice-12-shopify.md) (10-action + 1-consolidated-webhook-trigger port; established the V2 Shopify baseline + per-shop multi-tenant OAuth + HMAC-SHA256-base64 webhook verification + REST `2024-10` API version).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/shopify/`](../../../integrations/shopify/).

Shopify 2.1 closes the parity gap surfaced by the audit. V1 ships 11 registered actions; Slice 12 shipped 10. The single missing action — `update_product_variant` — is the entirety of the parity port. Zero new platform infrastructure beyond a single REST wrapper. Zero trigger work (Slice 12 already folded V1's 8 trigger types into the consolidated `webhook_received` discriminator). Zero scope expansion. The slice's deliberate narrowness reflects how complete Slice 12 already was.

The largest qualitative outcome is that **five product-strategic decisions surfaced and were all DEFERRED** (NPD-S1 REST↔GraphQL, NPD-S2 multi-shop routing, NPD-S3 rate-limit handling, NPD-S4 gift card automation, NPD-S5 domain expansion). Shopify 2.1 holds the line on V2's REST-only stance, the per-shop integration row model, and the workflow-author-composed inventory boundary.

---

## 1. Commit chain

| Commit | Title |
|---|---|
| `3940aeb14` | `docs(shopify): add parity audit` — Commit 0 (audit; doc-only). |
| `ad62d4cc8` | `feat(shopify): add update product variant action` — Commit 1 (`variantsUpdate` wrapper + action + schema + tests + registry entry; manifest action-count test bumped 10 → 11). |
| `344d426b0` | `test(shopify): extend walkthrough with variant update` — Commit 2 (e2e mock additions + `create_product_variant → update_product_variant` chain test with REST PUT shape + inventory-boundary guard + bounded output assertion). |

This doc (Commit 3) is the retro. **No runtime code changes.**

---

## 2. Scope shipped

### Actions (1 new)

| Action | Shopify endpoint | What it does | V1 reference |
|---|---|---|---|
| `update_product_variant` | `PUT /admin/api/2024-10/variants/{variantId}.json` | Update an existing variant's price / compare_at_price / sku / barcode / option1-3 / weight / weight_unit / taxable. PATCH-style — only supplied fields modified; others preserved. Variant inventory is NOT in scope (workflow-composed via `update_inventory`). | [`lib/workflows/actions/shopify/updateProductVariant.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProductVariant.ts) (155 LOC; V1 used GraphQL `productVariantsBulkUpdate`) |

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts).
**V2 Shopify action total after 2.1: 11** (10 Slice 12 + 1 Shopify 2.1).

### API wrappers (1 new)

| Wrapper | Module | Used by |
|---|---|---|
| `variantsUpdate` | EXTENDED [`integrations/_shared/shopify/api/products.ts`](../../../integrations/_shared/shopify/api/products.ts) | `update_product_variant` |

Routes through Slice 12's [`shopifyRequest`](../../../integrations/_shared/shopify/api/_request.ts):
- `X-Shopify-Access-Token: <token>` (not `Authorization: Bearer`).
- 401 → `Unauthorized401Error` → `IntegrationActionRequiredError("refresh_not_supported")` (non-refreshable Shopify).
- 404 → `NotFoundError("variant {id}")`.
- Other non-2xx → tagged `Error("Shopify PUT /variants/{id}.json failed: <surfaced>")`.

**Defensive field selection at the wrapper layer:** only the documented mutable keys reach the wire even if a caller passes an object with extras. The wrapper coerces `variantId` to `Number(input.variantId)` for the body's `id` field; the path segment is URL-encoded so non-numeric string ids survive cleanly.

`ShopifyProductVariant` read-side interface extended with `compare_at_price`, `inventory_item_id`, `weight_unit`, `taxable` so the handler's bounded output projection can surface them.

### Triggers — no changes

The consolidated `webhook_received` trigger from Slice 12 is unchanged. No new topics added to the allowlist (per accepted NPD-S5 domain-expansion deferral). The Slice 12 fold of V1's 8 trigger types into a single `payload.topic` discriminator continues to be the canonical pattern.

### Manifest scope changes

**None.** The 11 Slice 12 required scopes (`read_orders`, `write_orders`, `read_products`, `write_products`, `read_customers`, `write_customers`, `read_inventory`, `write_inventory`, `read_checkouts`, `read_fulfillments`, `write_fulfillments`) cover the new action. `write_products` is the relevant scope for variant updates; it was already required.

### File system

No reshape. One new schema + one new handler added in-place under `integrations/shopify/actions/`. One new wrapper appended to `integrations/_shared/shopify/api/products.ts`. The `integrations/shopify/actions/` leaf folder stays well under the 50-file limit.

---

## 3. Durable decisions worth preserving

### 3.1 `update_product_variant` — variant-only REST endpoint; no parent product pre-query

V1's GraphQL implementation runs THREE round-trips per update: (1) `query getVariant($id) { productVariant { product { id } } }` to look up the parent product id; (2) a `productVariantsBulkUpdate(productId: $productId, variants: [...])` mutation; (3) optional inventory follow-up. Shopify's REST surface exposes a variant-only endpoint at `/admin/api/2024-10/variants/{id}.json` that updates the variant without knowing the parent product id, so V2 uses ONE round-trip per update.

Pattern: action receives a `variant_id`, constructs the PATCH body, fires one HTTP PUT, returns a bounded output projection. The parent product id appears in the RESPONSE (Shopify echoes `variant.product_id` on PUT), which V2 surfaces in the output as `productId`. Workflow authors don't need to pre-fetch the product id.

### 3.2 Inventory boundary — variant updates and inventory changes are separate actions

`update_product_variant` does NOT update variant inventory. The `.strict()` schema rejects three field names at parse time:
- `inventory_quantity`
- `inventory_item_id`
- `inventory_management`

Variant inventory updates flow through the dedicated [`update_inventory`](../../../integrations/shopify/actions/updateInventory.ts) action (Slice 12). The boundary matches V1's documented constraint (V1's `updateProductVariant.ts:78-85` comments "Inventory quantity requires a separate mutation: inventorySetQuantities"). V2's REST endpoint actually accepts an `inventory_quantity` field in the legacy variant-payload shape, so the schema-layer rejection is the load-bearing guard — without it, workflow authors could accidentally route inventory updates through the wrong action.

The action OUTPUT surfaces `inventoryItemId` (camelCase, read-only) so workflow authors can compose `create_product_variant → update_product_variant → update_inventory` without an extra Shopify GET to look up the inventory item id. This is the only inventory-related field in the output projection.

The e2e regression-guards both directions:
- PUT body MUST NOT carry the three snake_case inventory keys (wire-level guard).
- `workflow_runs.steps[update-variant].output` MUST NOT leak the same keys + adjacent extras (`requires_shipping`, `fulfillment_service`).
- `inventoryItemId` IS exposed in the output (composition contract).

### 3.3 REST stays canonical (NPD-S1 deferred)

V1 ships 11 actions through GraphQL `productVariantsBulkUpdate` / `orderCreate` / etc. V2 Slice 12 chose REST `2024-10` for all 10 actions; Shopify 2.1 ships its 11th action also through REST. No GraphQL helper layer was introduced. No existing Shopify action was migrated.

**The decision to stay on REST is durable until at least one of:**
1. Shopify announces a concrete REST sunset date.
2. A customer / workflow needs a GraphQL-only Shopify feature (e.g. bulk operations, customer segments, B2B catalogs).

When either trigger fires, the migration becomes its own slice (estimated 6+ commits per parity-shopify.md §11): GraphQL request helper in `_shared/shopify/`, action-by-action rewrites, e2e mock GraphQL endpoint, unit-test re-baseline, deprecation comments on REST wrappers. **Shopify 2.1 explicitly does NOT pre-port GraphQL.**

### 3.4 Multi-shop routing — per-shop integration row + documented limitation (NPD-S2 deferred)

V2's [`_resolveShop.ts`](../../../integrations/shopify/actions/_resolveShop.ts) (Slice 12 Commit 3) routes Shopify actions by:
1. **Path 1 — Shopify-triggered run.** `triggerEvent.accountId` IS the shop domain (set at OAuth callback time as `providerAccountId`). Zero DB hits.
2. **Path 2 — Cross-provider / manual / scheduled run.** `getActiveForExecution(userId, "shopify", null)` returns the first active integration row arbitrarily.

Path 2 is **a documented gap**: a user with multiple Shopify shops who runs a workflow with a non-Shopify trigger gets routed to whichever row the DB happens to return first. Shopify 2.1 holds this gap unchanged — no `shopDomain` field was added to any action schema. Workflow authors with multiple shops should structure workflows around Shopify triggers.

Closure (typed `shopDomain` field on every action OR a UI shop-picker layer) is its own slice if signal emerges. NOT bundled with 2.1.

### 3.5 Rate-limit handling — workflow-author-composed (NPD-S3 deferred)

Neither V1 nor V2 handles Shopify 429 / leaky-bucket throttling. Shopify REST is 2 calls/sec per shop (burst to 40); GraphQL is cost-based. A heavy workflow that fires many Shopify actions in quick succession can saturate. Shopify 2.1 does NOT add provider-tier backoff / queue.

**Workflow-author guidance:** add a `wait` node between high-volume Shopify chains until provider-tier rate-limit handling exists. Documented in the CLAUDE.md Shopify Phase 2 patterns subsection.

### 3.6 Gift card automation — permanent skip (NPD-S4)

Gift-card creation has financial / compliance implications (KYC, regulatory). Workflow-automated gift-card minting is high-blast-radius. **Never expose** — not in 2.1, not in any future Shopify slice without explicit Marcus signoff.

### 3.7 Domain expansion (NPD-S5 deferred)

Six V2-uncovered V1-absent domains identified by the audit (draft orders, discount codes / price rules, collections, refunds / transactions, shop info read, additional webhook topics) are NOT parity gaps and are deferred pending product signal. Phase 5 AI planner usage data or Phase 3 UI workflow templates would surface real demand; until then, these are out of scope.

### 3.8 e2e proves engine variable resolution between Shopify actions

The walkthrough's new test chains `create_product_variant → update_product_variant` with `variant_id: "{{create-variant.variantId}}"`. The engine's strict resolver (`variables[node.id] = result.output`) makes the upstream step's bounded output addressable as `{{<nodeId>.<key>}}` in downstream config — no provider-side variable plumbing. The downstream action receives a NUMBER as the resolved `variant_id` and the schema's `z.union([z.string().min(1), z.number().int().positive()])` accepts it cleanly.

Generalized rule: when a Shopify action's output exposes an id that a downstream Shopify action needs, the engine's variable resolver handles the plumbing. No provider-specific "id passthrough" helper is needed.

---

## 4. V1 rot decisions

Cross-referenced with parity-shopify.md §8.

| ID | Pattern | V2 stance (Shopify 2.1) |
|---|---|---|
| S-R1 | `updateOrderStatus.ts` 4-mode kitchen-sink router | **PORTED with bounded discriminator** (Slice 12; unchanged in 2.1). |
| S-R2 | V1 silent `notifyCustomer=true` default on `createFulfillment` | **NOT PORTED — fixed.** V2 schema requires explicit `notify_customer: z.boolean()` (Slice 12; unchanged in 2.1). |
| S-R3 | V1 missing `send_receipt` flag on `createOrder` | **NOT PORTED — fixed.** V2 schema requires explicit `send_receipt: z.boolean()` (Slice 12; unchanged in 2.1). |
| S-R4 | V1 GraphQL `productVariantsBulkUpdate` mutation used for single-record ops | **NOT PORTED.** V2's `update_product_variant` uses REST `PUT /variants/{id}.json` (single round-trip, no parent-product lookup, no GID conversion). |
| S-R5 | V1 `metadata.stores: [{shop, name, id}]` single-row multi-shop model | **NOT PORTED.** V2 ships per-shop integration row (`providerAccountId === shopDomain`); Slice 12; unchanged in 2.1. |
| S-R6 | V1 24 OAuth scopes (defensive bloat) | **NOT PORTED.** V2 ships 11 required scopes (Slice 12; unchanged in 2.1). |
| S-R7 | Legacy `makeShopifyRequest()` REST `2024-01` helper | NOT PORTED — V2 uses `2024-10` exclusively. |
| S-R8 | V1 per-action `STORE_SELECTOR_FIELD` (`shopify_store`) | **NOT PORTED.** Integration row IS the store; `_resolveShop.ts` handles routing. Marcus's accepted NPD-S2 keeps this deferred. |
| S-R9 | V1 401 + token-refresh attempt despite non-refreshable Shopify | NOT PORTED — V2 routes via `authSchemes.ts` `non_refreshable` short-circuit. |
| S-R10 | No V1-side 429 / rate-limit handling | NOT PORTED — same passthrough behavior. Marcus's accepted NPD-S3 keeps this deferred. |
| S-R11 | V1 403-LOC webhook receive route | NOT PORTED — V2 ships 113-LOC route delegating to `dispatchTriggerEvent`. |
| S-R12 | V1 sparse test coverage (1 dedicated action test) | NOT PORTED as a problem — V2 ships 31 unit suites / 288 tests covering all 11 actions + wrappers + triggers + OAuth + manifest. |
| S-R13 | V1 missing `app/uninstalled` topic | NOT PORTED — neither does V2. Deferred per NPD-S5. |
| **S-R14 (new — surfaced by Shopify 2.1)** | V1 GraphQL `productVariantsBulkUpdate` mutation explicitly omits `weight`, `weight_unit`, `option1-3` updates (V1 comments call out the limitation) | **NOT PORTED.** V2's REST endpoint supports all of these fields; V2's `update_product_variant` ships a **broader** field surface than V1 because REST has the broader update surface than GraphQL bulk-update. |
| **S-R15 (new — surfaced by Shopify 2.1)** | V1 pre-PUT GraphQL `productVariant { product { id } }` lookup to get the parent product id | **NOT PORTED — replaced by REST single round-trip.** Shopify REST's `PUT /variants/{id}.json` doesn't require knowing the parent product id; the response includes `variant.product_id` for downstream use. |
| **S-R16 (new — surfaced by Shopify 2.1)** | V1 `success: false` synthetic ActionResult on error | **NOT PORTED.** V2 lets errors propagate to the engine (matches every other V2 action and Slice 12's existing pattern). |

---

## 5. E2E validation

[`tests/e2e/slice-12-shopify-walkthrough.spec.ts`](../../../tests/e2e/slice-12-shopify-walkthrough.spec.ts) — new second `test()` block alongside the existing OAuth + webhook walkthrough (Slice 12). Both tests share the same `Slice 12 — full Shopify walkthrough` describe and the same mock Shopify server.

### 5.1 Scenarios

1. **Existing Slice 12 walkthrough (unchanged).** OAuth connect with `providerHint.shop` → activate workflow with 2 webhook subscriptions → signed `orders/create` event → workflow_run succeeded → invalid-sig 401 → unsupported-topic 200-ack → replay deduped.
2. **NEW — `create_product_variant → update_product_variant` chain.** Workflow with `webhook_received` trigger feeding `create_product_variant` then `update_product_variant`. The update step's `variant_id` config is `{{create-variant.variantId}}` — the engine's strict resolver pulls the mock-assigned variant id out of the upstream step's bounded output. Signed `orders/create` event triggers the chain. Asserts:
   - Workflow run succeeded.
   - `mock.calls.variants` has EXACTLY 2 entries — 1 POST, 1 PUT.
   - POST body: `variant.price`, `variant.option1`, `variant.sku` match the upstream config.
   - PUT body: `variant.id === postCall.responseVariantId` (template-resolution proof); `variant.price`, `sku`, `barcode`, `weight`, `weight_unit`, `taxable` all forwarded.
   - PUT body MUST NOT carry `inventory_quantity`, `inventory_item_id`, `inventory_management` (wire-level inventory-boundary guard).
   - `workflow_runs.steps[update-variant].output` key set asserted via `Object.keys(...).sort()` to be exactly 14 keys: `adminUrl`, `barcode`, `compareAtPrice`, `inventoryItemId`, `option1`, `option2`, `option3`, `price`, `productId`, `sku`, `success`, `title`, `updatedAt`, `variantId`.
   - `inventoryItemId` IS exposed in the output (composition contract for `update_inventory` downstream).
   - Defensive sweep: no snake_case wire keys leak into output.

### 5.2 Mock additions

[`tests/e2e/helpers/mockShopifyServer.ts`](../../../tests/e2e/helpers/mockShopifyServer.ts) extended:
- POST `/admin/api/2024-10/products/{productId}/variants.json` — assigns synthetic ids (variant from 40001+, inventory_item_id from 60001+), stores the variant in `state.variants`, echoes back `{variant}`.
- PUT `/admin/api/2024-10/variants/{variantId}.json` — merges supplied fields onto the stored variant, preserves `inventory_item_id` from create, returns `{variant}`. Auto-synthesizes a placeholder if PUT lands without a prior POST (lets update-only scenarios stand alone).
- New `state.variantCounter`, `state.inventoryItemCounter`, `state.variants: Map<number, MockVariantState>`.
- New `calls.variants: RecordedVariantCall[]` exposed via `__inspect`.

### 5.3 Both tests pass with `--workers=1` in ~32s

---

## 6. Test totals

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test`
- `npx playwright test tests/e2e/slice-12-shopify-walkthrough.spec.ts --workers=1` (Commit 2)

Final totals after Commit 2:
- **Full `npm test`: 660 suites / 6438 tests passing.**
- **Shopify focused (`tests/unit/integrations/shopify/` + `tests/unit/integrations/_shared/shopify/` + `tests/unit/services/execution/handlers/`): 31 suites / 288 tests passing.**
- **Shopify e2e: 2/2 walkthrough tests pass (~32s with `--workers=1`).**

---

## 7. Acceptance criteria (post-merge)

- [x] 1 new action registered in `services/execution/handlers/_registry.ts` (total 11 Shopify actions).
- [x] 1 new wrapper function (`variantsUpdate`) routed through `shopifyRequest`.
- [x] Handler uses `refreshAndRetry` with `accountId` from `resolveShopDomain`.
- [x] Schema is `.strict()` — unknown fields rejected at design time.
- [x] Schema requires at least one mutable field beyond `variant_id` (refine guard).
- [x] Schema rejects `inventory_quantity`, `inventory_item_id`, `inventory_management` at parse time.
- [x] Output key set locked by a test asserting `Object.keys(output).sort() === expected.sort()`.
- [x] No `success: false` synthetic ActionResult envelope on error.
- [x] No GraphQL — REST only.
- [x] No parent-product GraphQL pre-query.
- [x] No new shopify_store / per-action shop selector field.
- [x] e2e proves the create → update chain via engine variable resolution.
- [x] e2e regression-guards the inventory boundary at both wire layer and output layer.

---

## 8. What's deferred

### Deferred to a future Shopify slice (conditional on signal)

| Item | Audit recommendation | Trigger condition |
|---|---|---|
| GraphQL migration (NPD-S1) | DEFER. Stay on REST. | Shopify announces a concrete REST sunset date OR a customer hits a GraphQL-only feature. |
| Multi-shop routing for non-Shopify-triggered runs (NPD-S2) | DEFER. Document the limitation. | A user with multiple Shopify shops reports a routing-ambiguity bug, OR Phase 3 UI implements a per-action shop picker. |
| Shopify 429 / rate-limit handling (NPD-S3) | DEFER. Workflow-author guidance only. | A customer report of rate-limit-induced workflow failures. |
| Draft orders | DEFER pending product signal. | Phase 5 AI planner or Phase 3 UI shows a workflow template that needs draft orders. |
| Discount codes / price rules | DEFER pending product signal. | Same. |
| Collections | DEFER pending product signal. | Same. |
| Refunds / transactions | DEFER pending product signal. | Q11 explicit-consent guard required when ported (high-blast-radius — real money movement). |
| Shop info read | DEFER pending product signal. | Trivial port if requested. |
| Additional webhook topics (`app/uninstalled`, `products/create`, `products/delete`, `orders/cancelled`, `refunds/create`, `fulfillments/{create,update}`, `inventory_levels/{connect,disconnect}`) | DEFER pending product signal. | Workflow author asks; trivial allowlist extension. `app/uninstalled` would additionally need integration cleanup wiring (Phase 7 ops concern). |

### Permanently skipped

| Item | Reason |
|---|---|
| Gift card automation (NPD-S4) | Financial / compliance blast radius (KYC, regulatory). Workflow auto-mint is high-risk; do not expose. |
| V1 GraphQL `productVariantsBulkUpdate` for single-record use | V2's REST endpoint is simpler, supports more fields (weight / options), and avoids the GraphQL helper layer entirely. |
| V1 GraphQL GID conversion (`toVariantGid`, etc.) | REST accepts numeric / string ids directly. |
| V1 pre-PUT GraphQL `productVariant.product.id` lookup | REST endpoint doesn't require the parent product id; response includes it for downstream use. |
| V1 per-action `shopify_store` config selector | Integration row IS the store; `_resolveShop.ts` resolves at execution time. |
| V1 24-scope OAuth bloat | V2 ships 11 required scopes (Slice 12). |
| V1 `success: false` synthetic ActionResult on error | V2 lets errors propagate to the engine. |
| `duplicate_record` action (V1 had a Shopify equivalent? no — Airtable analogy) | n/a — Shopify doesn't have a parity equivalent. |

### Out of scope — not started

- Any Shopify 2.2 work. The audit covered Shopify 2.1 only; Shopify 2.2 would require a fresh audit and is not pre-committed.

---

## 9. CLAUDE.md updates landed

A new "Phase 2 progress (Shopify)" entry under "Current Local Development State" records the Shopify 2.1 commit chain and shipped surface.

A new "Shopify Phase 2 patterns" subsection under "Deep Gotchas" records six durable rules:
- **Stay on REST until forced off.** No GraphQL helper layer in V2's `_shared/shopify/`. NPD-S1 deferred per Marcus's accepted recommendation.
- **`update_product_variant` is variant-only REST PUT — no parent-product pre-query.** Shopify REST's `PUT /variants/{id}.json` endpoint doesn't require knowing the parent product id. The response echoes `variant.product_id` for downstream use.
- **Variant inventory updates are a separate action.** `update_product_variant` schema rejects `inventory_quantity` / `inventory_item_id` / `inventory_management` at parse time. Workflow authors compose `update_inventory` downstream. The output exposes `inventoryItemId` (camelCase) so composition doesn't require an extra Shopify GET.
- **Multi-shop routing for non-Shopify-triggered runs is a documented limitation.** Users with multiple Shopify shops should structure workflows around Shopify triggers. NPD-S2 deferred per Marcus's accepted recommendation. No `shopDomain` field on any action.
- **High-volume Shopify chains should use `wait` nodes until provider-tier rate limiting exists.** NPD-S3 deferred per Marcus's accepted recommendation. Shopify REST is 2 req/s per shop; GraphQL is cost-based.
- **Gift cards are permanent skip.** Financial / compliance blast radius (KYC, regulatory). Never expose to workflow automation.

Plus the engine-variable-resolution note: V2's strict resolver makes upstream bounded output addressable via `{{<nodeId>.<key>}}` in downstream config. Shopify 2.1's e2e proves this for action-to-action chaining (`create_product_variant.variantId → update_product_variant.variant_id`). No provider-specific id-passthrough plumbing is needed.

---

## 10. What's next (Shopify roadmap)

Per parity-shopify §§11–13:

- Shopify 2.2 — not pre-committed. If product signal emerges for draft orders, discounts, collections, refunds, or additional webhook topics, a fresh parity audit drives the slice.
- GraphQL migration — its own slice if Shopify announces a concrete REST sunset date or a customer needs a GraphQL-only feature. Estimated 6+ commits.
- Multi-shop routing closure — its own slice if a customer reports the documented limitation as a real bug.
- Rate-limit handling — its own slice (provider-tier wait/queue) if a customer reports 429-induced workflow failures.

Shopify 2.1 closes the audit's identified parity gap. The next provider audit is the natural next step unless Marcus assigns Shopify 2.2 work explicitly.
