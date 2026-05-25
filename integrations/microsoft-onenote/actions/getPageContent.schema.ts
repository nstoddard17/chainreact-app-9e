import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `get_page_content` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field names: `pageId`, `includeIDs`,
 * `preGenerated`.
 *
 * Defaults preserved verbatim from V1:
 *   - `includeIDs` = false (Graph default).
 *   - `preGenerated` = true (Graph performance hint — cached HTML).
 *
 * `includeIDs: true` is load-bearing when the workflow chains into
 * `update_page` with `updateMode: "insert"` — the `data-id`
 * attributes the picker selects ride on Graph's response when this
 * flag is true.
 *
 * Strict mode rejects unknown fields.
 */
export const GetPageContentConfigSchema = z
  .object({
    pageId: z
      .string({ required_error: "pageId is required." })
      .min(1, "pageId is required."),
    includeIDs: z.boolean().default(false),
    preGenerated: z.boolean().default(true),
    // ONENOTE-4 UI scope-narrowers — handler ignores. Cascade chain
    // `notebookId` → `sectionId` → `pageId` (pages-resolver requires
    // `sectionId`). See createPage.schema.ts header for the dep-name
    // rationale.
    notebookId: z.string().min(1).optional(),
    sectionId: z.string().min(1).optional(),
  })
  .strict();

export type GetPageContentConfig = z.infer<typeof GetPageContentConfigSchema>;
