import type {
  DocumentTextPayload,
  DocumentTextSegment,
} from "@/contracts/aiProcessing";

/**
 * Normalized text model every document parser produces and every
 * downstream AI-processing step consumes (AI-PROVIDER-PLAN-1 §4.6).
 *
 * Pure — no parser libraries here. The npm-dep parsers live in
 * `services/documents/parsing/` and normalize into this shape; budgeting
 * (`textBudget.ts`) and page-range math (`pageRange.ts`) operate on it
 * without knowing which format produced it.
 */

/** How the source document was naturally segmented. */
export type ParsedDocumentKind = "pages" | "sheets" | "rows" | "text";

export interface ParsedSegment {
  /** Provenance label: "Page 3", "Sheet: Payroll", "" when N/A. */
  readonly label: string;
  readonly text: string;
}

export interface ParsedDocument {
  readonly kind: ParsedDocumentKind;
  readonly segments: readonly ParsedSegment[];
  /**
   * Segment count of the FULL source before page-range selection or
   * caps (a 30-page PDF read with pageRange "1-3" has totalSegments 30
   * and segments.length 3).
   */
  readonly totalSegments: number;
  /** True when caps/budgeting dropped content (rows/segments/chars). */
  readonly truncated: boolean;
  /** Sum of segment text lengths — the budget unit. */
  readonly charCount: number;
  /** Machine-readable notices, e.g. "page_range_not_supported_for_docx". */
  readonly warnings: readonly string[];
}

export function countChars(segments: readonly ParsedSegment[]): number {
  let total = 0;
  for (const segment of segments) total += segment.text.length;
  return total;
}

/** Canonical constructor — keeps charCount consistent with segments. */
export function buildParsedDocument(input: {
  kind: ParsedDocumentKind;
  segments: readonly ParsedSegment[];
  totalSegments?: number;
  truncated?: boolean;
  warnings?: readonly string[];
}): ParsedDocument {
  return {
    kind: input.kind,
    segments: input.segments,
    totalSegments: input.totalSegments ?? input.segments.length,
    truncated: input.truncated ?? false,
    charCount: countChars(input.segments),
    warnings: input.warnings ?? [],
  };
}

/**
 * Project a ParsedDocument into the wire payload shape
 * (`contracts/aiProcessing.ts` DocumentTextPayload). Callers supply the
 * display name and mimeType from the FileRef — never a storage path.
 */
export function toDocumentTextPayload(
  parsed: ParsedDocument,
  file: { name: string; mimeType: string },
): DocumentTextPayload {
  const segments: DocumentTextSegment[] = parsed.segments.map((segment) => ({
    label: segment.label,
    text: segment.text,
  }));
  return {
    name: file.name,
    mimeType: file.mimeType,
    truncated: parsed.truncated,
    segments,
  };
}
