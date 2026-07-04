import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:create_draft (writeSafe) — create a deterministic crsmoke- draft addressed to
 * SELF (never sent), prove it is a persisted DRAFT via an INDEPENDENT read-back, then
 * trash it.
 *
 *   execute  create_draft -> users.drafts.create a draft { to: SELF, subject:
 *            "{{smokeMarker}}draft", ... }. A draft to the smoke account's own inbox is
 *            never delivered. Capture the draft's underlying { messageId } into ledger
 *            key "msg".
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` CONTAINS "DRAFT" (proves it is a real draft) AND the marker is on
 *            the `subject` (proves it is OURS). The create echo is never trusted.
 *   cleanup  delete_email (trash) -> trashing the draft's message removes it from
 *            in:drafts (verified live). cleanupKind delete -> artifact cleaned (to Trash,
 *            recoverable ~30d; gone from the active mailbox).
 *
 * SELF address comes from SMOKE_GMAIL_SELF (discovered live via users.getProfile; absent
 * -> BLOCKED_ENV). Scope: `gmail.compose` / `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "create_draft",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    to: "{{env.SMOKE_GMAIL_SELF}}",
    subject: "{{smokeMarker}}draft ChainReact action-smoke - safe to ignore",
    textBody: "{{smokeMarker}}draft body - safe to ignore",
  },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED", "SMOKE_GMAIL_SELF"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    // create_draft returns { draftId, messageId, threadId, ... }; messageId is the draft's
    // underlying Gmail message id (usable by messages.get / messages.modify / trash).
    captureResource: { resourceKey: "msg", idPath: "messageId", kind: "draft" },
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectContains: { path: "labelIds", value: "DRAFT" },
      markerPath: "subject",
    },
    cleanup: {
      provider: "gmail",
      action: "delete_email",
      config: { messageId: "{{ledger.msg.id}}", deleteMode: "trash" },
    },
    cleanupKind: "delete",
  },
  notes:
    "create_draft to SELF -> message_labels read-back proves labelIds contains DRAFT + " +
    "marker on subject -> delete_email(trash) removes it from drafts. writeSafe; cleaned " +
    "(to Trash, recoverable ~30d).",
});
