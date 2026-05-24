import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-docs:export_document` —
 * Slice 3.GDOCS-4.
 *
 * Mirrors `exportDocument.schema.ts` (3 fields). FileRef-producing
 * action: exports the document via Drive's `files.export`, stages the
 * bytes to V2 storage via `stageFileToStorage`, returns a
 * `FileRef(kind=v2_storage, provider="google-docs")` as the `file`
 * output. Downstream actions that declare `consumesFileRef: true` can
 * accept it (e.g. `microsoft-outlook:send_email` attachments).
 *
 * **V1 destinations rejected (D-GD3):** V1's `destination: "drive" |
 * "email" | "webhook" | "workflow"` field is dropped entirely. V2
 * composes through workflow primitives:
 *   - Save to Drive       → chain `google-drive:upload_file` consuming
 *                           the FileRef.
 *   - Send via email      → chain `gmail:send_email` /
 *                           `microsoft-outlook:send_email` with the
 *                           FileRef in `attachments`.
 *   - POST to webhook     → chain `native:http_request` with the
 *                           FileRef multipart-attached.
 *   - Base64 in workflow  → not supported; the FileRef is the canonical
 *                           shape.
 *
 * **Drive export 10MB cap:** Drive's `files.export` rejects documents
 * whose exported representation exceeds 10MB with HTTP 403 +
 * `exportSizeLimitExceeded`. The runtime handler surfaces this as a
 * permanent failure; the description warns workflow authors.
 *
 * Risk: low. Read-only / file-generation; no mutation of the source
 * document. The exported file is staged in V2 storage with the
 * connected user's scope — same security model as Gmail / Drive
 * attachment downloads. Not destructive; no confirmation.
 *
 * Sensitive outputs (per slice spec):
 *   - `fileName` — flagged sensitive; document filenames often carry
 *     project / customer identifiers.
 *   - `file` (FileRef) — the staged file's bytes ARE the document body.
 *     FileRef metadata does NOT carry tokens / secrets; the canonical
 *     `kind=v2_storage` shape exposes only `path` + `mimeType` +
 *     `sizeBytes`. Downstream consumers fetch the bytes via V2 storage,
 *     not via a signed URL.
 *   - `fileSize` / `format` / `mimeType` / `fileId` — non-sensitive
 *     structural / opaque ids.
 *
 * Slice spec deliberately omits a `folderId` / `driveFolder` runtime
 * field — V2 does NOT support a Drive destination here. V1's
 * destination=drive mode was rejected in favor of explicit
 * `google-drive:upload_file` chaining (D-GD3). The meta correctly does
 * NOT declare a folder field for this action.
 */
export const googleDocsExportDocumentMeta: ActionMeta = {
  key: "google-docs:export_document",
  provider: "google-docs",
  type: "export_document",
  displayName: "Export Document",
  description:
    "Export a Google Doc to a file format (PDF / DOCX / TXT / HTML / RTF / EPUB / ODT) via Drive's `files.export`, then stage the bytes as a FileRef in V2 storage. Downstream actions consume the FileRef (e.g. attach to Gmail / Outlook send, upload to Drive folder, POST to webhook). **Drive caps exported representations at 10MB — larger docs surface as a permanent provider error (`exportSizeLimitExceeded`).** V1's destination field (drive / email / webhook / workflow) is intentionally dropped — compose via downstream actions instead.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "documentId",
      label: "Document",
      description:
        "Google Doc to export. Picker lists docs in the connected account, sorted by most recently modified.",
      type: "combobox",
      optionsSource: "google-docs:documents",
      required: true,
      placeholder: "Search documents…",
    },
    {
      name: "exportFormat",
      label: "Export format",
      description:
        "Target file format. Drive supports 7 export mime types for Google Docs; pick based on the downstream consumer (PDF for archival / send-as-attachment, DOCX for Word-editing handoff, TXT for plain-text downstream parsing, etc.).",
      type: "select",
      required: true,
      options: [
        { value: "pdf", label: "PDF" },
        { value: "docx", label: "Word (DOCX)" },
        { value: "txt", label: "Plain text (TXT)" },
        { value: "html", label: "HTML" },
        { value: "rtf", label: "Rich text (RTF)" },
        { value: "epub", label: "EPUB" },
        { value: "odt", label: "OpenDocument (ODT)" },
      ],
    },
    {
      name: "fileName",
      label: "File name",
      description:
        "Optional. Output file name (sans extension — the handler appends one based on `exportFormat`). When omitted, the handler defaults to the document's title.",
      type: "text",
      required: false,
      placeholder: "Q4-Planning",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description:
        "Staged FileRef (`kind: v2_storage`, `provider: 'google-docs'`). Pass to any downstream action that accepts file inputs (e.g. Gmail / Outlook send_email attachments, Drive upload_file). FileRef metadata carries only path / mimeType / sizeBytes — no tokens, no signed URLs.",
    },
    {
      name: "fileName",
      type: "string",
      description:
        "Final file name including the format-appropriate extension (e.g. `Q4-Planning.pdf`). When `fileName` input was omitted, this echoes the document title with extension appended.",
      sensitive: true,
    },
    {
      name: "fileSize",
      type: "number",
      description:
        "Size of the staged file in bytes. Useful for downstream attachment-size gating (e.g. Gmail's 25MB attachment cap).",
    },
    {
      name: "format",
      type: "string",
      description: "Echoed export format (== input.exportFormat).",
    },
    {
      name: "mimeType",
      type: "string",
      description:
        "Target export mime type (e.g. `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`).",
    },
    {
      name: "fileId",
      type: "string",
      description: "Source document id (== input.documentId).",
    },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
