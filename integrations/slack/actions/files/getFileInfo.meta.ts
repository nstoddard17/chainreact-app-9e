import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:get_file_info`.
 *
 * Mirrors `getFileInfo.schema.ts`:
 *   - `fileId`         (required) — Slack file id (`^F[A-Z0-9]+$`).
 *   - `includeComments` (optional boolean) — when true, Slack returns
 *                                            the first page of file
 *                                            comments (no pagination
 *                                            in v1).
 *
 * `producesFileRef: true` — the handler builds a Slack `FileRef(kind=
 * provider_url)` via `fileRefFromProviderUrl` against the file's
 * `url_private`. Downstream actions can consume the FileRef directly
 * (subject to per-handler provider_url support).
 *
 * Required scope: `files:read` (granted).
 *
 * Outputs match `getFileInfo.ts:return` exactly — FileRef + bounded
 * Slack file scalars. `comments` is always emitted for downstream-
 * shape stability; empty array when `includeComments !== true`.
 */
export const slackGetFileInfoMeta: ActionMeta = {
  key: "slack:get_file_info",
  provider: "slack",
  type: "get_file_info",
  displayName: "Get File Info",
  description:
    "Look up a Slack file by id via files.info. Returns a FileRef(kind=provider_url) plus bounded scalars (name, mime type, size, permalinks, uploader, channels, …). Optionally include the first page of file comments — Slack's pagination beyond the first page is not exposed in v1.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "fileId",
      label: "File id",
      description:
        "Slack file id (F-prefixed). Source from the file_uploaded trigger payload, another Slack file action's output, or a Slack file URL's `F…` segment.",
      type: "text",
      required: true,
      placeholder: "F01ABC23DEF",
    },
    {
      name: "includeComments",
      label: "Include comments",
      description:
        "When enabled, Slack returns the first page of file comments alongside the file metadata. Pagination beyond the first page is not exposed.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description:
        "Slack FileRef(kind=provider_url, provider='slack'). Consumable by downstream actions that accept FileRef inputs (note: handlers that do not support provider_url arms will reject — stage bytes via Download File first if needed).",
    },
    {
      name: "fileId",
      type: "string",
      description: "Echo of the input file id.",
    },
    {
      name: "fileName",
      type: "string",
      description: "Slack's stored file name.",
    },
    {
      name: "title",
      type: "string",
      description: "Optional file title as set by the uploader (may be null).",
    },
    {
      name: "fileType",
      type: "string",
      description: "Slack file-type shorthand (e.g. `png`, `pdf`; may be null).",
    },
    {
      name: "mimeType",
      type: "string",
      description: "MIME type Slack reports for the file.",
    },
    {
      name: "sizeBytes",
      type: "number",
      description: "File size in bytes (may be null when Slack omits it).",
    },
    {
      name: "permalink",
      type: "string",
      description: "Slack permalink for the file (may be null).",
    },
    {
      name: "permalinkPublic",
      type: "string",
      description:
        "Public Slack permalink for the file (only present when sharing is enabled; may be null).",
    },
    {
      name: "uploaderId",
      type: "string",
      description: "Slack user id of the uploader (may be null).",
    },
    {
      name: "channels",
      type: "array",
      description: "Channel ids the file is shared into.",
    },
    {
      name: "isPublic",
      type: "boolean",
      description: "True when Slack marks the file as public.",
    },
    {
      name: "isExternal",
      type: "boolean",
      description:
        "True when Slack marks the file as externally hosted (e.g. Google Drive integration).",
    },
    {
      name: "createdAt",
      type: "number",
      description: "File creation time as a Unix-seconds integer.",
    },
    {
      name: "commentsCount",
      type: "number",
      description: "Total comment count Slack reports (independent of `includeComments`).",
    },
    {
      name: "comments",
      type: "array",
      description:
        "First page of file comments when `Include comments` is enabled. Empty array otherwise (shape-stable).",
    },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 300,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
