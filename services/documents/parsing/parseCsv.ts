import Papa from "papaparse";

import { buildParsedDocument, type ParsedDocument } from "@/core/documents/parsedDocument";
import { DocumentHasNoTextError, DocumentParseError } from "./errors";
import { MAX_SCAN_COLUMNS, MAX_SCAN_ROWS, ROW_CAP_WARNING, COLUMN_CAP_WARNING, serializeRow } from "./tabular";

/**
 * CSV parser. papaparse handles quoting/embedded delimiters/newlines;
 * rows are serialized pipe-delimited (one line per row, header first)
 * — a compact, model-friendly rendering that survives commas in cells.
 *
 * Caps: MAX_SCAN_ROWS / MAX_SCAN_COLUMNS bound memory before the char
 * budget even applies; hitting a cap sets `truncated` plus a warning —
 * never silent.
 */
export function parseCsv(bytes: Uint8Array): ParsedDocument {
  const text = new TextDecoder("utf-8").decode(bytes);
  if (text.trim().length === 0) {
    throw new DocumentHasNoTextError();
  }

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });
  const fatal = result.errors.find((error) => error.type === "Delimiter");
  if (fatal) {
    throw new DocumentParseError("The file couldn't be read as CSV.");
  }

  const warnings: string[] = [];
  let truncated = false;

  const rows = result.data;
  const totalRows = rows.length;
  if (totalRows === 0) {
    throw new DocumentHasNoTextError();
  }

  const keptRows = rows.slice(0, MAX_SCAN_ROWS);
  if (keptRows.length < totalRows) {
    truncated = true;
    warnings.push(ROW_CAP_WARNING);
  }

  let columnsCapped = false;
  const lines = keptRows.map((row) => {
    if (row.length > MAX_SCAN_COLUMNS) columnsCapped = true;
    return serializeRow(row.slice(0, MAX_SCAN_COLUMNS));
  });
  if (columnsCapped) {
    truncated = true;
    warnings.push(COLUMN_CAP_WARNING);
  }

  return buildParsedDocument({
    kind: "rows",
    segments: [{ label: "", text: lines.join("\n") }],
    totalSegments: 1,
    truncated,
    warnings,
  });
}
