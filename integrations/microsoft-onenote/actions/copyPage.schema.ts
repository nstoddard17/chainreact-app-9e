import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `copy_page` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field names: `sourcePageId`,
 * `targetSectionId`. V1's manifest also exposed
 * `sourceNotebookId` / `sourceSectionId` / `targetNotebookId` as
 * cascade-picker parents — those are UI scope-narrowers, NOT runtime
 * inputs; Graph's `copyToSection` endpoint only needs the source page
 * id + target section id.
 *
 * V2 schema accepts only the two runtime fields. The future picker
 * UX (ONENOTE-3 + 4) can surface the cascade-narrowing fields as
 * options-resolver deps without including them in the resolved
 * config.
 *
 * Strict mode rejects unknown fields.
 */
export const CopyPageConfigSchema = z
  .object({
    sourcePageId: z
      .string({ required_error: "sourcePageId is required." })
      .min(1, "sourcePageId is required."),
    targetSectionId: z
      .string({ required_error: "targetSectionId is required." })
      .min(1, "targetSectionId is required."),
  })
  .strict();

export type CopyPageConfig = z.infer<typeof CopyPageConfigSchema>;
