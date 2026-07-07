import { z } from "zod";

/**
 * Resolved-config schema for `asana:list_tasks_in_project` — ASANA-2.
 *
 *   - `workspaceId` — UI-scope only (cascade root for the project picker).
 *   - `projectId` (required) — the project whose tasks are listed.
 *   - `pageSize` — 1..100 (Asana's limit ceiling); handler defaults to 50
 *     when omitted.
 *   - `offset` — Asana's opaque `next_page.offset` cursor from a previous
 *     run's `nextOffset` output. "" (builder-cleared) = first page.
 */
export const ListTasksInProjectConfigSchema = z
  .object({
    workspaceId: z.string().optional(),
    projectId: z
      .string({ required_error: "projectId is required." })
      .min(1, "projectId is required."),
    pageSize: z.number().int().min(1).max(100).optional(),
    offset: z.string().optional(),
  })
  .strict();

export type ListTasksInProjectConfig = z.infer<
  typeof ListTasksInProjectConfigSchema
>;
