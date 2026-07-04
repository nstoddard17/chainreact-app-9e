import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:add_label (writeSafe) — add a label to a smoke-owned message, prove it landed via
 * an INDEPENDENT read-back, then trash the message.
 *
 *   setup    create_draft -> a smoke draft to SELF (a real, labelable message; verified
 *            live that draft messages accept messages.modify labels). Capture { messageId }.
 *   execute  add_label    -> users.messages.modify addLabelIds ["STARRED"].
 *   verify   message_labels (SMOKE READ-BACK) -> users.messages.get by id; assert
 *            `labelIds` CONTAINS "STARRED" (the modify echo is never trusted).
 *   cleanup  delete_email (trash) -> removes the smoke draft message.
 *
 * Uses the reversible SYSTEM label "STARRED" (always present, no creation, no artifact) so
 * the add/remove label path is certified without leaking a user label per run -- the
 * user-label create path is covered by gmail:create_label. Scope: `gmail.modify`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "add_label",
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
          subject: "{{smokeMarker}}addlabel ChainReact action-smoke - safe to ignore",
          textBody: "{{smokeMarker}}addlabel body",
        },
        captureResource: { resourceKey: "msg", idPath: "messageId", kind: "draft" },
      },
    ],
    verify: {
      provider: "gmail",
      action: "message_labels",
      config: { messageId: "{{ledger.msg.id}}" },
      smokeRead: true,
      expectContains: { path: "labelIds", value: "STARRED" },
    },
    cleanup: {
      provider: "gmail",
      action: "delete_email",
      config: { messageId: "{{ledger.msg.id}}", deleteMode: "trash" },
    },
    cleanupKind: "delete",
  },
  notes:
    "create_draft (labelable smoke message) -> add_label STARRED -> message_labels proves " +
    "labelIds contains STARRED -> delete_email(trash). writeSafe; cleaned (to Trash).",
});
