import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:remove_tag (writeSafe) — Mailchimp subscriber lifecycle.
 *
 *   setup    add_subscriber -> seed a smoke member; then add_tag -> stamp the
 *            marker tag so there is a REAL tag membership to remove.
 *   execute  remove_tag -> strip the marker tag from the member.
 *   verify   get_subscriber (REGISTERED read) -> expectAbsent proves the
 *            marker tag is GONE from the persisted `tags` array (the inverse
 *            of add_tag's proof — never the removedTags echo); markerPath on
 *            the email proves the member itself is still ours and intact.
 *   cleanup  remove_subscriber delete_permanent (LIVE_PASS_CLEANED).
 *
 * Reversible membership change -> risk "write" (slack remove_reaction /
 * gmail remove_label precedent).
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "remove_tag",
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
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID", "SMOKE_MAILCHIMP_SUB_EMAIL_TAGREMOVE"],
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
          email: "{{env.SMOKE_MAILCHIMP_SUB_EMAIL_TAGREMOVE}}",
          status: "subscribed",
          first_name: "{{smokeMarker}}tagremove",
          last_name: "smoke",
        },
        captureResource: { resourceKey: "member", idPath: "email", kind: "subscriber" },
      },
      {
        provider: "mailchimp",
        action: "add_tag",
        config: {
          audience_id: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
          email: "{{ledger.member.id}}",
          tags: ["{{smokeMarker}}tag"],
        },
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
      expectAbsent: { path: "tags", value: "{{smokeMarker}}tag" },
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
    "Seed smoke member + marker tag -> remove_tag strips it -> registered " +
    "get_subscriber read-back proves the tag is ABSENT (expectAbsent on tags, marker " +
    "still on email) -> remove_subscriber delete_permanent cleanup.",
});
