import { z } from "zod";

/**
 * Resolved-config schema for the Notion `list_comments` action.
 *
 * Notion 2.1 Commit 3 — comments.
 *
 * Strict schema. Single-page list; no auto-pagination.
 *
 * `blockId` — Notion's API parameter name. In practice it accepts page
 * ids too because pages are blocks at the API level. Matches the V2
 * `appendBlockChildren` convention (same field name, same dual-meaning
 * accepted). Workflow authors typically pass a page id here to list
 * page-level comments.
 *
 * `pageSize` mirrors the V2 convention from `queryDatabase` / `search` /
 * `listUsers`: optional, 1..100 (Notion's hard ceiling).
 */
export const ListCommentsConfigSchema = z
  .object({
    blockId: z.string().min(1, "blockId is required."),
    pageSize: z.number().int().positive().max(100).optional(),
    startCursor: z.string().optional(),
  })
  .strict();

export type ListCommentsConfig = z.infer<typeof ListCommentsConfigSchema>;
