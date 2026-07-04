import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_ticket (writeSafe) — HubSpot engagement batch.
 *
 *   execute  create_ticket -> capture { ticketId } into ledger key "ticket".
 *            The ticket SUBJECT carries the unique smoke marker.
 *            `hs_pipeline` / `hs_pipeline_stage` are REAL portal ids overlaid
 *            from discovery (`discoverHubSpotTicketStage` lists
 *            /crm/v3/pipelines/tickets and picks the first non-archived
 *            pipeline + its first stage; a pinned
 *            SMOKE_HUBSPOT_TICKET_PIPELINE_ID wins) — never invented ids.
 *            No priority/owner/associations, so the ticket pings nobody.
 *   verify   ticket_state (smokeRead) -> INDEPENDENT GET-by-id read-back via
 *            the smoke-only seam; markerPath proves the marker on the
 *            PERSISTED subject.
 *   cleanup  none — HubSpot has NO registered delete/archive action for
 *            tickets (artifact "left" on the throwaway portal).
 *
 * The pipeline/stage vars stay in requiredEnv so the orchestrator's target
 * gate reports a clean BLOCKED_ENV when discovery finds no usable ticket
 * pipeline.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_ticket",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    subject: "{{smokeMarker}}ticket",
    content: "ChainReact action-smoke artifact - safe to ignore",
    // hs_pipeline / hs_pipeline_stage overlaid from discovery (or a pinned env).
  },
  configFromEnv: {
    hs_pipeline: "SMOKE_HUBSPOT_TICKET_PIPELINE_ID",
    hs_pipeline_stage: "SMOKE_HUBSPOT_TICKET_STAGE_ID",
  },
  requiredEnv: ["SMOKE_HUBSPOT_TICKET_PIPELINE_ID", "SMOKE_HUBSPOT_TICKET_STAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "ticket", idPath: "ticketId", kind: "ticket" },
    // create_ticket echoes the stored subject; confirm the unique marker round-tripped.
    markerEchoPath: "subject",
    verify: {
      provider: "hubspot",
      action: "ticket_state",
      smokeRead: true,
      config: { ticketId: "{{ledger.ticket.id}}" },
      markerPath: "subject",
    },
  },
  notes:
    "Create a smoke-marked ticket (real ticket pipeline/stage ids auto-discovered " +
    "from the portal) -> ticket_state seam GET-by-id read-back (marker on subject). " +
    "No registered ticket delete/archive action -> artifact left on the throwaway portal.",
});
