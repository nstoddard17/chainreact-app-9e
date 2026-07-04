import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:create_custom_event (writeSafe) — Mailchimp finisher batch.
 *
 *   setup    add_subscriber -> seed a smoke member (own plus-addressed email).
 *            Capture { email } into ledger key "member".
 *   execute  create_custom_event -> fire the run-scoped smoke event. The event
 *            NAME comes from the discovery overlay (`crsmoke_<runToken>_ev`)
 *            because Mailchimp requires ^[a-z][a-z0-9_]{0,29}$ — the dashed
 *            crsmoke- marker is invalid there. `is_syncing` stays default
 *            false, but the event fires on a member that exists only for this
 *            run, so no real automation can be attached to it.
 *   verify   custom_event_state (smokeRead) -> INDEPENDENT contact-events
 *            read-back (`GET .../members/{hash}/events`); expectContains
 *            proves the run-scoped event name is ON the persisted timeline
 *            (never the 204 write echo).
 *   cleanup  remove_subscriber delete_permanent -> the member and its event
 *            timeline are gone (LIVE_PASS_CLEANED).
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "create_custom_event",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    email: "{{ledger.member.id}}",
  },
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
    event_name: "SMOKE_MAILCHIMP_EVENT_NAME",
  },
  requiredEnv: [
    "SMOKE_MAILCHIMP_AUDIENCE_ID",
    "SMOKE_MAILCHIMP_SUB_EMAIL_EVENT",
    "SMOKE_MAILCHIMP_EVENT_NAME",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "mailchimp",
        action: "add_subscriber",
        config: {
          audience_id: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
          email: "{{env.SMOKE_MAILCHIMP_SUB_EMAIL_EVENT}}",
          status: "subscribed",
          first_name: "{{smokeMarker}}event",
          last_name: "smoke",
        },
        captureResource: { resourceKey: "member", idPath: "email", kind: "subscriber" },
      },
    ],
    verify: {
      provider: "mailchimp",
      action: "custom_event_state",
      smokeRead: true,
      config: {
        audienceId: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
        email: "{{ledger.member.id}}",
      },
      expectContains: { path: "eventNames", value: "{{env.SMOKE_MAILCHIMP_EVENT_NAME}}" },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "mailchimp",
      action: "remove_subscriber",
      config: {
        audience_id: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
        email: "{{ledger.member.id}}",
        mode: "delete_permanent",
      },
    },
  },
  notes:
    "Seed smoke member -> create_custom_event fires the run-scoped event " +
    "(underscore name per Mailchimp's regex) -> independent contact-events " +
    "read-back proves the event is on the timeline (expectContains on eventNames) " +
    "-> remove_subscriber delete_permanent cleanup.",
});
