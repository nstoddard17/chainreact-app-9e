import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:reply_to_email (destructiveSafe, cleaned) — reply to a
 * dev-test-staged self-sent seed, prove the reply landed via an INDEPENDENT
 * folder read-back, then permanently delete every reply copy.
 *
 *   setup    (dev test) -> stage a self-sent seed with marker subject
 *            "{{smokeMarker}}seedreply ..." (Graph cannot reply to a DRAFT, so a
 *            real received message is required). Its inbox id rides the env
 *            overlay as SMOKE_OUTLOOK_SEED_REPLY_ID; both seed copies are
 *            permanently deleted in the dev test's finally.
 *   execute  reply_to_email -> Graph me/messages/{id}/reply with a marker body.
 *            202, no id returned.
 *   verify   find_messages (SMOKE READ-BACK) -> bounded poll of inbox + sentitems
 *            for subjects that contain the seed's marker AND start with "re"
 *            (Outlook prepends "RE: " — the prefix filter excludes the seed
 *            itself). minCount 2 (delivered self-reply + Sent Items copy);
 *            captures both ids. markerPath "subjects".
 *   cleanup  delete_email -> cleanupEach permanently deletes each captured copy.
 *
 * Scope: Mail.Send + Mail.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "reply_to_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    emailId: "{{env.SMOKE_OUTLOOK_SEED_REPLY_ID}}",
    body: "{{smokeMarker}}reply body - safe to ignore",
    replyAll: false,
  },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CONNECTED", "SMOKE_OUTLOOK_SEED_REPLY_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    verify: {
      provider: "microsoft-outlook",
      action: "find_messages",
      config: {
        folders: "inbox,sentitems",
        contains: "{{smokeMarker}}seedreply",
        prefix: "re",
        minCount: "2",
      },
      smokeRead: true,
      captureResource: { resourceKey: "reply", idsPath: "matches", kind: "message" },
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
    "reply to the staged self-sent seed (202, no id) -> find_messages proves 'RE: " +
    "<marker seed subject>' copies in inbox + Sent Items and captures both -> " +
    "delete_email permanent erases each. destructiveSafe; cleaned. Seed removed by " +
    "the dev test.",
});
