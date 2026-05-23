import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:download_file`.
 *
 * Mirrors `downloadFile.schema.ts` exactly: a single required `fileId`
 * input matching Slack's strict F-prefixed file id regex. The handler
 * downloads bytes via `url_private_download` with the bot bearer and
 * stages them through `services/files/stageFileToStorage`, returning
 * a `FileRef(kind=v2_storage, provider="slack")` plus bounded scalar
 * siblings (`fileId`, `fileName`, `mimeType`, `sizeBytes`).
 *
 * `producesFileRef: true` advertises the FileRef output to the
 * variable picker (Slice 3.7 `fileRef` type chip + Slice 3.22 chip-
 * append into file-array consumers). No bytes / base64 / `content`
 * field ever appears in the output (P-S3 + CLAUDE.md rule #1) — the
 * meta surface reflects this.
 *
 * Slice 3.26 — first Slack action meta. Slack already has 10 trigger
 * metas (Slice 3.11), so the provider is non-empty in the builder;
 * the metadata-coverage structural test still excludes `slack` from
 * `COVERED_PROVIDERS` because not every Slack runtime handler has a
 * meta yet (`slack:upload_file` follows in a separate slice; broader
 * Slack action coverage is its own arc).
 *
 * Required scope: `files:read` (and the underlying integration must
 * carry the bot token that the handler decrypts at execute time).
 *
 * Outputs match `downloadFile.ts:113-121` exactly.
 */
export const slackDownloadFileMeta: ActionMeta = {
  key: "slack:download_file",
  provider: "slack",
  type: "download_file",
  displayName: "Download File",
  description:
    "Download a Slack file by id and stage its bytes as a FileRef in v2 storage. The returned `file` output is a FileRef(kind=v2_storage) consumable by any downstream action that accepts file inputs (e.g. microsoft-outlook:send_email.attachments). Requires the Slack files:read scope.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "fileId",
      label: "File id",
      description:
        "Slack file id (F-prefixed). Source from the file_uploaded trigger payload, another Slack file action, or a Slack file URL's `F…` segment.",
      type: "text",
      required: true,
      placeholder: "F01ABC23DEF",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description:
        "Staged FileRef (kind=v2_storage, provider='slack'). Pass to downstream actions that accept file inputs.",
    },
    {
      name: "fileId",
      type: "string",
      description: "Echoes the input fileId.",
    },
    {
      name: "fileName",
      type: "string",
      description: "Filename from Slack's file metadata.",
    },
    {
      name: "mimeType",
      type: "string",
      description:
        "Mime type from Slack's file metadata. Defaults to application/octet-stream when Slack omits it.",
    },
    {
      name: "sizeBytes",
      type: "number",
      description: "Reported size of the staged file in bytes.",
    },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
