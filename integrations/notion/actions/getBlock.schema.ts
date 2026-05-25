import { z } from "zod";

/**
 * Resolved-config schema for the Notion `get_block` action.
 *
 * Notion 2.1 Commit 4 — database/block read actions.
 *
 * Strict schema, single field — id-only contract. V1 had a dual
 * selection mode (`selectedBlock` from a builder picker OR `blockId`
 * manual entry); V2 resolves variables at the engine layer so the
 * picker indirection is unnecessary.
 *
 * `blockId` accepts either a block id OR a page id (Notion treats
 * pages as blocks at the API level). Same dual-meaning convention as
 * `appendBlockChildren` / `listComments`.
 */
export const GetBlockConfigSchema = z
  .object({
    blockId: z.string().min(1, "blockId is required."),
  })
  .strict();

export type GetBlockConfig = z.infer<typeof GetBlockConfigSchema>;
