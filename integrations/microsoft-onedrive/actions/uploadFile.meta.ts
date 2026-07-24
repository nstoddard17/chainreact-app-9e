import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:upload_file` — Slice 4.ONEDRIVE-META-3.
 * Mirrors `uploadFile.schema.ts`. Write action (medium risk).
 *
 * **FileRef deferred (Marcus decision):** the runtime takes a raw `content`
 * string (utf8/base64), NOT a V2 FileRef. So `content` is a **textarea**
 * (not a `file` field) and `consumesFileRef:false`. A future ONEDRIVE-FILEREF
 * runtime slice can add FileRef consumption. The `downloadUrl` output is
 * sensitive.
 */
export const microsoftOneDriveUploadFileMeta: ActionMeta = {
  key: "microsoft-onedrive:upload_file",
  provider: "microsoft-onedrive",
  type: "upload_file",
  displayName: "Upload File",
  description:
    "Upload a file to OneDrive from inline content (utf8 text or base64 bytes). Max 4 MB.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "parentItemId",
      label: "Folder",
      description:
        "Destination folder. Leave empty to upload to the drive root. Pick a folder, or paste a folder item id.",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-onedrive:folders",
      allowManualEntry: true,
      placeholder: "Drive root (or pick a folder)",
    },
    {
      name: "filename",
      label: "File Name",
      description: "The name to save the file as (including extension).",
      type: "text",
      required: true,
      placeholder: "e.g. report.pdf",
    },
    {
      name: "mimeType",
      label: "MIME Type",
      description:
        "What kind of file this is, as a standard content type matching the file name's extension — e.g. text/plain for .txt, application/pdf for .pdf, image/png for .png.",
      type: "text",
      required: true,
      placeholder: "e.g. application/pdf, text/plain",
    },
    {
      name: "content",
      label: "Content",
      description:
        "The file content. Plain text for utf8, or a base64 string for binary files. (OneDrive does not yet accept a file reference here — paste/encode the content.)",
      type: "textarea",
      required: true,
    },
    {
      name: "contentEncoding",
      label: "Content Encoding",
      description: "How Content is encoded. Use base64 for binary files.",
      type: "select",
      required: false,
      defaultValue: "utf8",
      options: [
        { value: "utf8", label: "Text (as typed)" },
        { value: "base64", label: "Base64 (binary files)" },
      ],
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "The new DriveItem id." },
    { name: "name", type: "string", description: "Stored file name." },
    { name: "size", type: "number", description: "Uploaded size in bytes (or null).", nullable: true },
    { name: "mimeType", type: "string", description: "Stored MIME type." },
    { name: "webUrl", type: "string", description: "Item URL (or null).", nullable: true },
    {
      name: "downloadUrl",
      type: "string",
      description: "Short-lived pre-signed download URL (or null).",
      sensitive: true,
      nullable: true,
    },
    { name: "parentReference", type: "object", description: "Parent drive/folder reference (or null).", nullable: true },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created (or null).", nullable: true },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified (or null).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "medium",
  riskDescription: "Uploads a file (recoverable — delete the item to undo).",
};
