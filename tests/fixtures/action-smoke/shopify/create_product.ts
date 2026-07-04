import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:create_product (writeSafe, artifact left) — create a deterministic
 * crsmoke- 0.00-price product on the partner test store, then prove it via an
 * INDEPENDENT per-product read.
 *
 *   execute  create_product -> marker title, price "0.00" (zero financial
 *            surface), product_type "crsmoke". Capture { productId } into
 *            ledger key "product". markerEchoPath proves the stored title.
 *   verify   product_state (SMOKE READ-BACK) -> GET products/{id}; markerPath
 *            proves the marker on the PERSISTED title (Shopify registers no
 *            read actions, so the seam is the only independent read).
 *
 * DISPOSITION: none. V2 registers no product delete action, so the marked
 * product stays on the partner test store (monday:create_board precedent).
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "create_product",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    title: "{{smokeMarker}}product - safe to delete",
    price: "0.00",
    product_type: "crsmoke",
  },
  requiredEnv: ["SMOKE_SHOPIFY_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "product", idPath: "productId", kind: "product" },
    markerEchoPath: "title",
    verify: {
      provider: "shopify",
      action: "product_state",
      config: { productId: "{{ledger.product.id}}" },
      smokeRead: true,
      markerPath: "title",
    },
    // No cleanup: no registered Shopify product delete -> marked artifact left.
  },
  notes:
    "create_product (marker title, 0.00 price) -> product_state read-back proves " +
    "the persisted title marker. writeSafe; marked product artifact left (no " +
    "registered product delete).",
});
