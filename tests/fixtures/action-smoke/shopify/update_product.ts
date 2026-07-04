import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:update_product (writeSafe, artifact left) — retitle a smoke-owned
 * product and prove the SPECIFIC new value via a suffix-pinned independent read.
 *
 *   setup    create_product -> marker product (capture ledger key "product").
 *   execute  update_product -> title "{{smokeMarker}}updated ..." on it.
 *   verify   product_state (SMOKE READ-BACK) -> markerPath + markerSuffix
 *            "updated" require the UPDATED title on the persisted product; the
 *            setup title (same run marker, no suffix) cannot vacuously pass.
 *
 * DISPOSITION: none (no registered product delete) -> marked artifact left.
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "update_product",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    product_id: "{{ledger.product.id}}",
    title: "{{smokeMarker}}updated product - safe to delete",
  },
  requiredEnv: ["SMOKE_SHOPIFY_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "shopify",
        action: "create_product",
        config: {
          title: "{{smokeMarker}}product - safe to delete",
          price: "0.00",
          product_type: "crsmoke",
        },
        captureResource: { resourceKey: "product", idPath: "productId", kind: "product" },
      },
    ],
    markerEchoPath: "title",
    verify: {
      provider: "shopify",
      action: "product_state",
      config: { productId: "{{ledger.product.id}}" },
      smokeRead: true,
      markerPath: "title",
      markerSuffix: "updated",
    },
    // No cleanup: no registered Shopify product delete -> marked artifact left.
  },
  notes:
    "create_product (smoke host) -> update_product retitle -> product_state " +
    "read-back proves the marker+updated title (suffix-pinned). writeSafe; marked " +
    "product artifact left.",
});
