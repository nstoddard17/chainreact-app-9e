import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-drive:upload_file` — Slice 4.GDRIVE-META-2.
 * Mirrors `uploadFile.schema.ts`. Write action (medium risk — recoverable
 * via Delete File).
 *
 * `parentFolderId` wires to the existing `google-drive:folders` resolver
 * (no dep; account-scoped); optional — when unset, the file lands at My
 * Drive root.
 *
 * FileRef DEFERRED (mirror OneDrive). `content` is a textarea string
 * (utf8 default; set Content Encoding to base64 for binary). The 25 MB cap
 * is enforced server-side inside `filesCreateMultipart`. A future
 * GDRIVE-FILEREF runtime slice can flip this to consume FileRef.
 * `producesFileRef:false` / `consumesFileRef:false` — no FileRef surface.
 *
 * No sensitive outputs (Drive `webViewLink` is auth-gated, not signed —
 * mirror OneDrive `webUrl` / GCal `htmlLink` precedent).
 */
export const googleDriveUploadFileMeta: ActionMeta = {
  key: "google-drive:upload_file",
  provider: "google-drive",
  type: "upload_file",
  displayName: "Upload File",
  description: "Upload a file to Google Drive.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "filename",
      label: "File Name",
      description: "Name of the new file (with extension).",
      type: "text",
      required: true,
      placeholder: "report.pdf",
    },
    {
      name: "mimeType",
      label: "MIME Type",
      description: 'The file content type, e.g. "application/pdf" or "text/plain".',
      type: "text",
      required: true,
      placeholder: "application/pdf",
    },
    {
      name: "content",
      label: "Content",
      description:
        "The file content. Up to ~25 MB after decoding. For binary content (PNG, PDF, etc.) set Content Encoding to base64 in an upstream step.",
      type: "textarea",
      required: true,
    },
    {
      name: "contentEncoding",
      label: "Content Encoding",
      description: 'How the Content field is encoded. Use "base64" for binary files.',
      type: "select",
      required: false,
      defaultValue: "utf8",
      options: [
        { value: "utf8", label: "UTF-8 (text)" },
        { value: "base64", label: "Base64 (binary)" },
      ],
    },
    {
      name: "parentFolderId",
      label: "Folder",
      description:
        "Folder to upload into. Leave empty to upload to My Drive root, or pick a folder.",
      type: "combobox",
      required: false,
      optionsSource: "google-drive:folders",
      placeholder: "My Drive root (or pick a folder)",
    },
  ],
  outputs: [
    { name: "fileId", type: "string", description: "The new file's id." },
    { name: "name", type: "string", description: "The new file's name." },
    { name: "mimeType", type: "string", description: "The new file's MIME type." },
    {
      name: "parents",
      type: "array",
      description: "Parent folder ids (one entry — the upload target).",
    },
    { name: "webViewLink", type: "string", description: "Drive UI link to the file (or null)." },
    { name: "size", type: "string", description: "Byte size as a string (or null)." },
    { name: "createdTime", type: "string", description: "ISO-8601 created time (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "medium",
  riskDescription: "Creates a new file on Drive (recoverable — delete the file to undo).",
};
