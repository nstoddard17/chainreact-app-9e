import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * slack:upload_file (sendSafe) — upload a deterministic crsmoke- file to the smoke
 * channel from a self-contained v2_storage FileRef, then prove it exists via an
 * INDEPENDENT files.info read-back.
 *
 *   setup    join_channel -> the bot self-joins the (public) smoke channel so the file
 *            share lands (idempotent).
 *   execute  upload_file  -> resolves bytes from a v2_storage FileRef (a tiny PNG the
 *            dev test stages in OUR workflow-files bucket at
 *            SMOKE_SLACK_UPLOAD_STORAGE_PATH), runs Slack's 3-step external upload, and
 *            returns { file: FileRef(provider_url), fileId (F...), permalink, channelIds }.
 *            The smoke marker lives in the FILENAME, so it is independent of the bytes.
 *            Capture the Slack fileId into ledger key "file".
 *   verify   get_file_info -> INDEPENDENT files.info of that fileId; assert the run
 *            marker is PRESENT on the persisted `fileName` (the upload echo is never
 *            trusted).
 *
 * DISPOSITION: none. Slack exposes no registered delete-file action (files.delete is not
 * wired as a V2 action), so the uploaded file cannot be cleaned via the harness. It is a
 * clearly-marked, ignorable crsmoke- file in the throwaway workspace (an accepted
 * artifact, not a leak). The output carries NO bytes/base64/content -- it is a
 * FileRef(provider_url) (contract enforced by the handler + unit tests). Each run leaves
 * one marked Slack file.
 *
 * requiredEnv: the connection signal + the staged source file's storage path (set by the
 * dev test; absent -> BLOCKED_ENV, never "not connected"). Scope: `files:write`
 * (+ `channels:join` self-join).
 */
export default defineWriteSmokeFixture({
  provider: "slack",
  action: "upload_file",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
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
  requiredEnv: ["SMOKE_SLACK_CONNECTED", "SMOKE_SLACK_CHANNEL_ID", "SMOKE_SLACK_UPLOAD_STORAGE_PATH"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "sendSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "slack",
        action: "join_channel",
        config: { channel: "{{env.SMOKE_SLACK_CHANNEL_ID}}" },
      },
    ],
    // upload_file returns { file, fileId, permalink, channelIds }; fileId is Slack's F-id.
    captureResource: { resourceKey: "file", idPath: "fileId", kind: "slack_file" },
    verify: {
      provider: "slack",
      action: "get_file_info",
      config: { fileId: "{{ledger.file.id}}" },
      markerPath: "fileName",
    },
    // No cleanup: Slack has no registered delete-file action -> uploaded file is a
    // throwaway artifact (documented).
  },
  notes:
    "join -> upload_file (staged v2_storage PNG, marker filename) -> get_file_info " +
    "read-back proves the marker on fileName. sendSafe; uploaded-file artifact (no " +
    "registered Slack delete). Output is FileRef(provider_url), no bytes.",
});
