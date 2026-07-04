import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:remove_subscriber (destructiveSafe, execute IS the cleanup) —
 * Mailchimp subscriber lifecycle.
 *
 *   setup    add_subscriber -> seed a smoke member (own plus-addressed email).
 *            Capture { email } into ledger key "member".
 *   execute  remove_subscriber mode "delete_permanent" -> delete exactly the
 *            ledger-created member. The Q11 destructive gate (`mode`) is
 *            supplied EXPLICITLY; delete_permanent is safe here because the
 *            address is unique per run, so Mailchimp's
 *            cannot-re-add-permanently-deleted rule never affects anything.
 *   verify   member_state (smokeRead) -> INDEPENDENT GET-by-hash read-back;
 *            assert exists == false. The `{deleted: true}` echo is NOT
 *            trusted; ONLY the typed 404 maps to exists:false in the seam —
 *            any other error is an honest VERIFY_FAILED, never a false
 *            "deleted".
 *   (executeIsCleanup)  the delete IS the disposition: artifact "cleaned".
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "remove_subscriber",
  // Permanent member deletion is hard-to-reverse data loss -> destructive
  // (airtable delete_record / hubspot remove_line_item precedent).
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    email: "{{ledger.member.id}}",
    // Q11 destructive gate — explicit, never defaulted.
    mode: "delete_permanent",
  },
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
  },
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID", "SMOKE_MAILCHIMP_SUB_EMAIL_REMOVE"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "mailchimp",
        action: "add_subscriber",
        config: {
          audience_id: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
          email: "{{env.SMOKE_MAILCHIMP_SUB_EMAIL_REMOVE}}",
          status: "subscribed",
          first_name: "{{smokeMarker}}remove",
          last_name: "smoke",
        },
        captureResource: { resourceKey: "member", idPath: "email", kind: "subscriber" },
      },
    ],
    verify: {
      provider: "mailchimp",
      action: "member_state",
      smokeRead: true,
      config: {
        audienceId: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
        email: "{{ledger.member.id}}",
      },
      expectEquals: { path: "exists", value: false },
    },
    // The action under test IS the disposition — no separate cleanup step.
    executeIsCleanup: true,
  },
  notes:
    "Seed smoke member -> remove_subscriber delete_permanent -> member_state seam " +
    "GET-by-hash read-back exists==false (typed 404 only; other errors fail " +
    "honestly). executeIsCleanup: artifact cleaned. destructiveSafe.",
});
