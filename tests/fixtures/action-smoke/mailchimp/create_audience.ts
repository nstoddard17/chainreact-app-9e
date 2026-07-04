import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * mailchimp:create_audience (writeSafe) — Mailchimp finisher batch.
 *
 *   execute  create_audience -> capture { audienceId } into ledger key
 *            "audience". The audience NAME carries the unique smoke marker.
 *            CAN-SPAM contact fields are harmless fixed placeholders; the
 *            campaign_defaults from_email is the connected account's OWN
 *            owner mailbox (discovery overlay) — an audience is a container,
 *            creating one sends no mail to anyone.
 *   verify   audience_state (smokeRead) -> INDEPENDENT bounded lists
 *            read-back; expectEquals exists:true + markerPath proves the
 *            marker on the PERSISTED audience name.
 *   cleanup  none — Mailchimp has NO registered audience-delete action and
 *            the smoke seam is read-only by invariant, so ONE crsmoke-marked
 *            audience remains per certification run (artifact "left").
 *
 * HONEST plan caveat: Mailchimp's free plan allows a single audience — on a
 * plan-limited account the live create fails with the plan-limit error and
 * this fixture reports an honest FAIL/blocker instead of a pass.
 */
export default defineWriteSmokeFixture({
  provider: "mailchimp",
  action: "create_audience",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    name: "{{smokeMarker}}audience",
    permission_reminder:
      "You are in the ChainReact action-smoke test audience - safe to ignore",
    email_type_option: false,
    contact: {
      company: "{{smokeMarker}}co",
      address1: "123 Smoke Test St",
      city: "Testville",
      state: "CA",
      zip: "00000",
      country: "US",
    },
    campaign_defaults: {
      from_name: "ChainReact Smoke",
      from_email: "{{env.SMOKE_MAILCHIMP_OWNER_EMAIL}}",
      subject: "ChainReact action-smoke - safe to ignore",
      language: "en",
    },
  },
  requiredEnv: ["SMOKE_MAILCHIMP_OWNER_EMAIL"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "audience", idPath: "audienceId", kind: "audience" },
    // create_audience echoes the stored name; confirm the marker round-tripped.
    markerEchoPath: "name",
    verify: {
      provider: "mailchimp",
      action: "audience_state",
      smokeRead: true,
      config: { audienceId: "{{ledger.audience.id}}" },
      markerPath: "name",
      expectEquals: { path: "exists", value: true },
    },
  },
  notes:
    "Create a smoke-marked audience (placeholder CAN-SPAM contact, owner mailbox as " +
    "from_email, no mail sent) -> independent lists read-back (exists + marker on " +
    "name). No registered audience delete -> ONE audience artifact left per " +
    "certification run. Free-plan accounts fail the create with the plan-limit error.",
});
