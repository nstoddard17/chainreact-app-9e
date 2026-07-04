import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:add_order_note (writeSafe, archived) — set a marker note on a
 * smoke-owned test order, prove it via an independent order read, then cancel
 * the order via the registered update_order_status action.
 *
 *   setup    create_order -> marker 0.00 test order (send_receipt explicitly
 *            false). Capture ledger "order".
 *   execute  add_order_note { note: marker, append: false }.
 *   verify   order_state (SMOKE READ-BACK) -> markerPath "note" proves the
 *            marker on the PERSISTED order note (never the echo).
 *   cleanup  update_order_status cancel (registered, smoke-owned) ->
 *            cleanupKind "archive" (cancelled marked order persists).
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "add_order_note",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    order_id: "{{ledger.order.id}}",
    note: "{{smokeMarker}}note - safe to ignore",
    append: false,
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
          email: "{{smokeMarker}}note@example.com",
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
      markerPath: "note",
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
    "create_order (smoke seed) -> add_order_note (marker, replace mode) -> " +
    "order_state read-back proves the persisted note marker -> cancel cleanup. " +
    "writeSafe; cancelled marked order persists (archive disposition).",
});
