import { extractText, getDocumentProxy } from "unpdf";

import { buildParsedDocument, type ParsedDocument, type ParsedSegment } from "@/core/documents/parsedDocument";
import { selectPages } from "@/core/documents/pageRange";
import { DocumentHasNoTextError, DocumentParseError } from "./errors";

export const PAGES_OUT_OF_RANGE_WARNING = "page_range_out_of_bounds_pages_ignored";

/**
 * Text-based PDF parser — unpdf (serverless-first pdfjs wrapper; no
 * native deps, no worker plumbing). One segment per page, labeled
 * "Page <n>".
 *
 * Error mapping (verified against pdfjs error names):
 *   - `PasswordException` → DocumentParseError "password-protected"
 *     (refines the plan's encrypted-PDF row: encryption fails at OPEN,
 *     not at text extraction, so it cannot honestly share the no-text
 *     path).
 *   - `InvalidPDFException` / anything else at open → DocumentParseError.
 *   - Opens fine but zero extractable characters (scanned/image-only)
 *     → DocumentHasNoTextError.
 *
 * OCR is explicitly out of scope (deferred per plan).
 */
export async function parsePdf(
  bytes: Uint8Array,
  options: { pages?: readonly number[] } = {},
): Promise<ParsedDocument> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (error) {
    if ((error as { name?: string })?.name === "PasswordException") {
      throw new DocumentParseError(
        "The PDF is password-protected and can't be read.",
      );
    }
    throw new DocumentParseError("The file couldn't be read as a PDF.");
  }

  let totalPages: number;
  let pageTexts: string[];
  try {
    const result = await extractText(pdf, { mergePages: false });
    totalPages = result.totalPages;
    pageTexts = result.text;
  } catch {
    throw new DocumentParseError("The PDF's text couldn't be extracted.");
  }

  const warnings: string[] = [];
  let keptPageNumbers: number[];
  if (options.pages && options.pages.length > 0) {
    const { selected, outOfRange } = selectPages(options.pages, totalPages);
    if (outOfRange.length > 0) {
      warnings.push(PAGES_OUT_OF_RANGE_WARNING);
    }
    if (selected.length === 0) {
      throw new DocumentParseError(
        `The page range selects no pages — the PDF has ${totalPages} page(s).`,
      );
    }
    keptPageNumbers = selected;
  } else {
    keptPageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const segments: ParsedSegment[] = keptPageNumbers.map((pageNumber) => ({
    label: `Page ${pageNumber}`,
    text: pageTexts[pageNumber - 1] ?? "",
  }));

  if (segments.every((segment) => segment.text.trim().length === 0)) {
    throw new DocumentHasNoTextError();
  }

  return buildParsedDocument({
    kind: "pages",
    segments,
    totalSegments: totalPages,
    warnings,
  });
}
