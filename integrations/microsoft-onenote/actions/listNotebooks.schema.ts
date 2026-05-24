import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `list_notebooks` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field name: `orderBy`. Defaults to
 * `"displayName asc"` matching V1.
 *
 * Strict mode rejects unknown fields.
 */
export const ListNotebooksConfigSchema = z
  .object({
    orderBy: z
      .enum([
        "displayName asc",
        "displayName desc",
        "lastModifiedDateTime desc",
        "lastModifiedDateTime asc",
        "createdDateTime desc",
        "createdDateTime asc",
      ])
      .default("displayName asc"),
  })
  .strict();

export type ListNotebooksConfig = z.infer<typeof ListNotebooksConfigSchema>;
