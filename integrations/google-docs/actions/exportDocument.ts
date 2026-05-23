import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { documentsGet } from "@/integrations/_shared/google/api/docs/documentsGet";
import { filesExport } from "@/integrations/google-drive/api/filesExport";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import {
  ExportDocumentConfigSchema,
  type ExportDocumentConfig,
  type ExportDocumentFormat,
} from "./exportDocument.schema";

/**
 * Google Docs `export_document` action handler — Slice 3.GDOCS-2.
 *
 * V2-native FileRef-output. Per GDOCS-1 §3.1:
 *   - Drive destination ONLY. V1's `email`, `webhook`, and
 *     `workflow` (base64) destinations are REJECTED — the schema
 *     drops the `destination` field; workflow authors chain
 *     downstream actions (`gmail:send_email` with attachment,
 *     `native:http_request`, etc.).
 *   - Output is a FileRef(kind=v2_storage), staged via
 *     `stageFileToStorage`. No inline bytes, no base64, no
 *     `data` field (CLAUDE.md rule #1).
 *
 * Steps:
 *   1. `documents.get` — fetch the doc title (for fallback `fileName`).
 *      Skipped when `fileName` is supplied.
 *   2. Drive `files.export?mimeType=<target>` — Drive performs the
 *      format conversion server-side.
 *   3. `stageFileToStorage` → stages bytes to the V2
 *      `workflow-files` Supabase bucket, returns a v2_storage FileRef.
 *
 * Each Google round-trip wraps in `refreshAndRetry` (Q3).
 *
 * Output:
 *   - `file` — `FileRef(kind=v2_storage, provider="google-docs")`.
 *   - `fileName`, `fileSize`, `format`, `mimeType` — flat fields for
 *     workflow author ergonomics.
 *   - `fileId` — Drive doesn't return a NEW file id for exports (the
 *     exported bytes don't get a Drive entry); the output's `fileId`
 *     therefore echoes the SOURCE documentId. Workflow authors who
 *     want the bytes saved as a NEW Drive file chain a downstream
 *     `google-drive:upload_file` (when that action ships with a
 *     FileRef-input variant).
 *
 * Size: Drive's documented 10 MB cap on `files.export` applies.
 * Documents that exceed it surface as a Drive 403 with a clear
 * "exceeded export limit" message; V2 propagates the error verbatim
 * (no client-side pre-check possible — `documents.get` doesn't
 * expose an export-size estimate).
 */

const FORMAT_TO_MIME: Record<ExportDocumentFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  html: "text/html",
  rtf: "application/rtf",
  epub: "application/epub+zip",
  odt: "application/vnd.oasis.opendocument.text",
};

const FORMAT_TO_EXTENSION: Record<ExportDocumentFormat, string> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  html: "html",
  rtf: "rtf",
  epub: "epub",
  odt: "odt",
};

export const exportDocument: ActionHandler = async (input) => {
  const config: ExportDocumentConfig = ExportDocumentConfigSchema.parse(
    input.config,
  );

  const accountId =
    input.triggerEvent.provider === "google-docs"
      ? input.triggerEvent.accountId
      : null;

  // 1) Resolve the file name. When the workflow author supplied one,
  //    use it verbatim (the V1 default). Otherwise fetch the doc to
  //    use the document title.
  const targetMimeType = FORMAT_TO_MIME[config.exportFormat];
  const extension = FORMAT_TO_EXTENSION[config.exportFormat];

  let baseName: string;
  if (config.fileName !== undefined && config.fileName.length > 0) {
    baseName = config.fileName;
  } else {
    const document = await refreshAndRetry({
      userId: input.userId,
      provider: "google-docs",
      accountId,
      apiCall: (accessToken) =>
        documentsGet({ accessToken, documentId: config.documentId }),
    });
    baseName =
      typeof document.title === "string" && document.title.length > 0
        ? document.title
        : `document-${config.documentId}`;
  }
  // V1 appends `.${format}` to the configured base name regardless of
  // whether the name already ends with the extension. V2 mirrors —
  // collisions like "Report.pdf.pdf" stay as a V1-parity feature; if
  // workflow authors want different naming they supply `fileName`
  // explicitly without the extension.
  const fullFileName = `${baseName}.${extension}`;

  // 2) Export via Drive.
  const exportResult = await refreshAndRetry({
    userId: input.userId,
    provider: "google-docs",
    accountId,
    apiCall: (accessToken) =>
      filesExport({
        accessToken,
        fileId: config.documentId,
        mimeType: targetMimeType,
      }),
  });

  // 3) Stage bytes to V2 storage → FileRef(kind=v2_storage).
  const staged = await stageFileToStorage({
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    fileName: fullFileName,
    mimeType: exportResult.contentType,
    bytes: exportResult.bytes,
    sizeBytes: exportResult.bytes.byteLength,
    provider: "google-docs",
    metadata: {
      sourceDocumentId: config.documentId,
      exportFormat: config.exportFormat,
    },
  });

  return {
    output: {
      file: staged.ref,
      fileName: fullFileName,
      fileSize: exportResult.bytes.byteLength,
      format: config.exportFormat,
      mimeType: targetMimeType,
      fileId: config.documentId,
    },
  };
};
