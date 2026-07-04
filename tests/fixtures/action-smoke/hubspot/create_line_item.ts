import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_line_item (destructiveSafe) — HubSpot line-item lifecycle.
 *
 *   execute  create_line_item -> capture { lineItemId } into ledger key
 *            "lineItem". FREE-FORM line item (marker `name`, quantity "1", NO
 *            hs_product_id and NO price -> zero revenue weight) attached to the
 *            STAGED smoke parent deal (SMOKE_HUBSPOT_LINEITEM_DEAL_ID — created
 *            outside the harness by `stageHubSpotLineItemDeal`, archived in the
 *            dev test's finally; staging keeps the deal OUT of the run ledger
 *            so cleaned==created holds).
 *   verify   line_item_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            markerPath proves the marker on the PERSISTED name, expectEquals
 *            pins exists:true.
 *   cleanup  remove_line_item -> registered destructive action deletes exactly
 *            the ledger line item (HubSpot archives it; GET then 404s). First
 *            HubSpot flow with REAL cleanup -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_line_item",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    dealId: "{{env.SMOKE_HUBSPOT_LINEITEM_DEAL_ID}}",
    name: "{{smokeMarker}}lineitem",
    quantity: "1",
  },
  requiredEnv: ["SMOKE_HUBSPOT_LINEITEM_DEAL_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "lineItem", idPath: "lineItemId", kind: "line item" },
    // create_line_item echoes the stored name; confirm the marker round-tripped.
    markerEchoPath: "name",
    verify: {
      provider: "hubspot",
      action: "line_item_state",
      smokeRead: true,
      config: { lineItemId: "{{ledger.lineItem.id}}" },
      markerPath: "name",
      expectEquals: { path: "exists", value: true },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "hubspot",
      action: "remove_line_item",
      config: { lineItemId: "{{ledger.lineItem.id}}" },
    },
  },
  notes:
    "Create a free-form marker line item (no product, no price) on the staged smoke " +
    "parent deal -> line_item_state seam GET-by-id read-back (marker on name) -> " +
    "remove_line_item cleanup. First HubSpot flow with real delete cleanup.",
});
