import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:update_product (writeSafe) — HubSpot engagement/object batch.
 *
 *   setup    create_product -> seed a smoke product (name
 *            "{{marker}}update-product", distinct from the create_product
 *            fixture's name in the same sweep). Capture { productId } into
 *            ledger key "product".
 *   execute  update_product -> PATCH the seeded product's name to
 *            "{{marker}}updated".
 *   verify   product_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            markerPath "name" + markerSuffix "updated" requires
 *            "{{marker}}updated" — the seed name (no "updated") would fail, so
 *            this proves the PATCH landed on the persisted product.
 *   cleanup  none — no registered product delete/archive action (artifact "left").
 *
 * Connection is DB-probed by the dev test; product fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "update_product",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    productId: "{{ledger.product.id}}",
    name: "{{smokeMarker}}updated",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "hubspot",
        action: "create_product",
        config: {
          name: "{{smokeMarker}}update-product",
          description: "ChainReact action-smoke artifact - safe to ignore",
        },
        captureResource: { resourceKey: "product", idPath: "productId", kind: "product" },
      },
    ],
    verify: {
      provider: "hubspot",
      action: "product_state",
      smokeRead: true,
      config: { productId: "{{ledger.product.id}}" },
      markerPath: "name",
      markerSuffix: "updated",
    },
  },
  notes:
    "Seed smoke product -> update_product PATCHes name to {{marker}}updated -> " +
    "product_state seam GET-by-id read-back (marker + suffix 'updated'). No registered " +
    "product delete/archive action -> artifact left on the throwaway portal.",
});
