import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:forward_email (destructiveSafe, cleaned) — forward a
 * dev-test-staged self-sent seed BACK TO SELF, prove the forward landed via an
 * INDEPENDENT folder read-back, then permanently delete every forward copy.
 *
 *   setup    (dev test) -> stage a self-sent seed with marker subject
 *            "{{smokeMarker}}seedfwd ..."; its inbox id rides the env overlay as
 *            SMOKE_OUTLOOK_SEED_FWD_ID; both seed copies are permanently deleted
 *            in the dev test's finally.
 *   execute  forward_email -> Graph me/messages/{id}/forward { to: SELF, marker
 *            comment }. 202, no id returned.
 *   verify   find_messages (SMOKE READ-BACK) -> bounded poll of inbox + sentitems
 *            for subjects that contain the seed's marker AND start with "fw"
 *            (Outlook prepends "FW: " — excludes the seed itself). minCount 2
 *            (delivered self-forward + Sent Items copy); captures both ids.
 *   cleanup  delete_email -> cleanupEach permanently deletes each captured copy.
 *
 * Scope: Mail.Send + Mail.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "forward_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    emailId: "{{env.SMOKE_OUTLOOK_SEED_FWD_ID}}",
    to: "{{env.SMOKE_OUTLOOK_SELF}}",
    comment: "{{smokeMarker}}fwd comment - safe to ignore",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_OUTLOOK_CONNECTED",
    "SMOKE_OUTLOOK_SEED_FWD_ID",
    "SMOKE_OUTLOOK_SELF",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    verify: {
      provider: "microsoft-outlook",
      action: "find_messages",
      config: {
        folders: "inbox,sentitems",
        contains: "{{smokeMarker}}seedfwd",
        prefix: "fw",
        minCount: "2",
      },
      smokeRead: true,
      captureResource: { resourceKey: "fwd", idsPath: "matches", kind: "message" },
      expectEquals: { path: "found", value: true },
      markerPath: "subjects",
    },
    cleanupKind: "delete",
    cleanupEach: {
      provider: "microsoft-outlook",
      action: "delete_email",
      config: { emailId: "{{each.id}}", deleteMode: "permanent" },
    },
  },
  notes:
    "forward the staged self-sent seed to SELF (202, no id) -> find_messages proves " +
    "'FW: <marker seed subject>' copies in inbox + Sent Items and captures both -> " +
    "delete_email permanent erases each. destructiveSafe; cleaned. Seed removed by " +
    "the dev test.",
});
