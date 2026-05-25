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
    // ONENOTE-4 UI scope-narrower — handler ignores. Cascade
    // `notebookId` → `sectionId` (sections-resolver requires
    // `notebookId`). See createPage.schema.ts header.
    notebookId: z.string().min(1).optional(),
  })
  .strict();

export type GetSectionDetailsConfig = z.infer<
  typeof GetSectionDetailsConfigSchema
>;
