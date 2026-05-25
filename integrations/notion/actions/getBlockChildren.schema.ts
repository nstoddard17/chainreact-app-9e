import { z } from "zod";

/**
 * Resolved-config schema for the Notion `get_block_children` action.
 *
 * Notion 2.1 Commit 4 — database/block read actions.
 *
 * Strict schema. Single-page list; no auto-pagination.
 *
 * `blockId` accepts either a block id OR a page id (Notion treats
 * pages as blocks at the API level). Folds V1's separate
 * `notion_action_list_page_content` action — same Notion endpoint,
 * one canonical V2 action.
 *
 * `pageSize` mirrors the V2 convention (1..100, Notion's hard ceiling).
 */
export const GetBlockChildrenConfigSchema = z
  .object({
    blockId: z.string().min(1, "blockId is required."),
    pageSize: z.number().int().positive().max(100).optional(),
    startCursor: z.string().optional(),
  })
  .strict();

export type GetBlockChildrenConfig = z.infer<
  typeof GetBlockChildrenConfigSchema
>;
