import { z } from "zod";

/**
 * Resolved-config schema for the Monday `list_items` action —
 * Slice 3.MONDAY-2.
 *
 * Pure read. V1 field names preserved:
 *   - `boardId` (required)
 *   - `groupId` (optional) — V1 client-side filters by group after
 *     fetching the page; V2 mirrors that to avoid an extra GraphQL
 *     variant.
 *   - `limit` (optional) — 1..100, default 25.
 *   - `cursor` (optional) — opaque next-page token returned by a
 *     previous call.
 */
export const ListItemsConfigSchema = z
  .object({
    boardId: z
      .string({ required_error: "boardId is required." })
      .min(1, "boardId is required."),
    groupId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).optional(),
  })
  .strict();

export type ListItemsConfig = z.infer<typeof ListItemsConfigSchema>;
