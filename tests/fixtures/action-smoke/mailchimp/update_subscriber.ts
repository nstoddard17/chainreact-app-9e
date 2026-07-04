import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:update_subscriber (writeSafe) — Mailchimp subscriber lifecycle.
 *
 *   setup    add_subscriber -> seed a smoke member (its own plus-addressed
 *            email, first_name "{{marker}}seed", explicit consent status).
 *            Capture { email } into ledger key "member".
 *   execute  update_subscriber -> PATCH first_name to "{{marker}}updated".
 *   verify   get_subscriber (REGISTERED read) -> markerPath "mergeFields" +
 *            markerSuffix "updated" requires the SPECIFIC updated value on the
 *            persisted merge fields — the seed value would fail, proving the
 *            PATCH landed.
 *   cleanup  remove_subscriber delete_permanent (LIVE_PASS_CLEANED).
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "update_subscriber",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    email: "{{ledger.member.id}}",
    first_name: "{{smokeMarker}}updated",
  },
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
  },
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID", "SMOKE_MAILCHIMP_SUB_EMAIL_UPDATE"],
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
          email: "{{env.SMOKE_MAILCHIMP_SUB_EMAIL_UPDATE}}",
          status: "subscribed",
          first_name: "{{smokeMarker}}seed",
          last_name: "smoke",
        },
        captureResource: { resourceKey: "member", idPath: "email", kind: "subscriber" },
      },
    ],
    verify: {
      provider: "mailchimp",
      action: "get_subscriber",
      config: {
        audience_id: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
        email: "{{ledger.member.id}}",
      },
      // Suffix pins the SPECIFIC updated merge-field value; the seed fails it.
      markerPath: "mergeFields",
      markerSuffix: "updated",
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
    "Seed smoke member -> update_subscriber PATCHes first_name to {{marker}}updated " +
    "-> registered get_subscriber read-back (marker + suffix on mergeFields) -> " +
    "remove_subscriber delete_permanent cleanup.",
});
