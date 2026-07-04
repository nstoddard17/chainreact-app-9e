import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:update_product_variant (writeSafe, artifact left) — re-sku a smoke
 * product's DEFAULT variant and prove the specific new value via a
 * suffix-pinned per-variant read.
 *
 *   setup    create_product -> marker product; capture its default variant id
 *            (create_product's output surfaces variants[0].id as variantId)
 *            into ledger key "variant".
 *   execute  update_product_variant -> sku "{{smokeMarker}}updsku".
 *   verify   variant_state (SMOKE READ-BACK) -> GET variants/{id}; markerPath
 *            "sku" + markerSuffix "updsku" pin the exact updated value.
 *
 * DISPOSITION: none (no registered delete). The host product persists too
 * (uncaptured — the ledger tracks the variant the run mutated; the note keeps
 * the artifact count honest: one marked product per run).
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "update_product_variant",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    variant_id: "{{ledger.variant.id}}",
    sku: "{{smokeMarker}}updsku",
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
          title: "{{smokeMarker}}skuhost - safe to delete",
          price: "0.00",
          product_type: "crsmoke",
        },
        captureResource: { resourceKey: "variant", idPath: "variantId", kind: "variant" },
      },
    ],
    markerEchoPath: "sku",
    verify: {
      provider: "shopify",
      action: "variant_state",
      config: { variantId: "{{ledger.variant.id}}" },
      smokeRead: true,
      markerPath: "sku",
      markerSuffix: "updsku",
    },
    // No cleanup: no registered product/variant delete -> marked product left.
  },
  notes:
    "create_product (capture its default variant) -> update_product_variant " +
    "re-sku -> variant_state read-back proves marker+updsku (suffix-pinned). " +
    "writeSafe; one marked product artifact left per run.",
});
