import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:update_line_item (destructiveSafe) — HubSpot line-item lifecycle.
 *
 *   setup    create_line_item -> seed a free-form smoke line item (name
 *            "{{marker}}seed-li", quantity "1", no product/price) on the staged
 *            parent deal. Capture { lineItemId } into ledger key "lineItem".
 *   execute  update_line_item -> PATCH the seeded line item's name to
 *            "{{marker}}updated".
 *   verify   line_item_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            markerPath "name" + markerSuffix "updated" requires
 *            "{{marker}}updated" — the seed name (no "updated") would fail, so
 *            this proves the PATCH landed on the persisted line item.
 *   cleanup  remove_line_item -> deletes exactly the ledger line item
 *            (LIVE_PASS_CLEANED).
 *
 * Parent deal comes from the dev test's staging overlay (see create_line_item).
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "update_line_item",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    lineItemId: "{{ledger.lineItem.id}}",
    name: "{{smokeMarker}}updated",
  },
  requiredEnv: ["SMOKE_HUBSPOT_LINEITEM_DEAL_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "hubspot",
        action: "create_line_item",
        config: {
          dealId: "{{env.SMOKE_HUBSPOT_LINEITEM_DEAL_ID}}",
          name: "{{smokeMarker}}seed-li",
          quantity: "1",
        },
        captureResource: { resourceKey: "lineItem", idPath: "lineItemId", kind: "line item" },
      },
    ],
    verify: {
      provider: "hubspot",
      action: "line_item_state",
      smokeRead: true,
      config: { lineItemId: "{{ledger.lineItem.id}}" },
      markerPath: "name",
      markerSuffix: "updated",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "hubspot",
      action: "remove_line_item",
      config: { lineItemId: "{{ledger.lineItem.id}}" },
    },
  },
  notes:
    "Seed smoke line item on the staged parent deal -> update_line_item PATCHes name " +
    "to {{marker}}updated -> line_item_state seam GET-by-id read-back (marker + suffix " +
    "'updated') -> remove_line_item cleanup (LIVE_PASS_CLEANED).",
});
