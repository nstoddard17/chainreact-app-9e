import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:update_ticket (writeSafe) — HubSpot engagement batch.
 *
 *   setup    create_ticket -> seed a smoke ticket (subject
 *            "{{marker}}update-ticket", distinct from the create_ticket
 *            fixture's subject in the same sweep) on the discovery-overlaid
 *            ticket pipeline/stage. Capture { ticketId } into ledger key
 *            "ticket".
 *   execute  update_ticket -> PATCH the seeded ticket's subject to
 *            "{{marker}}updated".
 *   verify   ticket_state (smokeRead) -> INDEPENDENT GET-by-id read-back;
 *            markerPath "subject" + markerSuffix "updated" requires
 *            "{{marker}}updated" — the seed subject (no "updated") would fail,
 *            so this proves the PATCH landed on the persisted ticket.
 *   cleanup  none — no registered ticket delete/archive action (artifact "left").
 *
 * Pipeline/stage ids come from the same discovery overlay as create_ticket
 * (requiredEnv gates a clean BLOCKED_ENV when the portal has no usable ticket
 * pipeline).
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "update_ticket",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    ticketId: "{{ledger.ticket.id}}",
    subject: "{{smokeMarker}}updated",
  },
  requiredEnv: ["SMOKE_HUBSPOT_TICKET_PIPELINE_ID", "SMOKE_HUBSPOT_TICKET_STAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "hubspot",
        action: "create_ticket",
        config: {
          subject: "{{smokeMarker}}update-ticket",
          content: "ChainReact action-smoke artifact - safe to ignore",
          hs_pipeline: "{{env.SMOKE_HUBSPOT_TICKET_PIPELINE_ID}}",
          hs_pipeline_stage: "{{env.SMOKE_HUBSPOT_TICKET_STAGE_ID}}",
        },
        captureResource: { resourceKey: "ticket", idPath: "ticketId", kind: "ticket" },
      },
    ],
    verify: {
      provider: "hubspot",
      action: "ticket_state",
      smokeRead: true,
      config: { ticketId: "{{ledger.ticket.id}}" },
      markerPath: "subject",
      markerSuffix: "updated",
    },
  },
  notes:
    "Seed smoke ticket (auto-discovered ticket pipeline/stage) -> update_ticket " +
    "PATCHes subject to {{marker}}updated -> ticket_state seam GET-by-id read-back " +
    "(marker + suffix 'updated'). No registered ticket delete/archive action -> " +
    "artifact left on the throwaway portal.",
});
