import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * shopify:update_inventory (writeSafe, no artifact of its own) — set the
 * available quantity of a dev-test-STAGED tracked inventory item, proven via
 * an independent inventory-level read.
 *
 *   target   SMOKE_SHOPIFY_INVENTORY_ITEM_ID + SMOKE_SHOPIFY_LOCATION_ID — the
 *            dev test stages a marker product, switches its inventory item to
 *            tracked:true, and connects it at the shop's first active location
 *            (inventory_levels/set rejects untracked/unconnected items and V2
 *            registers no tracking-enable action). The staged product is
 *            deleted in the dev test finally, taking the level with it.
 *   execute  update_inventory { adjustment_type: "set", quantity: 7 }.
 *   verify   inventory_level (SMOKE READ-BACK) -> GET inventory_levels;
 *            expectEquals available == 7 (the set echo is never trusted).
 *
 * DISPOSITION: artifact "none" — the run creates nothing; it mutates state on
 * the staged item whose teardown the dev test owns.
 */
export default defineWriteSmokeFixture({
  provider: "shopify",
  action: "update_inventory",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    inventory_item_id: "{{env.SMOKE_SHOPIFY_INVENTORY_ITEM_ID}}",
    location_id: "{{env.SMOKE_SHOPIFY_LOCATION_ID}}",
    adjustment_type: "set",
    quantity: 7,
  },
  requiredEnv: [
    "SMOKE_SHOPIFY_CONNECTED",
    "SMOKE_SHOPIFY_INVENTORY_ITEM_ID",
    "SMOKE_SHOPIFY_LOCATION_ID",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    verify: {
      provider: "shopify",
      action: "inventory_level",
      config: {
        inventoryItemId: "{{env.SMOKE_SHOPIFY_INVENTORY_ITEM_ID}}",
        locationId: "{{env.SMOKE_SHOPIFY_LOCATION_ID}}",
      },
      smokeRead: true,
      expectEquals: { path: "available", value: 7 },
    },
    // No capture/cleanup: pure state mutation on the staged tracked item; the
    // dev test's finally deletes the staged product (artifact "none").
  },
  notes:
    "dev test stages a tracked marker inventory item at the shop's location -> " +
    "update_inventory set 7 -> inventory_level read-back proves available == 7. " +
    "writeSafe; no run-created artifact (staged product torn down by the dev test).",
});
