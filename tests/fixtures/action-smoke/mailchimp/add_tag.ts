import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:add_tag (writeSafe) — Mailchimp subscriber lifecycle.
 *
 *   setup    add_subscriber -> seed a smoke member (own plus-addressed email).
 *            Capture { email } into ledger key "member".
 *   execute  add_tag -> stamp the marker tag ("{{marker}}tag") onto the member.
 *   verify   get_subscriber (REGISTERED read) -> expectContains proves the
 *            marker tag is IN the persisted `tags` array (never the addedTags
 *            echo); markerPath proves the member is ours.
 *   cleanup  remove_subscriber delete_permanent -> deletes the member (the tag
 *            membership goes with it; the tag NAME may persist as an unused
 *            audience label, crsmoke-marked and harmless) -> LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "add_tag",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    email: "{{ledger.member.id}}",
    tags: ["{{smokeMarker}}tag"],
  },
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
  },
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID", "SMOKE_MAILCHIMP_SUB_EMAIL_TAGADD"],
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
          email: "{{env.SMOKE_MAILCHIMP_SUB_EMAIL_TAGADD}}",
          status: "subscribed",
          first_name: "{{smokeMarker}}tagadd",
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
      markerPath: "email",
      expectContains: { path: "tags", value: "{{smokeMarker}}tag" },
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
    "Seed smoke member -> add_tag stamps {{marker}}tag -> registered get_subscriber " +
    "read-back proves tag membership (expectContains on tags) -> remove_subscriber " +
    "delete_permanent cleanup (unused crsmoke tag label may remain on the audience).",
});
