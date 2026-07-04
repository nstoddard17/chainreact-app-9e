import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:unsubscribe_subscriber (writeSafe) — Mailchimp subscriber lifecycle.
 *
 *   setup    add_subscriber -> seed a SUBSCRIBED smoke member (own
 *            plus-addressed email, explicit consent status). Capture { email }
 *            into ledger key "member".
 *   execute  unsubscribe_subscriber -> flip the member to "unsubscribed"
 *            (schema fields are listId/emailAddress on this action).
 *   verify   get_subscriber (REGISTERED read) -> expectEquals pins the
 *            PERSISTED status "unsubscribed" (a no-op would read
 *            "subscribed" and fail); markerPath proves the member is ours.
 *   cleanup  remove_subscriber delete_permanent (LIVE_PASS_CLEANED).
 *
 * Reversible state change (re-subscribe restores it) -> risk "write",
 * matching the gmail remove_label / slack remove_user precedent.
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "unsubscribe_subscriber",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    emailAddress: "{{ledger.member.id}}",
  },
  configFromEnv: {
    listId: "SMOKE_MAILCHIMP_AUDIENCE_ID",
  },
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID", "SMOKE_MAILCHIMP_SUB_EMAIL_UNSUB"],
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
          email: "{{env.SMOKE_MAILCHIMP_SUB_EMAIL_UNSUB}}",
          status: "subscribed",
          first_name: "{{smokeMarker}}unsub",
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
      expectEquals: { path: "status", value: "unsubscribed" },
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
    "Seed SUBSCRIBED smoke member -> unsubscribe_subscriber -> registered " +
    "get_subscriber read-back pins status unsubscribed (marker on email) -> " +
    "remove_subscriber delete_permanent cleanup.",
});
