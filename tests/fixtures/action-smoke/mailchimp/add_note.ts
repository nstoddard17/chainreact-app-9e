import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:add_note (writeSafe) — Mailchimp finisher batch.
 *
 *   setup    add_subscriber -> seed a smoke member (own plus-addressed email,
 *            explicit consent status). Capture { email } into ledger key
 *            "member".
 *   execute  add_note -> attach a marker note to the member.
 *   verify   member_notes_state (smokeRead) -> INDEPENDENT notes read-back
 *            (`GET .../members/{hash}/notes`); markerPath proves the marker on
 *            the PERSISTED note bodies (never the create echo).
 *   cleanup  remove_subscriber delete_permanent -> the member and its notes
 *            are gone (LIVE_PASS_CLEANED).
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "add_note",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    email: "{{ledger.member.id}}",
    note: "{{smokeMarker}}note ChainReact action-smoke - safe to ignore",
  },
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
  },
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID", "SMOKE_MAILCHIMP_SUB_EMAIL_NOTE"],
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
          email: "{{env.SMOKE_MAILCHIMP_SUB_EMAIL_NOTE}}",
          status: "subscribed",
          first_name: "{{smokeMarker}}note",
          last_name: "smoke",
        },
        captureResource: { resourceKey: "member", idPath: "email", kind: "subscriber" },
      },
    ],
    verify: {
      provider: "mailchimp",
      action: "member_notes_state",
      smokeRead: true,
      config: {
        audienceId: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
        email: "{{ledger.member.id}}",
      },
      markerPath: "notes",
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
    "Seed smoke member -> add_note attaches a marker note -> independent notes " +
    "read-back (marker on persisted note bodies) -> remove_subscriber " +
    "delete_permanent cleanup (notes go with the member).",
});
