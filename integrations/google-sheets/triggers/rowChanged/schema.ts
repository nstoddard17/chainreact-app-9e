import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets `row_changed` trigger
 * (Sheets 2.3 Commit 2).
 *
 * Slice 5 baseline: only `spreadsheetId` + `sheetName` (+ optional
 * `headerRow`) were required; the pull function emitted
 * `changeKind: "added"` events keyed off the `lastRowCount`
 * count-delta fast path. Sheets 2.3 extends the trigger to support
 * `updated` and `removed` change kinds via a bounded per-row hash
 * snapshot, plus an optional `keyColumn` for stable identity across
 * mid-sheet inserts/deletes.
 *
 * Strict mode rejects unknown fields:
 *   - V1 polling chrome (`hasHeaders`, `skipEmptyRows`,
 *     `requiredColumns`, `googleSheetsRowSnapshot`,
 *     `googleSheetsWorksheetSnapshot`) — V1 polling-poller field
 *     names from `lib/triggers/pollers/google-sheets.ts`.
 *   - Builder UI shortcuts that don't belong in the runtime config.
 *
 * Backwards compatibility:
 *   - `changeKinds` defaults to `["added"]` — existing Slice 5
 *     triggers without an explicit `changeKinds` field stay on the
 *     added-only count-delta fast path.
 *   - `snapshotRowLimit` defaults to 1000 — only used when
 *     `changeKinds` includes "updated" or "removed".
 *   - `keyColumn` defaults to `null` (positional mode) — matches V1
 *     + Microsoft Excel `updated_row` accepted-shift limitation.
 *
 * Hard caps:
 *   - `snapshotRowLimit`: min 100, max 10,000. Above the max
 *     requires a code change — no schema escape hatch. Bounded
 *     storage cost is a load-bearing decision (audit R-3).
 *   - `changeKinds`: nonempty, deduplicated (one entry per kind).
 *
 * `keyColumn` precondition: `headerRow: true`. The column lookup
 * needs a header row to resolve the column index. Schema `.refine`
 * rejects the combination at parse time.
 */

export const SNAPSHOT_ROW_LIMIT_MIN = 100;
export const SNAPSHOT_ROW_LIMIT_DEFAULT = 1000;
export const SNAPSHOT_ROW_LIMIT_MAX = 10000;

export const ChangeKindSchema = z.enum(["added", "updated", "removed"]);
export type ChangeKind = z.infer<typeof ChangeKindSchema>;

/**
 * Input config — what the workflow builder UI passes to the trigger.
 *
 * The activation hook reads this from `node.config` and seeds the
 * runtime state (`type`, `channelId`, `resourceId`, `lastRowCount`,
 * `snapshot`, `expiresAt`, etc.) on top of it. The full persisted
 * shape in `trigger_resources.config` is `RowChangedInputConfig` +
 * those activation-set fields.
 */
export const RowChangedInputConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    sheetName: z.string().min(1, "sheetName is required."),
    headerRow: z.boolean().default(false),
    changeKinds: z
      .array(ChangeKindSchema)
      .min(1, "changeKinds must contain at least one entry.")
      .default(["added"])
      .refine(
        (kinds) => new Set(kinds).size === kinds.length,
        "changeKinds may not contain duplicates.",
      ),
    snapshotRowLimit: z
      .number()
      .int()
      .min(
        SNAPSHOT_ROW_LIMIT_MIN,
        `snapshotRowLimit must be ≥ ${SNAPSHOT_ROW_LIMIT_MIN}.`,
      )
      .max(
        SNAPSHOT_ROW_LIMIT_MAX,
        `snapshotRowLimit must be ≤ ${SNAPSHOT_ROW_LIMIT_MAX}.`,
      )
      .default(SNAPSHOT_ROW_LIMIT_DEFAULT),
    keyColumn: z.string().min(1).nullable().default(null),
  })
  .strict()
  .refine(
    (c) => c.keyColumn === null || c.headerRow === true,
    {
      message: "keyColumn requires headerRow: true.",
      path: ["keyColumn"],
    },
  );

export type RowChangedInputConfig = z.infer<typeof RowChangedInputConfigSchema>;

/**
 * Returns true iff the parsed input requires per-row snapshot
 * tracking. Workflows with `changeKinds = ["added"]` (the Slice 5
 * default) stay on the count-delta fast path; only workflows that
 * opt into `updated` or `removed` need the snapshot.
 */
export function requiresExtendedSnapshot(
  config: RowChangedInputConfig,
): boolean {
  return config.changeKinds.some(
    (k) => k === "updated" || k === "removed",
  );
}
