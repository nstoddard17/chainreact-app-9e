import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:archive_email (writeSafe) — remove the INBOX label that was added in setup from a
 * smoke-owned draft, prove it is gone via an INDEPENDENT read-back, then trash the draft.
 *
 *   setup    create_draft -> a smoke draft to SELF. Capture { messageId }.
 *   setup    add_label    -> add INBOX (a fresh draft has no INBOX; verified live that a
 *            draft accepts messages.modify addLabelIds ["INBOX"]) so archive is a real
 *            transition rather than a vacuous no-op.
 *   execute  archive_email -> users.messages.modify removeLabelIds ["INBOX"].
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` NO LONGER contains "INBOX" (the modify echo is never trusted).
 *   cleanup  delete_email (trash) -> removes the smoke draft.
 *
 * No email sent (INBOX is added to the draft in setup instead of self-delivering a real
 * message). Scope: `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "archive_email",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    messageId: "{{ledger.msg.id}}",
  },
  requiredEnv: ["SMOKE_GMAIL_CONNECTED", "SMOKE_GMAIL_SELF"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "gmail",
        action: "create_draft",
        config: {
          to: "{{env.SMOKE_GMAIL_SELF}}",
          subject: "{{smokeMarker}}archive ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}archive body",
        },
        captureResource: { resourceKey: "msg", idPath: "messageId", kind: "draft" },
      },
      {
        provider: "gmail",
        action: "add_label",
        config: { messageId: "{{ledger.msg.id}}", labelIds: ["INBOX"] },
      },
    ],
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectAbsent: { path: "labelIds", value: "INBOX" },
    },
    cleanup: {
      provider: "gmail",
      action: "delete_email",
      config: { messageId: "{{ledger.msg.id}}", deleteMode: "trash" },
    },
    cleanupKind: "delete",
  },
  notes:
    "create_draft + add_label INBOX (setup) -> archive_email -> message_labels proves " +
    "labelIds no longer contains INBOX -> delete_email(trash). writeSafe; cleaned.",
});
