import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:remove_line_item (destructiveSafe, execute IS the cleanup) — HubSpot
 * line-item lifecycle.
 *
 *   setup    create_line_item -> seed a free-form smoke line item (name
 *            "{{marker}}remove-li") on the staged parent deal. Capture
 *            { lineItemId } into ledger key "lineItem".
 *   execute  remove_line_item -> delete exactly the ledger-created line item.
 *   verify   line_item_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            assert exists == false. The delete response (`{deleted:true}`) is
 *            NOT trusted — deletion is proven by the GET returning HubSpot's
 *            404, which is the documented deleted/archived state for this
 *            action (the schema notes replaying the DELETE 404s as the
 *            canonical NotFoundError). ONLY the typed NotFoundError maps to
 *            exists:false in the seam; any other error is an honest
 *            VERIFY_FAILED, never a false "deleted".
 *   (executeIsCleanup)  the delete IS the disposition: artifact "cleaned".
 *
 * Parent deal comes from the dev test's staging overlay (see create_line_item).
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "remove_line_item",
  // "remove" is a destructive verb -> risk/liveRisk MUST be destructive (the
  // write harness still gates via liveClass destructiveSafe). Never liveSafe.
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    lineItemId: "{{ledger.lineItem.id}}",
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
          name: "{{smokeMarker}}remove-li",
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
      expectEquals: { path: "exists", value: false },
    },
    // The action under test IS the disposition — no separate cleanup step.
    executeIsCleanup: true,
  },
  notes:
    "Seed smoke line item -> remove_line_item deletes it -> line_item_state read-back " +
    "exists==false (typed 404 only; other errors fail honestly). executeIsCleanup: " +
    "artifact cleaned. destructiveSafe.",
});
