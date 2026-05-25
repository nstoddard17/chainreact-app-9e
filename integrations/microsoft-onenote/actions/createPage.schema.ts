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
 * V1's optional `notebookId` field is **NOT a runtime input** — V2's
 * Graph call only needs `sectionId`. ONENOTE-4 re-exposes `notebookId`
 * as an OPTIONAL UI scope-narrower (the `microsoft-onenote:sections`
 * resolver requires `notebookId` as a dep, and the builder's cascade
 * wiring sends `deps[<parent-field-name>]` — so the parent field MUST
 * be literally named `notebookId` for the picker to work). The
 * handler ignores this field; it exists solely so the meta layer can
 * declare the cascade chain `notebookId` → `sectionId`.
 *
 * Strict mode retained — unknown fields outside this enumeration are
 * still rejected.
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
    // ONENOTE-4 UI scope-narrower — handler ignores; meta cascade
    // requires the field to be literally named `notebookId` so the
    // sections-resolver dep wiring works. See header.
    notebookId: z.string().min(1).optional(),
  })
  .strict();

export type CreatePageConfig = z.infer<typeof CreatePageConfigSchema>;
