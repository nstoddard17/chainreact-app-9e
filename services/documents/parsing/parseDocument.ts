import type { ParsedDocument } from "@/core/documents/parsedDocument";
import { parsePageRange } from "@/core/documents/pageRange";
import {
  DocumentTooLargeError,
  UnsupportedDocumentTypeError,
} from "./errors";
import { parseCsv } from "./parseCsv";
import { parseDocx } from "./parseDocx";
import { parsePdf } from "./parsePdf";
import { parseText } from "./parseText";
import { parseXlsx } from "./parseXlsx";

/**
 * Document parser dispatch (AI-PROVIDER-PLAN-1 §4.6).
 *
 * Detection order: mimeType → file extension → magic bytes. Every
 * miss is a typed `UnsupportedDocumentTypeError` — never a silent
 * fallback to a guessed parser. ZIP magic alone (`PK\x03\x04`) is
 * deliberately NOT enough to pick DOCX vs XLSX: distinguishing OOXML
 * flavors requires reading the archive's content types, and guessing
 * wrong would produce garbage extractions.
 *
 * Server-only: parser libraries must never reach a client bundle
 * (enforced by tests/structure/documents-parsing-server-only.test.ts).
 */

/** Hard pre-parse cap — below the 25 MB advisory FileRef guidance. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export type DocumentFormat = "pdf" | "docx" | "xlsx" | "csv" | "text";

export const PAGE_RANGE_UNSUPPORTED_WARNING_PREFIX =
  "page_range_not_supported_for_";
export const SHEET_NAME_UNSUPPORTED_WARNING = "sheet_name_ignored_for_non_xlsx";

const MIME_TO_FORMAT: Record<string, DocumentFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/plain": "text",
  "text/markdown": "text",
};

/** Mime values that carry no type information and defer to ext/magic. */
const NONCOMMITTAL_MIMES = new Set(["", "application/octet-stream"]);

const EXTENSION_TO_FORMAT: Record<string, DocumentFormat> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  csv: "csv",
  txt: "text",
  md: "text",
};

function formatFromMagicBytes(bytes: Uint8Array): DocumentFormat | "zip" | null {
  // %PDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "pdf";
  }
  // PK\x03\x04 — some OOXML zip; ambiguous between docx/xlsx.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "zip";
  }
  return null;
}

/**
 * Resolve the parser format for a document. Exported for tests.
 * Throws `UnsupportedDocumentTypeError` when no unambiguous format is
 * detectable.
 */
export function detectDocumentFormat(input: {
  bytes: Uint8Array;
  mimeType?: string;
  fileName?: string;
}): DocumentFormat {
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (!NONCOMMITTAL_MIMES.has(mime)) {
    const fromMime = MIME_TO_FORMAT[mime];
    if (fromMime) return fromMime;
    // Committal-but-unknown mime falls through to extension/magic — a
    // provider may report a wrong-but-specific mime for a well-named file.
  }

  const fileName = input.fileName ?? "";
  const dot = fileName.lastIndexOf(".");
  if (dot > 0 && dot < fileName.length - 1) {
    const ext = fileName.slice(dot + 1).toLowerCase();
    const fromExt = EXTENSION_TO_FORMAT[ext];
    if (fromExt) return fromExt;
  }

  const fromMagic = formatFromMagicBytes(input.bytes);
  if (fromMagic === "pdf") return "pdf";
  if (fromMagic === "zip") {
    throw new UnsupportedDocumentTypeError(
      "ZIP-based file without a .docx/.xlsx extension or mime type",
    );
  }

  throw new UnsupportedDocumentTypeError(
    mime.length > 0 ? `mime "${mime}"` : "unknown mime and extension",
  );
}

export interface ParseDocumentInput {
  bytes: Uint8Array;
  /** From the FileRef; may be missing/octet-stream. */
  mimeType?: string;
  /** Display file name from the FileRef; used for extension fallback. */
  fileName?: string;
  /** "1-5,8" — applied to PDFs only; warned + ignored elsewhere. */
  pageRange?: string;
  /** XLSX only; warned + ignored elsewhere. */
  sheetName?: string;
}

/**
 * Parse document bytes into the normalized `ParsedDocument`.
 *
 * Throws (all typed, see ./errors):
 *   - DocumentTooLargeError (pre-parse byte cap)
 *   - UnsupportedDocumentTypeError (no unambiguous format)
 *   - PageRangeError (invalid pageRange expression — a config error)
 *   - DocumentParseError / DocumentHasNoTextError (per-format)
 */
export async function parseDocument(
  input: ParseDocumentInput,
): Promise<ParsedDocument> {
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new DocumentTooLargeError(input.bytes.byteLength, MAX_DOCUMENT_BYTES);
  }

  const format = detectDocumentFormat(input);

  // Parse the page range up front so an invalid expression fails the
  // same way regardless of document format.
  const requestedPages =
    input.pageRange !== undefined && input.pageRange.trim().length > 0
      ? parsePageRange(input.pageRange)
      : undefined;

  const extraWarnings: string[] = [];
  if (requestedPages !== undefined && format !== "pdf") {
    extraWarnings.push(`${PAGE_RANGE_UNSUPPORTED_WARNING_PREFIX}${format}`);
  }
  if (input.sheetName !== undefined && format !== "xlsx") {
    extraWarnings.push(SHEET_NAME_UNSUPPORTED_WARNING);
  }

  let parsed: ParsedDocument;
  switch (format) {
    case "pdf":
      parsed = await parsePdf(input.bytes, { pages: requestedPages });
      break;
    case "docx":
      parsed = await parseDocx(input.bytes);
      break;
    case "xlsx":
      parsed = await parseXlsx(input.bytes, { sheetName: input.sheetName });
      break;
    case "csv":
      parsed = parseCsv(input.bytes);
      break;
    case "text":
      parsed = parseText(input.bytes);
      break;
  }

  if (extraWarnings.length === 0) return parsed;
  return {
    ...parsed,
    warnings: [...parsed.warnings, ...extraWarnings],
  };
}
