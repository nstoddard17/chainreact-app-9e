import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:get_attachment`.
 *
 * Mirrors `getAttachment.schema.ts`. Single-attachment-per-action
 * surface per Gmail 2.3 plan §13.2. Output is a P-S3 FileRef
 * (kind=v2_storage, provider="gmail") — the variable picker surfaces
 * `file` as a fileRef-typed output and downstream actions that
 * declare `consumesFileRef: true` can accept it.
 *
 * `producesFileRef: true` advertises this to the variable picker for
 * file-aware rendering (file icon, type chip).
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs match `getAttachment.ts:124-132` exactly.
 */
export const getAttachmentMeta: ActionMeta = {
  key: "gmail:get_attachment",
  provider: "gmail",
  type: "get_attachment",
  displayName: "Get Email Attachment",
  description:
    "Download a single Gmail attachment and stage it as a FileRef in v2 storage. The FileRef is consumable by any downstream action that accepts file inputs (e.g. drive/upload_file). Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "messageId",
      label: "Message id",
      description:
        "Gmail message id carrying the attachment. Source from the new_attachment trigger payload (payload.id) or a search_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "attachmentId",
      label: "Attachment id",
      description:
        "Gmail attachment id from the same source. From new_attachment, use payload.attachments[i].attachmentId.",
      type: "text",
      required: true,
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description:
        "Staged FileRef (kind=v2_storage, provider='gmail'). Pass to downstream actions that accept file inputs.",
    },
    { name: "messageId", type: "string", description: "Echoes the input messageId." },
    { name: "attachmentId", type: "string", description: "Echoes the input attachmentId." },
    { name: "fileName", type: "string", description: "Attachment filename from the Gmail message metadata." },
    { name: "mimeType", type: "string", description: "Attachment mime type. Defaults to application/octet-stream when Gmail omits it." },
    { name: "sizeBytes", type: "number", description: "Reported size of the staged file in bytes." },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
