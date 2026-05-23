import { z } from "zod";

/**
 * Resolved-config schema for the Google Docs `update_document` action —
 * Slice 3.GDOCS-2.
 *
 * Preserves V1's 5-mode `insertLocation` enum verbatim per GDOCS-1 §8.1:
 *   - `end` — append at the end of the document.
 *   - `beginning` — insert at index 1 (right after the BODY_START
 *     sentinel).
 *   - `replace` — wipe existing body + insert new content. Recoverable
 *     via Docs' built-in version history; classification stays at
 *     `medium` per GDOCS-1 §5 + §9 D-GD4 (the meta layer in GDOCS-4
 *     surfaces a warning in the description).
 *   - `after_text` — find the searchText and insert AFTER its last
 *     match. Wildcard `*` semantics preserved (V1 maps to regex `.*`).
 *   - `before_text` — find the searchText and insert BEFORE its last
 *     match. Same wildcard semantics.
 *
 * `searchText` is REQUIRED when `insertLocation ∈ {"after_text",
 * "before_text"}`. The schema enforces this via `.superRefine` so
 * malformed configs fail at the resolver boundary rather than
 * surfacing a vague Docs 400 mid-call.
 *
 * Strict mode rejects unknown fields.
 */

export const UpdateDocumentInsertLocationSchema = z.enum([
  "end",
  "beginning",
  "replace",
  "after_text",
  "before_text",
]);
export type UpdateDocumentInsertLocation = z.infer<
  typeof UpdateDocumentInsertLocationSchema
>;

export const UpdateDocumentConfigSchema = z
  .object({
    documentId: z.string().min(1, "documentId is required."),
    insertLocation: UpdateDocumentInsertLocationSchema,
    searchText: z.string().min(1).optional(),
    content: z.string().min(1, "content is required."),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (
      (config.insertLocation === "after_text" ||
        config.insertLocation === "before_text") &&
      (config.searchText === undefined || config.searchText.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["searchText"],
        message: `searchText is required when insertLocation is '${config.insertLocation}'.`,
      });
    }
  });

export type UpdateDocumentConfig = z.infer<typeof UpdateDocumentConfigSchema>;
