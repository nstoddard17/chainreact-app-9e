import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:add_subscriber (writeSafe) — first Mailchimp write.
 *
 *   execute  add_subscriber -> capture { email } into ledger key "member". The
 *            subscriber address PLUS-ADDRESSES the connected account's own
 *            mailbox with the run marker (Mailchimp rejects fake domains, and
 *            adding a member via the API sends NO mail). `status` is the Q11
 *            consent gate — supplied EXPLICITLY as "subscribed" (our own
 *            operator-owned address on the throwaway audience). The marker
 *            also rides first_name for the merge-field read-back.
 *   verify   get_subscriber (REGISTERED read, GET by subscriber hash —
 *            strongly consistent) keyed on the captured email; markerPath
 *            proves the marker on the PERSISTED email, expectEquals pins
 *            status "subscribed".
 *   cleanup  remove_subscriber mode "delete_permanent" -> the member is gone
 *            for good (the address is unique per run, so Mailchimp's
 *            cannot-re-add-permanently-deleted rule never bites) ->
 *            LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "add_subscriber",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // Q11 consent gate — explicit, never defaulted.
    status: "subscribed",
    first_name: "{{smokeMarker}}first",
    last_name: "smoke",
  },
  configFromEnv: {
    audience_id: "SMOKE_MAILCHIMP_AUDIENCE_ID",
    email: "SMOKE_MAILCHIMP_SUB_EMAIL_ADD",
  },
  requiredEnv: ["SMOKE_MAILCHIMP_AUDIENCE_ID", "SMOKE_MAILCHIMP_SUB_EMAIL_ADD"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "member", idPath: "email", kind: "subscriber" },
    // The stored address carries the run marker (plus-addressed).
    markerEchoPath: "email",
    verify: {
      provider: "mailchimp",
      action: "get_subscriber",
      config: {
        audience_id: "{{env.SMOKE_MAILCHIMP_AUDIENCE_ID}}",
        email: "{{ledger.member.id}}",
      },
      markerPath: "email",
      expectEquals: { path: "status", value: "subscribed" },
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
    "Add a plus-addressed marker subscriber (explicit consent status, no mail sent) " +
    "-> registered get_subscriber read-back (marker on email, status subscribed) -> " +
    "remove_subscriber delete_permanent cleanup (unique per-run address).",
});
