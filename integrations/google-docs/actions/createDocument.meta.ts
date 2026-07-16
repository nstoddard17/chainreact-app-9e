import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-docs:create_document` —
 * Slice 3.GDOCS-4.
 *
 * Mirrors `createDocument.schema.ts` (3 fields, no field-name
 * normalization per GDOCS-1 §8.1):
 *   - `title`    REQUIRED — document title.
 *   - `content`  OPTIONAL — initial body content. Empty content skips
 *     the secondary `documents.batchUpdate` call (handler does this
 *     transparently).
 *   - `folderId` OPTIONAL — Drive folder to place the doc in. Wires the
 *     cross-product `google-drive:folders` resolver (Slice 3.GDOCS-3).
 *     When unset the doc lands in My Drive root.
 *
 * **Deferred:** V1's `contentSource: "file_upload"` mode (D-GD1). V2 v1
 * ships manual content only. Workflow authors needing to seed a Doc
 * from a file should chain Drive `upload_file` → `create_document` is
 * not the right primitive today; that gap is tracked as a future arc.
 *
 * Risk: medium. Creates a new external Google Drive resource per call;
 * re-runs make duplicates (Drive does not deduplicate by title). Not
 * destructive (the new doc is fresh content; nothing is overwritten).
 * No confirmation required.
 *
 * Sensitive outputs (per GDOCS-1 §5 + Slice 3.GDOCS-4 instruction):
 *   - `title` — echoes the caller-supplied input but flagged sensitive
 *     conservatively per the slice spec; document titles often carry
 *     project / customer identifiers.
 *   - `documentUrl` — links to a real Google Doc; while not access-
 *     bearing on its own (recipient still needs Google sign-in + share
 *     permission), the URL combined with `share_document` upstream
 *     could leak a private doc id.
 *   - `documentId` / `folderId` / `createdAt` — opaque Google ids /
 *     timestamps; not sensitive on their own.
 */
export const googleDocsCreateDocumentMeta: ActionMeta = {
  key: "google-docs:create_document",
  provider: "google-docs",
  type: "create_document",
  displayName: "Create Document",
  description:
    "Create a new Google Doc with an optional initial body. Optionally place the doc in a Google Drive folder. Each call creates a fresh document — re-runs make duplicates (Drive does not deduplicate by title). File-upload content mode is deferred; pass content as text or compose with Update Document downstream for richer flows.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "title",
      label: "Title",
      description:
        "Document title shown in Google Drive and the Doc's tab. Drive does not enforce uniqueness — re-runs create new docs with the same name.",
      type: "text",
      required: true,
      placeholder: "Q4 Planning Doc",
    },
    {
      name: "content",
      label: "Initial content",
      description:
        "Optional starting text for the document. Insert values from earlier steps with {{nodeId.field}}. Leave empty to create a blank doc.",
      type: "textarea",
      required: false,
      placeholder: "Pasted body text…",
    },
    {
      name: "folderId",
      label: "Folder",
      description:
        "Optional. Place the new doc in a Drive folder. Resolver lists folders the connected account can write to. Leave unset to land in My Drive root.",
      type: "combobox",
      optionsSource: "google-drive:folders",
      required: false,
      placeholder: "Search folders…",
    },
  ],
  outputs: [
    {
      name: "documentId",
      type: "string",
      description:
        "Google-assigned document id (`1aBc…`). Wire to downstream Update / Share / Get / Export actions.",
    },
    {
      name: "documentUrl",
      type: "string",
      description:
        "Canonical edit URL (`https://docs.google.com/document/d/<id>/edit`). Not access-bearing — recipients still need Google sign-in + share permission. Send via Gmail / Slack to share.",
      sensitive: true,
    },
    {
      name: "title",
      type: "string",
      description:
        "Echoed document title (== input.title when Google accepted it).",
      sensitive: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "ISO 8601 timestamp the document was created at.",
    },
    {
      name: "folderId",
      type: "string",
      description:
        "Echoed folder id when placement was requested, `null` otherwise.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new Google Doc in the connected Google account. Each call makes a fresh document — re-runs create duplicates.",
};
