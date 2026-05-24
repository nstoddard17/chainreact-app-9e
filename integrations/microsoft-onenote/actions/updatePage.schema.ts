import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `update_page` action —
 * Slice 3.ONENOTE-2.
 *
 * Preserves V1's 4-mode `updateMode` enum verbatim:
 *   - `append`  — append HTML at the end of the body.
 *   - `prepend` — prepend HTML at the start of the body.
 *   - `replace` — wipe the body and replace with HTML. **Recoverable
 *     via OneNote's per-page version history; classification stays
 *     at `medium` per ONENOTE-1 §5.1, mirroring Google Docs's
 *     `update_document.replace` D-GD4 decision.**
 *   - `insert`  — insert HTML relative to a CSS selector or `data-id`
 *     target. Requires `target` + optionally `position`
 *     (`after` / `before` / `inside`; defaults to `after`).
 *
 * `target` is REQUIRED when `updateMode === "insert"`. Enforced via
 * `.superRefine` so the handler surfaces a clean schema error rather
 * than a vague Graph 400.
 *
 * `content` is the HTML body fragment (caller owns the markup;
 * Graph parses with the HTML5 parser).
 *
 * Strict mode rejects unknown fields.
 */

export const UpdatePageUpdateModeSchema = z.enum([
  "append",
  "prepend",
  "replace",
  "insert",
]);
export type UpdatePageUpdateMode = z.infer<typeof UpdatePageUpdateModeSchema>;

export const UpdatePagePositionSchema = z.enum(["after", "before", "inside"]);
export type UpdatePagePosition = z.infer<typeof UpdatePagePositionSchema>;

export const UpdatePageConfigSchema = z
  .object({
    pageId: z
      .string({ required_error: "pageId is required." })
      .min(1, "pageId is required."),
    updateMode: UpdatePageUpdateModeSchema.default("append"),
    content: z
      .string({ required_error: "content is required." })
      .min(1, "content is required."),
    target: z.string().min(1).optional(),
    position: UpdatePagePositionSchema.default("after"),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.updateMode === "insert" && !config.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: "target is required when updateMode is 'insert'.",
      });
    }
  });

export type UpdatePageConfig = z.infer<typeof UpdatePageConfigSchema>;
