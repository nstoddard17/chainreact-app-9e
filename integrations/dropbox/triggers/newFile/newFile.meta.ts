import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `dropbox:new_file` — Slice 3.DROPBOX-5.
 *
 * **Webhook-activated, shared-infra + per-account cursor.** Unlike Monday
 * (per-board `create_webhook`), Dropbox's webhook URL is registered ONCE in
 * the Dropbox App Console — there is no per-workflow webhook-creation API.
 * The activation hook (`integrations/dropbox/triggers/newFile/activate.ts`,
 * registered via `registerActivation("dropbox", "new_file", …)`) instead
 * seeds a `list_folder` cursor via `/2/files/list_folder/get_latest_cursor`
 * so the first reconciliation only sees files that arrive AFTER activation
 * (the V2 "first poll miss" rule applied to the cursor model). That cursor
 * seeding satisfies the `trigger-meta-activation-invariant` test WITHOUT a
 * `SHARED_INFRA_EXEMPT_KEYS` entry — Dropbox has real per-workflow
 * activation work (the cursor), it just doesn't create a remote webhook.
 *
 * Inbound notifications (`{ list_folder: { accounts: [account_id…] } }`)
 * arrive at the global `/api/webhooks/dropbox` route, which verifies the
 * `X-Dropbox-Signature` HMAC, then reconciles each affected account's
 * trigger rows via `list_folder/continue` and dispatches one run per new
 * file.
 *
 * `fields[]` mirrors the user-set fields of `DropboxNewFileConfigSchema`.
 * Server-managed `snapshot` is intentionally NOT surfaced (mirrors Gmail's
 * convention of hiding activation-managed state). `payloadShape` mirrors
 * `normalize.ts` — file metadata only (no bytes, no download/temp/shared
 * links).
 *
 * Risk: observational; low.
 */
export const dropboxNewFileTriggerMeta: TriggerMeta = {
  key: "dropbox:new_file",
  provider: "dropbox",
  type: "new_file",
  displayName: "New File",
  description:
    "Fires when a new file appears in the watched Dropbox folder. Backed by Dropbox's app-level webhook plus a per-folder cursor — set the webhook URL once in the Dropbox App Console. Re-uploads (a new revision of an existing file) also fire. Root-level watching is supported (leave the folder empty).",
  category: "files",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "path",
      label: "Folder to watch",
      description:
        "Folder whose new files trigger the workflow. Leave empty (or pick Root) to watch the top level.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Root",
    },
    {
      name: "recursive",
      label: "Include subfolders",
      description: "Also fire for new files inside nested subfolders.",
      type: "boolean",
      required: false,
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'new_file'." },
    { name: "id", type: "string", description: "Dropbox file id (stable; usable as a dedup key)." },
    {
      name: "name",
      type: "string",
      description: "File name. Sensitive — file names can carry PII.",
      sensitive: true,
    },
    {
      name: "path",
      type: "string",
      description: "Dropbox display path. Sensitive — folder structure reveals org/PII.",
      sensitive: true,
    },
    {
      name: "pathLower",
      type: "string",
      description: "Lower-cased Dropbox path. Sensitive — same as path.",
      sensitive: true,
    },
    { name: "rev", type: "string", description: "Dropbox revision id." },
    { name: "sizeBytes", type: "number", description: "File size in bytes (when present)." },
    { name: "clientModified", type: "string", description: "Client-reported modified time (when present)." },
    { name: "serverModified", type: "string", description: "Dropbox server modified time (when present)." },
    { name: "accountId", type: "string", description: "Dropbox account id (dbid:…) the file belongs to." },
    { name: "isDownloadable", type: "boolean", description: "Whether the file can be downloaded (when present)." },
  ],
  displayOrder: 10,
};
