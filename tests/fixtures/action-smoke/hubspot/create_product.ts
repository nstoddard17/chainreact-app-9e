import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_product (writeSafe) — HubSpot engagement/object batch.
 *
 *   execute  create_product -> capture { productId } into ledger key "product".
 *            The product NAME carries the unique smoke marker. Only `name` is
 *            required; NO price is set, so the artifact carries zero revenue
 *            weight in the product library.
 *   verify   product_state (smokeRead) -> INDEPENDENT GET-by-id read-back via
 *            the smoke-only seam (`GET /crm/v3/objects/products/{id}`);
 *            markerPath proves the marker on the PERSISTED name.
 *   cleanup  none — HubSpot has NO registered delete/archive action for
 *            products (artifact "left" on the throwaway portal).
 *
 * Connection is DB-probed by the dev test; product fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_product",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}product",
    description: "ChainReact action-smoke artifact - safe to ignore",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "product", idPath: "productId", kind: "product" },
    // create_product echoes the stored name; confirm the unique marker round-tripped.
    markerEchoPath: "name",
    verify: {
      provider: "hubspot",
      action: "product_state",
      smokeRead: true,
      config: { productId: "{{ledger.product.id}}" },
      markerPath: "name",
    },
  },
  notes:
    "Create a smoke-marked product (name only, no price so zero revenue weight) -> " +
    "product_state seam GET-by-id read-back (marker on name). No registered product " +
    "delete/archive action -> artifact left on the throwaway portal.",
});
