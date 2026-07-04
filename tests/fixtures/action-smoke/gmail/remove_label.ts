import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:remove_label (writeSafe) — remove a label that was added in setup from a
 * smoke-owned message, prove it is gone via an INDEPENDENT read-back, then trash the
 * message.
 *
 *   setup    create_draft -> a smoke draft to SELF. Capture { messageId }.
 *   setup    add_label    -> users.messages.modify addLabelIds ["STARRED"] (so there is a
 *            label to remove).
 *   execute  remove_label -> users.messages.modify removeLabelIds ["STARRED"].
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` NO LONGER contains "STARRED" (the modify echo is never trusted).
 *   cleanup  delete_email (trash) -> removes the smoke draft message.
 *
 * Uses the reversible SYSTEM label "STARRED" (no user-label artifact). Scope: `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "remove_label",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    messageId: "{{ledger.msg.id}}",
    labelIds: ["STARRED"],
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
          subject: "{{smokeMarker}}removelabel ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}removelabel body",
        },
        captureResource: { resourceKey: "msg", idPath: "messageId", kind: "draft" },
      },
      {
        provider: "gmail",
        action: "add_label",
        config: { messageId: "{{ledger.msg.id}}", labelIds: ["STARRED"] },
      },
    ],
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectAbsent: { path: "labelIds", value: "STARRED" },
    },
    cleanup: {
      provider: "gmail",
      action: "delete_email",
      config: { messageId: "{{ledger.msg.id}}", deleteMode: "trash" },
    },
    cleanupKind: "delete",
  },
  notes:
    "create_draft + add_label STARRED (setup) -> remove_label STARRED -> message_labels " +
    "proves labelIds no longer contains STARRED -> delete_email(trash). writeSafe; cleaned.",
});
