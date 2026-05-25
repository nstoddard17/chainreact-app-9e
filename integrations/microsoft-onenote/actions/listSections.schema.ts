import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `list_sections` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field names: `notebookId`, `orderBy`.
 *
 * Strict mode rejects unknown fields.
 */
export const ListSectionsConfigSchema = z
  .object({
    notebookId: z
      .string({ required_error: "notebookId is required." })
      .min(1, "notebookId is required."),
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

export type ListSectionsConfig = z.infer<typeof ListSectionsConfigSchema>;
