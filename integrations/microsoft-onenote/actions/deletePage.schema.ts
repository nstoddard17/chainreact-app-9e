import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `delete_page` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field name: `pageId`.
 *
 * **Destructive (irreversible).** Risk classification +
 * destructive-trio gate (`isDestructive: true` +
 * `requiresConfirmation: true` + `riskLevel: "high"`) land in
 * ONENOTE-4 meta. Runtime handler unconditionally executes when
 * dispatched — destructive gating is a meta / UI concern.
 *
 * Strict mode rejects unknown fields.
 */
export const DeletePageConfigSchema = z
  .object({
    pageId: z
      .string({ required_error: "pageId is required." })
      .min(1, "pageId is required."),
  })
  .strict();

export type DeletePageConfig = z.infer<typeof DeletePageConfigSchema>;
