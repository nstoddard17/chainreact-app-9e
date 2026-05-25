import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets get_sheet_metadata action.
 *
 * Read-only. Returns spreadsheet-level + per-sheet metadata (titles,
 * sheetIds, row/column counts). The trigger's activate hook also reads
 * this for its initial snapshot, but as a workflow action it's the
 * "give me the structure" primitive — branching on sheet count, finding
 * a sheetId by title, etc.
 *
 * Strict mode rejects unknown fields. `includeGridData` is intentionally
 * NOT exposed — full cell payloads belong in `read_rows`, not metadata.
 */
export const GetSheetMetadataConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
  })
  .strict();

export type GetSheetMetadataConfig = z.infer<typeof GetSheetMetadataConfigSchema>;
