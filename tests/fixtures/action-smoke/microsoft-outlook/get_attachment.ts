import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-outlook:get_attachment (writeSafe) — fetch a smoke seed's attachment,
 * stage its bytes to OUR v2_storage, and prove the FileRef points at a real staged
 * object WITHOUT any raw bytes surfacing (file-output contract).
 *
 *   setup    (dev test) -> self-send a smoke seed carrying ONE tiny text
 *            fileAttachment named `{{smokeMarker}}attach.txt` (create_draft_email
 *            has no attachments field, so the staging helper sends it via the
 *            sendMail wrapper). The inbox id rides the env overlay as
 *            SMOKE_OUTLOOK_ATTACHMENT_MESSAGE_ID; both seed copies are permanently
 *            deleted in the dev test's finally.
 *   execute  get_attachment { downloadMode: "by_name", fileNameFilter: the run
 *            marker } -> lists the message's attachments, fetches the matching
 *            fileAttachment's contentBytes, decodes internally, and
 *            stageFileToStorage stages them. Output entries carry
 *            { file: FileRef(v2_storage), name, size, ... } — NO contentBytes /
 *            base64 / content key (contract enforced by the handler + unit tests).
 *            markerEchoPath proves the first entry's `name` carries the run marker
 *            (it is OUR attachment). Capture the staged FileRef's storagePath into
 *            ledger key "staged".
 *   verify   staged_file (SMOKE READ-BACK) -> reads OUR workflow-files bucket at
 *            that storagePath and asserts `exists == true`. The seam returns only
 *            { exists, sizeBytes } — never bytes.
 *
 * DISPOSITION: none. The staged v2_storage object has no registered delete action
 * (harmless marked artifact — gmail:get_attachment / slack:download_file
 * precedent). The Outlook seed is removed by the dev test. Scope: Mail.Read.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-outlook",
  action: "get_attachment",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    emailId: "{{env.SMOKE_OUTLOOK_ATTACHMENT_MESSAGE_ID}}",
    downloadMode: "by_name",
    fileNameFilter: "{{smokeMarker}}",
    excludeInline: true,
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_OUTLOOK_CONNECTED",
    "SMOKE_OUTLOOK_ATTACHMENT_MESSAGE_ID",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: {
      resourceKey: "staged",
      idPath: "attachments.0.file.storagePath",
      kind: "staged_file",
    },
    // The staged entry's name (from the Graph attachment) must carry the run
    // marker -> proves get_attachment fetched OUR attachment.
    markerEchoPath: "attachments.0.name",
    verify: {
      provider: "microsoft-outlook",
      action: "staged_file",
      config: { storagePath: "{{ledger.staged.id}}" },
      smokeRead: true,
      expectEquals: { path: "exists", value: true },
    },
    // No cleanup: no registered action deletes a v2_storage object -> harmless artifact.
  },
  notes:
    "self-send attachment seed (dev test) -> get_attachment by_name marker filter " +
    "stages bytes to v2_storage -> markerEchoPath proves the attachment name + " +
    "staged_file read-back proves the object exists. writeSafe; staged-object " +
    "artifact. Output is FileRef(v2_storage), no bytes.",
});
