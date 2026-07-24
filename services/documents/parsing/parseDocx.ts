import mammoth from "mammoth";

import { buildParsedDocument, type ParsedDocument } from "@/core/documents/parsedDocument";
import { DocumentHasNoTextError, DocumentParseError } from "./errors";

/**
 * DOCX parser — `mammoth.extractRawText` (text only; layout/styling
 * deliberately dropped). DOCX has no page concept at parse time, so the
 * output is a single "text" segment; page-range requests are warned
 * about at the dispatch layer.
 */
export async function parseDocx(bytes: Uint8Array): Promise<ParsedDocument> {
  let value: string;
  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    value = result.value;
  } catch {
    // mammoth error messages can embed zip internals; keep it generic.
    throw new DocumentParseError("The file couldn't be read as a Word document.");
  }
  if (value.trim().length === 0) {
    throw new DocumentHasNoTextError();
  }
  return buildParsedDocument({
    kind: "text",
    segments: [{ label: "", text: value }],
  });
}
