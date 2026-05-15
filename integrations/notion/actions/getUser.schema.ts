import { z } from "zod";

/**
 * Resolved-config schema for the Notion `get_user` action.
 *
 * Notion 2.1 Commit 2 — user lookups.
 *
 * Strict schema, single field. Id-only contract — no name / email
 * lookup. Workflow authors that have only a name compose `list_users`
 * upstream and select an id. (Parity-notion §13 cross-cutting decision.)
 */
export const GetUserConfigSchema = z
  .object({
    userId: z.string().min(1, "userId is required."),
  })
  .strict();

export type GetUserConfig = z.infer<typeof GetUserConfigSchema>;
