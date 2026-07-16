import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:get_attachment`.
 *
 * Mirrors `getAttachment.schema.ts`. P-O2 fileAttachment-only port —
 * returns FileRef[] via P-S3 `stageFileToStorage`. itemAttachment and
 * referenceAttachment surface as metadata-only stubs (skipped:true).
 *
 * `downloadMode` carries the schema's `default("all")`; `excludeInline`
 * carries `default(true)` — both are non-high-risk schema defaults
 * (bound output / preserve V1-parity hygiene; no destructive side effect).
 *
 * `fileExtensions` is required-by-handler when `downloadMode ===
 * "by_extension"`; `fileNameFilter` is required-by-handler when
 * `downloadMode === "by_name"`. Both are gated by `visibleWhen` on
 * `downloadMode` and marked required — required-when-visible means
 * readiness only flags them in the mode that actually needs them,
 * and the mode-change cascade clears stale other-mode values. The
 * handler's mode-specific validation stays authoritative at runtime.
 *
 * Output: `attachments[]` — each entry carries a FileRef when the
 * attachment was downloaded (fileAttachment passing the mode filter)
 * OR a skipped:true stub (itemAttachment / referenceAttachment / mode-
 * filtered-out). `producesFileRef: true` so the variable picker
 * surfaces this with file-aware rendering.
 *
 * Required scope: `Mail.Read`.
 *
 * Outputs match `getAttachment.ts:212-219` exactly.
 */
export const outlookGetAttachmentMeta: ActionMeta = {
  key: "microsoft-outlook:get_attachment",
  provider: "microsoft-outlook",
  type: "get_attachment",
  displayName: "Get Email Attachment",
  description:
    "Download Outlook message attachments and stage them as FileRefs (one per attachment) in v2 storage. Filter by mode: all attachments, by extension (e.g. 'pdf, png'), or by filename substring. Inline images are excluded by default. itemAttachment and referenceAttachment surface as metadata-only stubs (no bytes) because Microsoft Graph forbids direct download. Requires the Mail.Read scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "emailId",
      label: "Email id",
      description:
        "Graph message id carrying the attachments. Source from a trigger payload (payload.messageId), fetch_emails result, or upstream search.",
      type: "text",
      required: true,
    },
    {
      name: "downloadMode",
      label: "Download mode",
      description:
        "Filter strategy. 'All' downloads every fileAttachment. 'By extension' uses the File extensions list below. 'By name' uses the File name filter below.",
      type: "select",
      required: false,
      defaultValue: "all",
      options: [
        { value: "all", label: "All attachments" },
        { value: "by_extension", label: "By extension" },
        { value: "by_name", label: "By filename substring" },
      ],
    },
    {
      name: "fileExtensions",
      label: "File extensions",
      description:
        "Extensions to match (e.g. 'pdf', 'png'). Leading dots and letter case are ignored.",
      type: "string-array",
      required: true,
      visibleWhen: { field: "downloadMode", valueIn: ["by_extension"] },
      placeholder: "pdf",
    },
    {
      name: "fileNameFilter",
      label: "File name contains",
      description:
        "Text to look for in attachment filenames (case-insensitive).",
      type: "text",
      required: true,
      visibleWhen: { field: "downloadMode", valueIn: ["by_name"] },
      placeholder: "invoice",
    },
    {
      name: "excludeInline",
      label: "Exclude inline attachments",
      description:
        "On (default): skip images embedded in the email body. Turn off to download those too.",
      type: "boolean",
      required: false,
      defaultValue: true,
    },
  ],
  outputs: [
    {
      name: "attachments",
      type: "array",
      description:
        "Per-attachment entries — each is either { id, name, contentType, sizeBytes, file: FileRef } when downloaded, OR { id, name, contentType, sizeBytes, skipped: true, skipReason } when itemAttachment / referenceAttachment / mode-filtered-out.",
    },
    { name: "count", type: "number", description: "Total attachment entries on the message (downloaded + skipped)." },
    { name: "downloadedCount", type: "number", description: "Number of entries actually staged to v2 storage." },
    { name: "totalSize", type: "number", description: "Sum of sizeBytes across downloaded entries." },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
