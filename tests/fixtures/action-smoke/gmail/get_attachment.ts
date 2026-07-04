import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * gmail:get_attachment (writeSafe) — fetch a smoke email's attachment, stage its bytes to
 * OUR v2_storage, and prove the FileRef points at a real staged object WITHOUT any raw
 * bytes surfacing (file-output contract).
 *
 *   setup    (dev test) -> self-send a smoke seed email carrying one tiny text attachment
 *            named `{{smokeMarker}}attach.txt` (send_email has no attachments field, so a
 *            smoke-only multipart helper builds it) and resolve the Gmail-assigned
 *            attachmentId. Both ids are overlaid as SMOKE_GMAIL_ATTACHMENT_MESSAGE_ID /
 *            SMOKE_GMAIL_ATTACHMENT_ID; the seed message is trashed after the run.
 *   execute  get_attachment -> users.messages.get(full) locates the attachment,
 *            users.messages.attachments.get fetches the bytes, decodes internally, and
 *            stageFileToStorage stages them. Returns { file: FileRef(v2_storage), messageId,
 *            attachmentId, fileName, mimeType, sizeBytes } -- NO data/base64/content/bytes
 *            key (contract enforced by the handler + unit tests). markerEchoPath proves the
 *            returned `fileName` carries the run marker (it is OUR attachment). Capture the
 *            output FileRef's `file.storagePath` into ledger key "staged".
 *   verify   staged_file (SMOKE READ-BACK) -> reads OUR workflow-files bucket at that
 *            storagePath and asserts `exists == true` (independent proof the bytes actually
 *            staged). The seam returns only { exists, sizeBytes } -- never bytes.
 *
 * DISPOSITION: none. The staged v2_storage object (a few bytes) has no registered delete
 * action; it is a harmless marked artifact (same as slack:download_file). The Gmail seed
 * message is trashed by the dev test. Scope: `gmail.readonly`.
 */
export default defineWriteSmokeFixture({
  provider: "gmail",
  action: "get_attachment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    messageId: "{{env.SMOKE_GMAIL_ATTACHMENT_MESSAGE_ID}}",
    attachmentId: "{{env.SMOKE_GMAIL_ATTACHMENT_ID}}",
  },
  requiredEnv: [
    "SMOKE_GMAIL_CONNECTED",
    "SMOKE_GMAIL_ATTACHMENT_MESSAGE_ID",
    "SMOKE_GMAIL_ATTACHMENT_ID",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "staged", idPath: "file.storagePath", kind: "staged_file" },
    // The staged file's name (from the Gmail attachment) must carry the run marker ->
    // proves get_attachment fetched OUR attachment, not some other message's.
    markerEchoPath: "fileName",
    verify: {
      provider: "gmail",
      action: "staged_file",
      config: { storagePath: "{{ledger.staged.id}}" },
      smokeRead: true,
      expectEquals: { path: "exists", value: true },
    },
    // No cleanup: no registered action deletes a v2_storage object -> harmless artifact.
  },
  notes:
    "self-send attachment seed (dev test) -> get_attachment stages bytes to v2_storage -> " +
    "markerEchoPath proves fileName + staged_file read-back proves the object exists. " +
    "writeSafe; staged-object artifact. Output is FileRef(v2_storage), no bytes.",
});
