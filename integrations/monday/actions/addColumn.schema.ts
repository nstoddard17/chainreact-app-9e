import { z } from "zod";

/**
 * Resolved-config schema for the Monday `add_column` action —
 * Slice 3.MONDAY-4.
 *
 * V1 field names preserved:
 *   - `boardId` (required)
 *   - `columnTitle` (required)
 *   - `columnType` (required) — Monday's ColumnType (text / status /
 *     dropdown / numbers / date / people / …). Validated as a non-empty
 *     string, NOT a restrictive enum: Monday has ~30 column types and
 *     ships new ones regularly; pinning an enum would reject valid
 *     types. Monday validates the actual enum server-side.
 *   - `defaults` (optional) — Monday's `JSON` scalar carrying type-
 *     specific config (status labels, dropdown options, rating scale,
 *     …). Accepts a JSON string or a structured object; the handler
 *     serializes to the wire string. The friendly per-type builders
 *     (statusLabels → labels map, etc.) are deferred to the column-aware
 *     editor polish (D-MON7) — same passthrough stance as `create_item`
 *     columnValues.
 */
export const AddColumnConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    columnTitle: z
      .string({ required_error: "columnTitle is required." })
      .min(1, "columnTitle is required."),
    columnType: z
      .string({ required_error: "columnType is required." })
      .min(1, "columnType is required."),
    defaults: z.union([z.string(), z.record(z.unknown())]).optional(),
  })
  .strict();

export type AddColumnConfig = z.infer<typeof AddColumnConfigSchema>;
