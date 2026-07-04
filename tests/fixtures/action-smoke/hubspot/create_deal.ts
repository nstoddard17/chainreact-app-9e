import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_deal (writeSafe) — HubSpot CRM deal lifecycle.
 *
 *   execute  create_deal -> capture { dealId } into ledger key "deal". The deal
 *            NAME carries the unique smoke marker. `dealstage` / `pipeline` are
 *            REAL portal ids overlaid from discovery (`discoverHubSpotDealStage`
 *            lists /crm/v3/pipelines/deals and picks the first non-archived
 *            pipeline + its first stage; a pinned SMOKE_HUBSPOT_DEAL_PIPELINE_ID
 *            wins) — HubSpot rejects invented stage ids.
 *   verify   deal_state (smokeRead) -> INDEPENDENT GET-by-id read-back via the
 *            smoke-only seam (strongly consistent; the registered get_deals
 *            /search read is eventually consistent and would flake on a
 *            seconds-old deal). markerPath proves the marker on the PERSISTED
 *            dealname.
 *   cleanup  none — HubSpot has NO registered archive/delete action for deals
 *            (artifact "left" on the throwaway portal). No amount is set, so
 *            the artifact carries zero revenue weight in portal reports.
 *
 * Connection is DB-probed by the dev test. The pipeline/stage vars stay in
 * requiredEnv so the orchestrator's target gate reports a clean BLOCKED_ENV
 * when discovery finds no usable deal pipeline — never an invented id.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_deal",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    dealname: "{{smokeMarker}}deal",
    // dealstage / pipeline overlaid from discovery (or a pinned env) at run time.
  },
  configFromEnv: {
    dealstage: "SMOKE_HUBSPOT_DEAL_STAGE_ID",
    pipeline: "SMOKE_HUBSPOT_DEAL_PIPELINE_ID",
  },
  requiredEnv: ["SMOKE_HUBSPOT_DEAL_STAGE_ID", "SMOKE_HUBSPOT_DEAL_PIPELINE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "deal", idPath: "dealId", kind: "deal" },
    // create_deal echoes the stored dealname; confirm the unique marker round-tripped.
    markerEchoPath: "dealname",
    verify: {
      provider: "hubspot",
      action: "deal_state",
      smokeRead: true,
      config: { dealId: "{{ledger.deal.id}}" },
      markerPath: "dealname",
    },
  },
  notes:
    "Create a smoke-marked deal (real pipeline/stage ids auto-discovered from the " +
    "portal's deal pipelines) -> deal_state seam GET-by-id read-back (marker on " +
    "dealname). No registered deal delete/archive action -> artifact left on the " +
    "throwaway portal.",
});
