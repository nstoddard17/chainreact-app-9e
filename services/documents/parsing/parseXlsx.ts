import ExcelJS from "exceljs";

import { buildParsedDocument, type ParsedDocument, type ParsedSegment } from "@/core/documents/parsedDocument";
import { DocumentHasNoTextError, DocumentParseError } from "./errors";
import { MAX_SCAN_COLUMNS, MAX_SCAN_ROWS, ROW_CAP_WARNING, COLUMN_CAP_WARNING, serializeRow } from "./tabular";

/**
 * XLSX parser — exceljs (SheetJS `xlsx` deliberately rejected: npm
 * release line frozen with known CVEs; AI-PROVIDER-PLAN-1 §5).
 *
 * One segment per worksheet, labeled "Sheet: <name>"; rows rendered
 * pipe-delimited via the shared tabular serializer. `cell.text` is used
 * so formulas/rich text render as their display value, never as
 * formula objects. Legacy binary `.xls` is NOT supported (dispatch
 * rejects it).
 */
export async function parseXlsx(
  bytes: Uint8Array,
  options: { sheetName?: string } = {},
): Promise<ParsedDocument> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's declared Buffer type predates @types/node's generic
    // Buffer<ArrayBuffer>; the runtime value is a plain Node Buffer.
    await workbook.xlsx.load(
      Buffer.from(bytes) as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0],
    );
  } catch {
    throw new DocumentParseError("The file couldn't be read as an Excel workbook.");
  }

  let worksheets = workbook.worksheets;
  const totalSheets = worksheets.length;
  if (options.sheetName !== undefined) {
    const wanted = options.sheetName.trim().toLowerCase();
    worksheets = worksheets.filter(
      (sheet) => sheet.name.trim().toLowerCase() === wanted,
    );
    if (worksheets.length === 0) {
      throw new DocumentParseError(
        `Sheet "${options.sheetName}" was not found in the workbook.`,
      );
    }
  }

  const warnings: string[] = [];
  let truncated = false;
  let rowsCapped = false;
  let columnsCapped = false;

  const segments: ParsedSegment[] = [];
  for (const sheet of worksheets) {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_SCAN_ROWS) {
        rowsCapped = true;
        return;
      }
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > MAX_SCAN_COLUMNS) {
          columnsCapped = true;
          return;
        }
        cells.push(cell.text ?? "");
      });
      lines.push(serializeRow(cells));
    });
    if (lines.length > 0) {
      segments.push({ label: `Sheet: ${sheet.name}`, text: lines.join("\n") });
    }
  }

  if (rowsCapped) {
    truncated = true;
    warnings.push(ROW_CAP_WARNING);
  }
  if (columnsCapped) {
    truncated = true;
    warnings.push(COLUMN_CAP_WARNING);
  }

  if (segments.length === 0 || segments.every((s) => s.text.trim().length === 0)) {
    throw new DocumentHasNoTextError();
  }

  return buildParsedDocument({
    kind: "sheets",
    segments,
    totalSegments: totalSheets,
    truncated,
    warnings,
  });
}
