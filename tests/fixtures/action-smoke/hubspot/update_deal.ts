import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:update_deal (writeSafe) — HubSpot CRM deal lifecycle.
 *
 *   setup    create_deal -> seed a smoke deal (dealname "{{marker}}update-deal",
 *            distinct from the create_deal fixture's name in the same sweep) on
 *            the discovery-overlaid pipeline/stage. Capture { dealId } into
 *            ledger key "deal".
 *   execute  update_deal -> PATCH the seeded deal's dealname to
 *            "{{marker}}updated".
 *   verify   deal_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            markerPath "dealname" + markerSuffix "updated" requires
 *            "{{marker}}updated" — the seed name (no "updated") would fail, so
 *            this proves the PATCH landed on the persisted deal.
 *   cleanup  none — no registered deal delete/archive action (artifact "left").
 *
 * Connection is DB-probed by the dev test. Pipeline/stage ids come from the
 * same discovery overlay as create_deal (requiredEnv gates a clean BLOCKED_ENV
 * when the portal has no usable deal pipeline).
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "update_deal",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    dealId: "{{ledger.deal.id}}",
    dealname: "{{smokeMarker}}updated",
  },
  requiredEnv: ["SMOKE_HUBSPOT_DEAL_STAGE_ID", "SMOKE_HUBSPOT_DEAL_PIPELINE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "hubspot",
        action: "create_deal",
        config: {
          dealname: "{{smokeMarker}}update-deal",
          dealstage: "{{env.SMOKE_HUBSPOT_DEAL_STAGE_ID}}",
          pipeline: "{{env.SMOKE_HUBSPOT_DEAL_PIPELINE_ID}}",
        },
        captureResource: { resourceKey: "deal", idPath: "dealId", kind: "deal" },
      },
    ],
    verify: {
      provider: "hubspot",
      action: "deal_state",
      smokeRead: true,
      config: { dealId: "{{ledger.deal.id}}" },
      markerPath: "dealname",
      markerSuffix: "updated",
    },
  },
  notes:
    "Seed smoke deal (auto-discovered pipeline/stage) -> update_deal PATCHes dealname " +
    "to {{marker}}updated -> deal_state seam GET-by-id read-back (marker + suffix " +
    "'updated'). No registered deal delete/archive action -> artifact left on the " +
    "throwaway portal.",
});
