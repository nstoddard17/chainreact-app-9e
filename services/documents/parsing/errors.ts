/**
 * Typed errors for the document parsing layer (AI-PROVIDER-PLAN-1 §4.6/§7).
 *
 * Rules:
 *   - Messages are user-safe: they may name the FORMAT, the FILE-provided
 *     display name, or a user-entered value (sheet name) — they must
 *     NEVER echo document content.
 *   - No silent fallback: dispatch failures throw
 *     `UnsupportedDocumentTypeError`; parse failures throw
 *     `DocumentParseError`; extractable-but-empty documents throw
 *     `DocumentHasNoTextError`; the pre-parse byte cap throws
 *     `DocumentTooLargeError`.
 *   - Later slices map these to engine-visible HANDLER_FAILED messages;
 *     the `code` values are stable machine identifiers.
 */

export type DocumentParsingErrorCode =
  | "unsupported_document_type"
  | "document_parse_failed"
  | "document_has_no_text"
  | "document_too_large";

export class DocumentParsingError extends Error {
  readonly code: DocumentParsingErrorCode;

  constructor(code: DocumentParsingErrorCode, message: string) {
    super(message);
    this.name = "DocumentParsingError";
    this.code = code;
  }
}

export class UnsupportedDocumentTypeError extends DocumentParsingError {
  constructor(detail: string) {
    super(
      "unsupported_document_type",
      `Unsupported file type (${detail}). Supported: PDF, DOCX, XLSX, CSV, TXT.`,
    );
    this.name = "UnsupportedDocumentTypeError";
  }
}

export class DocumentParseError extends DocumentParsingError {
  constructor(message: string) {
    super("document_parse_failed", message);
    this.name = "DocumentParseError";
  }
}

export class DocumentHasNoTextError extends DocumentParsingError {
  constructor() {
    super(
      "document_has_no_text",
      "No readable text found — scanned or image-only documents aren't supported yet.",
    );
    this.name = "DocumentHasNoTextError";
  }
}

export class DocumentTooLargeError extends DocumentParsingError {
  readonly sizeBytes: number;
  readonly maxBytes: number;

  constructor(sizeBytes: number, maxBytes: number) {
    super(
      "document_too_large",
      `The file is too large to analyze (${Math.ceil(sizeBytes / (1024 * 1024))} MB; limit ${Math.floor(maxBytes / (1024 * 1024))} MB).`,
    );
    this.name = "DocumentTooLargeError";
    this.sizeBytes = sizeBytes;
    this.maxBytes = maxBytes;
  }
}
