import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `get_section_details`
 * action — Slice 3.ONENOTE-2.
 *
 * Pure read. V1-preserved camelCase field name: `sectionId`.
 *
 * Strict mode rejects unknown fields.
 */
export const GetSectionDetailsConfigSchema = z
  .object({
    sectionId: z
      .string({ required_error: "sectionId is required." })
      .min(1, "sectionId is required."),
  })
  .strict();

export type GetSectionDetailsConfig = z.infer<
  typeof GetSectionDetailsConfigSchema
>;
