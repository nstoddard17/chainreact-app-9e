import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:download_file (writeSafe) — download a smoke-uploaded Slack file and stage its
 * bytes to OUR v2_storage, proving BOTH the metadata round-trip AND that a real,
 * non-empty staged object landed (honoring the file-output contract: no bytes surface).
 *
 *   setup    join_channel -> the bot self-joins the (public) smoke channel.
 *   setup    upload_file  -> upload a crsmoke- PNG (from the staged v2_storage source at
 *            SMOKE_SLACK_UPLOAD_STORAGE_PATH) so there is a real Slack fileId (F...) to
 *            download. Capture the fileId into ledger key "file".
 *   execute  download_file -> files.info(fileId) + fetch bytes with the bot bearer +
 *            stageFileToStorage. Returns { file: FileRef(v2_storage), fileId, fileName,
 *            mimeType, sizeBytes } -- NO bytes/base64/content (contract enforced by the
 *            handler + unit tests). markerEchoPath proves the returned `fileName` carries
 *            the marker (Slack's authoritative metadata, not an input echo -- the fixture
 *            only passes a fileId). Capture the output FileRef's `file.storagePath` into
 *            ledger key "staged".
 *   verify   staged_file (SMOKE READ-BACK) -> reads OUR workflow-files bucket at that
 *            storagePath and asserts `exists == true` (independent proof the bytes were
 *            actually staged). The seam returns only { exists, sizeBytes } -- never bytes.
 *
 * DISPOSITION: none. The staged v2_storage object (a few bytes in our bucket) has no
 * registered delete action; it is a harmless marked artifact. The setup upload also
 * leaves a Slack file artifact (Slack has no registered delete-file action). Each run
 * leaves one Slack file + one tiny staged object (documented). Scope: `files:read`
 * (+ `files:write` / `channels:join` for the setup upload).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "download_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    fileId: "{{ledger.file.id}}",
  },
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID", "SMOKE_SLACK_UPLOAD_STORAGE_PATH"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "join_channel",
        config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}" },
      },
      {
        provider: "slack",
        action: "upload_file",
        config: {
          channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}",
          file: {
            kind: "v2_storage",
            name: "{{smokeMarker}}upload.png",
            mimeType: "image/png",
            storagePath: "{{env.SMOKE_SLACK_UPLOAD_STORAGE_PATH}}",
          },
          title: "{{smokeMarker}}upload.png",
        },
        captureResource: { resourceKey: "file", idPath: "fileId", kind: "slack_file" },
      },
    ],
    // Capture the staged output FileRef's storagePath for the independent bucket read-back.
    captureResource: { resourceKey: "staged", idPath: "file.storagePath", kind: "staged_file" },
    // The returned fileName (from Slack files.info) must carry the marker -- proves the
    // right file was downloaded (Slack's metadata, not an input echo).
    markerEchoPath: "fileName",
    verify: {
      provider: "slack",
      action: "staged_file",
      config: { storagePath: "{{ledger.staged.id}}" },
      smokeRead: true,
      expectEquals: { path: "exists", value: true },
    },
    // No cleanup: no registered action deletes a v2_storage object -> harmless artifact.
  },
  notes:
    "join + upload (get a real Slack fileId) -> download_file stages bytes to v2_storage " +
    "-> markerEchoPath proves fileName + staged_file read-back proves the object exists. " +
    "writeSafe; staged-object + uploaded-file artifacts. Output is FileRef(v2_storage), no bytes.",
});
