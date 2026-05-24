import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `get_notebook_details`
 * action — Slice 3.ONENOTE-2.
 *
 * Pure read. V1-preserved camelCase field name: `notebookId`.
 *
 * Strict mode rejects unknown fields.
 */
export const GetNotebookDetailsConfigSchema = z
  .object({
    notebookId: z
      .string({ required_error: "notebookId is required." })
      .min(1, "notebookId is required."),
  })
  .strict();

export type GetNotebookDetailsConfig = z.infer<
  typeof GetNotebookDetailsConfigSchema
>;
