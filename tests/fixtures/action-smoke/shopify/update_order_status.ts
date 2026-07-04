import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:update_order_status (writeSafe, artifact left) — cancel a smoke-owned
 * test order and prove the cancellation via an independent order read.
 *
 *   setup    create_order -> marker 0.00 test order against the dev-test-staged
 *            variant (send_receipt explicitly false). Capture ledger "order".
 *   execute  update_order_status { action: "cancel", notify_customer: false }
 *            -> the action under test cancels the smoke order.
 *   verify   order_state (SMOKE READ-BACK) -> expectEquals cancelled == true
 *            (Shopify sets cancelled_at; the cancel echo is never trusted) +
 *            markerPath proves it is OUR order.
 *
 * DISPOSITION: the action under test already put the order in its terminal
 * cancelled state; no further cleanup exists (no order delete). The cancelled
 * marked order persists -> artifact honestly left.
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "update_order_status",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    action: "cancel",
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
          email: "{{smokeMarker}}cancel@example.com",
          line_items: [
            { variant_id: "{{env.SMOKE_SHOPIFY_ORDER_VARIANT_ID:number}}", quantity: 1 },
          ],
          send_receipt: false,
          tags: "crsmoke",
        },
        captureResource: { resourceKey: "order", idPath: "orderId", kind: "order" },
      },
    ],
    verify: {
      provider: "shopify",
      action: "order_state",
      config: { orderId: "{{ledger.order.id}}" },
      smokeRead: true,
      markerPath: "email",
      expectEquals: { path: "cancelled", value: true },
    },
    // No cleanup: the action under test cancelled the order (terminal state);
    // Shopify has no order delete -> cancelled marked order left.
  },
  notes:
    "create_order (smoke seed) -> update_order_status cancel (notify false) -> " +
    "order_state read-back proves cancelled == true + the email marker. " +
    "writeSafe; cancelled marked order left (no order delete).",
});
