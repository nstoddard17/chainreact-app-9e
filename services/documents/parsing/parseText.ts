import { buildParsedDocument, type ParsedDocument } from "@/core/documents/parsedDocument";
import { DocumentHasNoTextError } from "./errors";

/**
 * Plain-text parser (TXT / Markdown / email body bytes).
 *
 * `TextDecoder("utf-8")` strips a UTF-8 BOM by default (`ignoreBOM`
 * defaults to false) — the existing in-repo decode pattern
 * (integrations/motive importFuelPurchasesCsv).
 */
export function parseText(bytes: Uint8Array): ParsedDocument {
  const text = new TextDecoder("utf-8").decode(bytes);
  if (text.trim().length === 0) {
    throw new DocumentHasNoTextError();
  }
  return buildParsedDocument({
    kind: "text",
    segments: [{ label: "", text }],
  });
}
