import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:create_fulfillment (writeSafe, artifact left) — fulfill a smoke-owned
 * 0.00 test order (the handler resolves the order's fulfillment orders
 * internally), proven via the order's persisted fulfillment_status.
 *
 *   setup    create_order -> marker 0.00 test order against the staged variant
 *            (send_receipt explicitly false). Capture ledger "order".
 *   execute  create_fulfillment { notify_customer: false } -> handler lists
 *            the order's fulfillment orders, picks the open one, and fulfills
 *            all remaining line items. Capture { fulfillmentId } into ledger
 *            key "fulfillment".
 *   verify   order_state (SMOKE READ-BACK) -> expectEquals fulfillmentStatus
 *            == "fulfilled" + markerPath proves it is OUR order.
 *
 * DISPOSITION: none. Shopify rejects cancelling fulfilled orders and has no
 * order delete, so the fulfilled marked 0.00 order persists (honest artifact;
 * partner test store). The staged product is deleted by the dev test.
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "create_fulfillment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    order_id: "{{ledger.order.id}}",
    notify_customer: false,
  },
  requiredEnv: ["SMOKE_SHOPIFY_CONNECTED", "SMOKE_SHOPIFY_ORDER_VARIANT_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "shopify",
        action: "create_order",
        config: {
          email: "{{smokeMarker}}fulfill@example.com",
          line_items: [
            { variant_id: "{{env.SMOKE_SHOPIFY_ORDER_VARIANT_ID:number}}", quantity: 1 },
          ],
          send_receipt: false,
          tags: "crsmoke",
        },
        captureResource: { resourceKey: "order", idPath: "orderId", kind: "order" },
      },
    ],
    captureResource: { resourceKey: "fulfillment", idPath: "fulfillmentId", kind: "fulfillment" },
    verify: {
      provider: "shopify",
      action: "order_state",
      config: { orderId: "{{ledger.order.id}}" },
      smokeRead: true,
      markerPath: "email",
      expectEquals: { path: "fulfillmentStatus", value: "fulfilled" },
    },
    // No cleanup: fulfilled orders cannot be cancelled and Shopify has no order
    // delete -> fulfilled marked 0.00 order left (partner test store).
  },
  notes:
    "create_order (smoke seed) -> create_fulfillment (notify false; handler " +
    "resolves fulfillment orders) -> order_state read-back proves " +
    "fulfillmentStatus fulfilled + the email marker. writeSafe; fulfilled marked " +
    "order left.",
});
