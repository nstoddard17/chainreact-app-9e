import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets `new_worksheet`
 * trigger (Sheets 2.3 Commit 4).
 *
 * Fires when a new worksheet (tab) appears in the configured
 * spreadsheet. Reuses the same Drive `files.watch` webhook
 * transport that `row_changed` uses — Sheets has no native push
 * notifications, so we ride Drive's per-file watch (the watch
 * fires on tab additions because they bump the spreadsheet's
 * `modifiedTime`). Each trigger node gets its own channel,
 * scoped to a `spreadsheetId`.
 *
 * No bounded-window concept here — `spreadsheets.get` with
 * `includeGridData=false` returns the FULL worksheet list cheaply
 * (one HTTP call regardless of sheet count). The snapshot is
 * `WorksheetListSnapshot { names: string[], updatedAt }` per
 * `_shared/snapshot.ts`. Sheets workbooks max out at a few hundred
 * tabs in practice, so unbounded name lists are fine.
 *
 * Rename behavior: Google's metadata presents a rename as
 * `{ remove old name, add new name }`. The diff fires ONE event for
 * the new name (matches V1 polling implementation +
 * Microsoft Excel `new_worksheet` behavior). Documented in
 * `pull.ts`.
 *
 * Strict mode rejects unknown fields and V1 polling chrome.
 */
export const NewWorksheetInputConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
  })
  .strict();

export type NewWorksheetInputConfig = z.infer<
  typeof NewWorksheetInputConfigSchema
>;
