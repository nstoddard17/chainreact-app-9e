import type { DocumentAnalysisMode, DocumentTextPayload } from "@/contracts/aiProcessing";
import type { FileRef } from "@/contracts/file";
import {
  classifyDocumentInput,
  parsedDocumentFromText,
  PARSED_INPUT_DOCUMENT_NAME,
  TEXT_INPUT_DOCUMENT_NAME,
  TEXT_INPUT_MIME_TYPE,
} from "@/core/documents/documentInput";
import { toDocumentTextPayload, type ParsedDocument } from "@/core/documents/parsedDocument";
import { PageRangeError } from "@/core/documents/pageRange";
import {
  applyTextBudget,
  DEFAULT_MAX_INPUT_CHARS,
  overflowBehaviorForMode,
} from "@/core/documents/textBudget";
import { fetchFileBytes, UnsupportedProviderFetchError } from "@/core/files/fetchFileBytes";
import { createWorkflowFilesStorageAdapter } from "@/services/files/createWorkflowFilesStorageAdapter";
import {
  DocumentParsingError,
  UnsupportedDocumentTypeError,
} from "@/services/documents/parsing/errors";
import type {
  DocumentFormat,
  ParseDocumentInput,
} from "@/services/documents/parsing/parseDocument";
import { DocumentInputError } from "./analysisErrors";
import { getAiProcessorConfig } from "./config";

/**
 * Document resolution for `ai:analyze_document` (AI-PROVIDER-5 CS-5).
 *
 * Turns whatever the author wired into the "Document" field into the
 * `DocumentTextPayload` the processor sends, applying — in this order —
 * page range, the explicit page cap, and the text budget. Everything here
 * happens BEFORE any spend, so a document we cannot read never reaches the
 * credit gate.
 *
 * Failure posture: every stop is a typed throw with copy that tells the
 * author what to do next ("add the provider's download step first",
 * "narrow with Page range"). Nothing is silently truncated for the extract
 * modes — `overflowBehaviorForMode` rejects there, because a summary that
 * saw 80% of a document is still a summary while an extraction that saw
 * 80% of the rows is silently wrong.
 */

/**
 * The parser dispatch is loaded LAZILY (see `loadParsers`). Its libraries
 * (unpdf/pdfjs, exceljs, mammoth, papaparse) are heavy, server-only, and
 * needed by exactly one of the three input kinds — while this module sits in
 * the handler-registry import graph that every execution path (and every test
 * that touches the registry) loads eagerly. A static import would pull the
 * whole parser stack into all of them.
 */
type ParseDocumentFn = (input: ParseDocumentInput) => Promise<ParsedDocument>;
type DetectDocumentFormatFn = (input: {
  bytes: Uint8Array;
  mimeType?: string;
  fileName?: string;
}) => DocumentFormat;

async function loadParsers(): Promise<{
  parseDocument: ParseDocumentFn;
  detectDocumentFormat: DetectDocumentFormatFn;
}> {
  const mod = await import("@/services/documents/parsing/parseDocument");
  return {
    parseDocument: mod.parseDocument,
    detectDocumentFormat: mod.detectDocumentFormat,
  };
}

/** Cap on the model's reply size. Fixed phase 1; not author-tunable. */
export const MAX_OUTPUT_TOKENS = 8000;

export const MAX_PAGES_WARNING = "max_pages_applied";

export interface ResolveAnalysisDocumentInput {
  /** The resolved "Document" config value (FileRef | text | ParsedDocument). */
  readonly value: unknown;
  readonly mode: DocumentAnalysisMode;
  readonly pageRange?: string | undefined;
  readonly sheetName?: string | undefined;
  readonly maxPages?: number | undefined;
  /** Service-role adapter reason: "<provider>:<action> run=… node=…". */
  readonly storageReason: string;
}

export interface ResolvedAnalysisDocument {
  readonly payload: DocumentTextPayload;
  /** "pdf" | "docx" | "xlsx" | "csv" | "text" | "parsed". */
  readonly detectedType: string;
  readonly truncated: boolean;
  readonly pageRangeApplied: boolean;
  readonly segmentsAnalyzed: number;
  readonly warnings: readonly string[];
}

export interface ResolveAnalysisDocumentDeps {
  readonly fetchBytes?: typeof fetchFileBytes;
  readonly parse?: ParseDocumentFn;
  readonly detectFormat?: DetectDocumentFormatFn;
  readonly maxInputChars?: number;
}

/** The text ceiling from env, or the pure default when the processor is off. */
function resolveMaxInputChars(deps: ResolveAnalysisDocumentDeps): number {
  if (deps.maxInputChars !== undefined) return deps.maxInputChars;
  return getAiProcessorConfig()?.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
}

interface ParsedSource {
  readonly parsed: ParsedDocument;
  readonly name: string;
  readonly mimeType: string;
  readonly detectedType: string;
  readonly pageRangeApplied: boolean;
}

async function parseFromFileRef(
  input: ResolveAnalysisDocumentInput,
  fileRef: FileRef,
  deps: ResolveAnalysisDocumentDeps,
): Promise<ParsedSource> {
  if (fileRef.kind === "provider_url") {
    throw new DocumentInputError(
      "This file still lives on the other app. Add that app's download step before this one, then point this step at the downloaded file.",
    );
  }

  const storage =
    fileRef.kind === "v2_storage"
      ? createWorkflowFilesStorageAdapter({ reason: input.storageReason })
      : undefined;

  const fetched = await (deps.fetchBytes ?? fetchFileBytes)(fileRef, {
    ...(storage ? { storage } : {}),
  });

  const loaded =
    deps.detectFormat && deps.parse ? undefined : await loadParsers();
  const detect = deps.detectFormat ?? loaded!.detectDocumentFormat;
  let format: DocumentFormat;
  try {
    format = detect({
      bytes: fetched.bytes,
      mimeType: fetched.mimeType,
      fileName: fetched.name,
    });
  } catch (err) {
    if (err instanceof UnsupportedDocumentTypeError) {
      throw new DocumentInputError(err.message);
    }
    throw err;
  }

  const parsed = await (deps.parse ?? loaded!.parseDocument)({
    bytes: fetched.bytes,
    mimeType: fetched.mimeType,
    fileName: fetched.name,
    ...(input.pageRange ? { pageRange: input.pageRange } : {}),
    ...(input.sheetName ? { sheetName: input.sheetName } : {}),
  });

  return {
    parsed,
    name: fetched.name,
    mimeType: fetched.mimeType,
    detectedType: format,
    pageRangeApplied: Boolean(input.pageRange) && format === "pdf",
  };
}

/** Page range / sheet name only mean something for a real parsed file. */
function warnUnusableSelectors(
  input: ResolveAnalysisDocumentInput,
  kind: "text" | "parsed",
): string[] {
  const warnings: string[] = [];
  if (input.pageRange) warnings.push(`page_range_not_supported_for_${kind}`);
  if (input.sheetName) warnings.push(`sheet_name_not_supported_for_${kind}`);
  return warnings;
}

export async function resolveAnalysisDocument(
  input: ResolveAnalysisDocumentInput,
  deps: ResolveAnalysisDocumentDeps = {},
): Promise<ResolvedAnalysisDocument> {
  const classified = classifyDocumentInput(input.value);
  if (classified.kind === "unsupported") {
    throw new DocumentInputError(
      `This step needs a file from an earlier step or some text to analyze — ${classified.reason}.`,
    );
  }

  let source: ParsedSource;
  const extraWarnings: string[] = [];

  try {
    if (classified.kind === "file_ref") {
      source = await parseFromFileRef(input, classified.fileRef, deps);
    } else if (classified.kind === "text") {
      extraWarnings.push(...warnUnusableSelectors(input, "text"));
      source = {
        parsed: parsedDocumentFromText(classified.text),
        name: TEXT_INPUT_DOCUMENT_NAME,
        mimeType: TEXT_INPUT_MIME_TYPE,
        detectedType: "text",
        pageRangeApplied: false,
      };
    } else {
      extraWarnings.push(...warnUnusableSelectors(input, "parsed"));
      source = {
        parsed: classified.document,
        name: PARSED_INPUT_DOCUMENT_NAME,
        mimeType: TEXT_INPUT_MIME_TYPE,
        detectedType: "parsed",
        pageRangeApplied: false,
      };
    }
  } catch (err) {
    // Typed parser / page-range / fetch failures become author-facing config
    // errors. Anything else propagates untouched for the engine to classify.
    if (err instanceof DocumentParsingError || err instanceof PageRangeError) {
      throw new DocumentInputError(err.message);
    }
    if (err instanceof UnsupportedProviderFetchError) {
      throw new DocumentInputError(
        "This file still lives on the other app. Add that app's download step before this one, then point this step at the downloaded file.",
      );
    }
    throw err;
  }

  let parsed = source.parsed;
  let truncated = parsed.truncated;
  const warnings = [...parsed.warnings, ...extraWarnings];

  // Explicit page cap — applied AFTER the page range, and never silently:
  // the author asked for it, and the output says it happened.
  if (input.maxPages !== undefined && parsed.segments.length > input.maxPages) {
    parsed = {
      ...parsed,
      segments: parsed.segments.slice(0, input.maxPages),
      truncated: true,
      charCount: parsed.segments
        .slice(0, input.maxPages)
        .reduce((total, segment) => total + segment.text.length, 0),
    };
    truncated = true;
    warnings.push(MAX_PAGES_WARNING);
  }

  const maxChars = resolveMaxInputChars(deps);
  const budgeted = applyTextBudget(
    { ...parsed, warnings },
    { maxChars, onOverflow: overflowBehaviorForMode(input.mode) },
  );
  if (!budgeted.ok) {
    throw new DocumentInputError(
      "This document is too long to extract from in one step. Narrow it with Page range or Sheet name, or split the file.",
    );
  }

  return {
    payload: toDocumentTextPayload(budgeted.document, {
      name: source.name,
      mimeType: source.mimeType,
    }),
    detectedType: source.detectedType,
    truncated: truncated || budgeted.document.truncated,
    pageRangeApplied: source.pageRangeApplied,
    segmentsAnalyzed: budgeted.document.segments.length,
    warnings: budgeted.document.warnings,
  };
}
