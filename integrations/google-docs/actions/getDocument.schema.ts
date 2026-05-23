import { z } from "zod";

/**
 * Resolved-config schema for the Google Docs `get_document` action —
 * Slice 3.GDOCS-2.
 *
 * Pure read. Single field; strict mode rejects unknowns.
 */
export const GetDocumentConfigSchema = z
  .object({
    documentId: z
      .string({ required_error: "documentId is required." })
      .min(1, "documentId is required."),
  })
  .strict();

export type GetDocumentConfig = z.infer<typeof GetDocumentConfigSchema>;
