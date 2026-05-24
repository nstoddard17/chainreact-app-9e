import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `create_page` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field names: `sectionId`, `title`,
 * `content`, `contentType`.
 *
 * V2-native defaults (per ONENOTE-1):
 *   - `contentType` defaults to `text/html` (D-ON1 — flipped from
 *     V1's `text/plain` per the recurring user-pain-point feedback
 *     in V1's `learning/docs/onenote-enhancement-summary.md`).
 *   - `content` defaults to empty string (empty body is valid — the
 *     resulting page has only the title).
 *
 * V1's optional `notebookId` field (used to auto-pick the default
 * section when sectionId was unset) is dropped — V2 requires an
 * explicit `sectionId`. Workflow authors compose with the section
 * picker / `microsoft-onenote:sections` resolver (ONENOTE-3).
 *
 * Strict mode rejects unknown fields.
 */
export const CreatePageConfigSchema = z
  .object({
    sectionId: z
      .string({ required_error: "sectionId is required." })
      .min(1, "sectionId is required."),
    title: z
      .string({ required_error: "title is required." })
      .min(1, "title is required."),
    content: z.string().default(""),
    contentType: z
      .enum(["text/html", "text/plain", "application/xhtml+xml"])
      .default("text/html"),
  })
  .strict();

export type CreatePageConfig = z.infer<typeof CreatePageConfigSchema>;
