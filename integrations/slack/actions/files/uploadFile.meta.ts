import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:upload_file`.
 *
 * Mirrors `uploadFile.schema.ts` exactly. Five config fields:
 *   - `channel` (required combobox) — Slack channel id, populated via
 *                                     the async `slack:channels` options
 *                                     source (Slice 3.32). The runtime
 *                                     handler's strict C…/G…/D… regex
 *                                     remains the authoritative
 *                                     validator on save.
 *   - `file`    (required file)  — P-S3 `FileRef`. Authors insert via the
 *                                  Slice 3.25 single-FileRef chip + variable
 *                                  picker.
 *   - `title`           (optional text)
 *   - `initialComment`  (optional textarea)
 *   - `threadTs`        (optional text)
 *
 * Runtime boundaries kept here for accuracy + author guidance, but
 * **never** enforced at the builder layer:
 *   - The handler rejects `kind=provider_url` FileRefs at execute time
 *     with a structured "stage bytes first" hint (see `uploadFile.ts`
 *     §provider_url_unsupported). The renderer does NOT type-aware-
 *     filter picker options (D-FRA-6 / D-SFR-10 — runtime is the
 *     authoritative gate).
 *   - `channel` resolves to a channel id (C…/G…/D…) — the picker
 *     surfaces friendly `#name` labels for selection but the saved
 *     value is the channel id; the runtime handler regex is the real
 *     validator.
 *
 * **Both `producesFileRef` AND `consumesFileRef` are true.** Slack
 * `upload_file` is the first action V2 ships that touches FileRef on
 * both sides:
 *   - **consumes** the FileRef passed in `config.file`,
 *   - **produces** a FileRef in `output.file` (built via
 *     `fileRefFromProviderUrl` against `url_private` after Slack
 *     completes the upload — see `uploadFile.ts:221-231`).
 *
 * Slice 3.27 — second Slack action meta, paired with Slice 3.26's
 * `slack:download_file` producer. Slack remains intentionally absent
 * from `COVERED_PROVIDERS` in `tests/structure/discovery-meta-coverage.test.ts`
 * because the messaging / channels / reactions surfaces still lack
 * metas. Partial coverage is acceptable for non-covered providers.
 *
 * Required scope: `files:write` (and the underlying integration must
 * carry the bot token that the handler decrypts at execute time).
 *
 * Outputs match `uploadFile.ts:233-240` exactly.
 */
export const slackUploadFileMeta: ActionMeta = {
  key: "slack:upload_file",
  provider: "slack",
  type: "upload_file",
  displayName: "Upload File",
  description:
    "Upload a file to a Slack channel from an upstream FileRef output. Insert the FileRef via the variable picker (e.g. slack:download_file, gmail:get_attachment). The Slack handler rejects FileRef(kind=provider_url) at runtime — stage bytes through an upstream get_*/download_* action first. Requires the Slack files:write scope.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      sensitivity: "recipient",
      label: "Channel",
      description:
        "Searchable picker over public + private channels visible to the bot. The picker surfaces friendly `#name` labels; the saved value is the underlying channel id (C…/G…/D…).",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: true,
      placeholder: "Search channels or paste a channel ID",
    },
    {
      name: "file",
      label: "File",
      description:
        "The file to upload. Use the variable picker to insert a file from a previous step (slack:download_file, gmail:get_attachment, microsoft-outlook:get_attachment, and other get/download actions). Link-only files are rejected — stage the bytes through an upstream get/download step first.",
      type: "file",
      required: true,
      placeholder: "Insert a {{...}} file from a previous step",
    },
    {
      name: "title",
      label: "Title",
      description:
        "Optional display title for the Slack share. Falls back to the sanitized file name when omitted.",
      type: "text",
      required: false,
    },
    {
      name: "initialComment",
      label: "Message",
      description: "Optional message shown with the file in the channel.",
      type: "textarea",
      required: false,
    },
    {
      name: "threadTs",
      label: "Thread timestamp",
      description:
        "Optional. Wire the `ts` output of an earlier Slack message step to share the file as a reply in that thread.",
      type: "text",
      required: false,
      placeholder: "1700000000.000100",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description:
        "Resulting Slack FileRef (kind=provider_url, provider='slack'). Consumable by downstream actions that accept FileRef inputs — though provider_url arms are rejected by handlers that don't support cross-provider fetch.",
    },
    {
      name: "fileId",
      type: "string",
      description: "Slack's F-prefixed file id for the newly shared file.",
    },
    {
      name: "permalink",
      type: "string",
      description: "Slack permalink for the shared file, or null when Slack omits it.",
    },
    {
      name: "channelIds",
      type: "array",
      description:
        "Channel ids the file was shared into (Slack returns this as an array even for single-channel shares).",
    },
  ],
  producesFileRef: true,
  consumesFileRef: true,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Uploads a file to Slack — visible to channel members; deletion requires a separate call.",
};
