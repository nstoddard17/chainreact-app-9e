import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:create_order (writeSafe, archived) — create a 0.00-total test order
 * on the partner test store, prove it via an independent order read, then
 * CANCEL it via the registered update_order_status action.
 *
 *   target   SMOKE_SHOPIFY_ORDER_VARIANT_ID — the dev test stages a marker
 *            0.00-price product outside the harness and overlays its default
 *            variant id (create_order's line_items[].variant_id is strictly
 *            numeric, so the config uses the {{env.*:number}} whole-token
 *            modifier). The staged product is deleted in the dev test finally.
 *   execute  create_order -> marker synthetic email, one 0.00 line item,
 *            send_receipt EXPLICITLY false (Q11; nothing is ever emailed),
 *            tags "crsmoke". Zero financial surface: unpaid pending order for
 *            a free item on a partner_test shop. Capture { orderId } into
 *            ledger key "order". markerEchoPath proves the stored email.
 *   verify   order_state (SMOKE READ-BACK) -> GET orders/{id}; markerPath
 *            proves the marker on the PERSISTED order email.
 *   cleanup  update_order_status { action: "cancel", notify_customer: false }
 *            (registered action, smoke-owned ledger ref). Shopify has no order
 *            delete; cancel is the strongest disposition -> cleanupKind
 *            "archive" (the cancelled order persists, clearly marked).
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "create_order",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    email: "{{smokeMarker}}order@example.com",
    line_items: [
      { variant_id: "{{env.SMOKE_SHOPIFY_ORDER_VARIANT_ID:number}}", quantity: 1 },
    ],
    send_receipt: false,
    tags: "crsmoke",
  },
  requiredEnv: ["SMOKE_SHOPIFY_CONNECTED", "SMOKE_SHOPIFY_ORDER_VARIANT_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "order", idPath: "orderId", kind: "order" },
    markerEchoPath: "email",
    verify: {
      provider: "shopify",
      action: "order_state",
      config: { orderId: "{{ledger.order.id}}" },
      smokeRead: true,
      markerPath: "email",
    },
    cleanupKind: "archive",
    cleanup: {
      provider: "shopify",
      action: "update_order_status",
      config: {
        action: "cancel",
        order_id: "{{ledger.order.id}}",
        notify_customer: false,
      },
    },
  },
  notes:
    "create_order (marker email, one staged 0.00 line item, send_receipt false) " +
    "-> order_state read-back proves the persisted email marker -> cancel via " +
    "update_order_status. writeSafe; cancelled marked order persists (archive " +
    "disposition; Shopify has no order delete).",
});
