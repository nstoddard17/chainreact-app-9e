import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:create_product_variant (writeSafe, artifact left) — add a marker
 * variant to a smoke-owned product, proven via the product's persisted
 * variants[].
 *
 *   setup    create_product -> marker product (capture "product"). Its default
 *            variant occupies option1 "Default Title", so the new variant needs
 *            a DISTINCT marker option1.
 *   execute  create_product_variant -> price "0.00", marker option1 + sku.
 *            Capture { variantId } into ledger key "variant". markerEchoPath
 *            proves the stored sku.
 *   verify   product_state (SMOKE READ-BACK) -> markerPath "variants" proves
 *            the marker sku/option inside the PERSISTED variants array.
 *
 * DISPOSITION: none (no registered product/variant delete) -> marked product
 * (with both variants) left.
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "create_product_variant",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    product_id: "{{ledger.product.id}}",
    price: "0.00",
    option1: "{{smokeMarker}}opt",
    sku: "{{smokeMarker}}sku",
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
          title: "{{smokeMarker}}varianthost - safe to delete",
          price: "0.00",
          product_type: "crsmoke",
        },
        captureResource: { resourceKey: "product", idPath: "productId", kind: "product" },
      },
    ],
    captureResource: { resourceKey: "variant", idPath: "variantId", kind: "variant" },
    markerEchoPath: "sku",
    verify: {
      provider: "shopify",
      action: "product_state",
      config: { productId: "{{ledger.product.id}}" },
      smokeRead: true,
      markerPath: "variants",
    },
    // No cleanup: no registered product/variant delete -> marked artifacts left.
  },
  notes:
    "create_product (smoke host) -> create_product_variant (marker option1/sku, " +
    "0.00) -> product_state read-back proves the marker inside variants[]. " +
    "writeSafe; marked product + variant left.",
});
