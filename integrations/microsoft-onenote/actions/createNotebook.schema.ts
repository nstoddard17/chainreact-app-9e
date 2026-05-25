import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `create_notebook` action —
 * Slice 3.ONENOTE-2.
 *
 * V1's UI exposed several optional metadata fields on `create_notebook`
 * (color, role) that map to Graph `notebook` resource fields. V2-v1
 * ships only `displayName` (the only required Graph field); follow-on
 * slices can add the optional fields when real consumers ask.
 *
 * V1 field name `displayName` preserved verbatim (matches Graph).
 *
 * Strict mode rejects unknown fields.
 */
export const CreateNotebookConfigSchema = z
  .object({
    displayName: z
      .string({ required_error: "displayName is required." })
      .min(1, "displayName is required."),
  })
  .strict();

export type CreateNotebookConfig = z.infer<typeof CreateNotebookConfigSchema>;
