import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `create_section` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field names: `notebookId`, `displayName`.
 *
 * Strict mode rejects unknown fields.
 */
export const CreateSectionConfigSchema = z
  .object({
    notebookId: z
      .string({ required_error: "notebookId is required." })
      .min(1, "notebookId is required."),
    displayName: z
      .string({ required_error: "displayName is required." })
      .min(1, "displayName is required."),
  })
  .strict();

export type CreateSectionConfig = z.infer<typeof CreateSectionConfigSchema>;
