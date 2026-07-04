import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:send_email (destructiveSafe, cleaned) — send one deterministic
 * crsmoke- email to the connected throwaway mailbox ITSELF, prove delivery via an
 * INDEPENDENT folder read-back, then permanently delete every smoke copy.
 *
 *   execute  send_email    -> Graph me/sendMail { to: SELF, marker subject "send" }.
 *            Graph returns 202 with NO message id, so nothing can be captured from
 *            the execute output (unlike Gmail).
 *   verify   find_messages (SMOKE READ-BACK) -> bounded poll of inbox + sentitems
 *            for the run-unique marker subject; asserts found (minCount 2: the
 *            delivered inbox copy AND the saved Sent Items copy) and captures BOTH
 *            ids via idsPath into ledger keys copy0/copy1. markerPath "subjects"
 *            proves the marker on the persisted subjects. The send echo is never
 *            trusted.
 *   cleanup  delete_email  -> cleanupEach permanently deletes each captured copy
 *            ({{each.id}}). Permanent = a true Graph hard delete.
 *
 * SELF address comes from SMOKE_OUTLOOK_SELF (discovered live via Graph /me;
 * absent -> BLOCKED_ENV). Mail never leaves the throwaway mailbox. Scope:
 * Mail.Send + Mail.ReadWrite.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "send_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    to: "{{env.SMOKE_OUTLOOK_SELF}}",
    subject: "{{smokeMarker}}send ChainReact action-smoke - safe to ignore",
    body: "{{smokeMarker}}send body - safe to ignore",
    isHtml: false,
    importance: "normal",
  },
  requiredEnv: ["SMOKE_MICROSOFT_OUTLOOK_CONNECTED", "SMOKE_OUTLOOK_SELF"],
  expect: { outcome: "success" },
  writeHarness: {
    // Cleanup is a PERMANENT Graph delete -> destructive gates required.
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    verify: {
      provider: "microsoft-outlook",
      action: "find_messages",
      config: { folders: "inbox,sentitems", contains: "{{smokeMarker}}send", minCount: "2" },
      smokeRead: true,
      captureResource: { resourceKey: "copy", idsPath: "matches", kind: "message" },
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
    "send_email to SELF (202, no id) -> find_messages poll proves inbox + Sent Items " +
    "copies by run-unique marker subject and captures both ids -> delete_email " +
    "permanent erases each. destructiveSafe; cleaned (both copies hard-deleted).",
});
