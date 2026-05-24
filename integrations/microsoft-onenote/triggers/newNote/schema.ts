import { z } from "zod";

/**
 * Zod schema for the OneNote `new_note` polling trigger config —
 * Slice 3.ONENOTE-5.
 *
 * **Section-scoped polling** per ONENOTE-5 architecture (Discord
 * polling precedent). Account-wide polling would require Graph
 * `/me/onenote/pages` enumeration (no per-section pagination, expensive
 * for large notebooks) OR a per-section traversal multiplication.
 * Section-scoped matches V2's "explicit scope > magic global
 * discovery" pattern and reuses the ONENOTE-3 cascade resolvers the
 * builder already wires.
 *
 * `notebookId` is a UI scope-narrower (required so the builder's
 * sections-resolver dep wiring works — same convention as the
 * ONENOTE-4 action metas). The poll runtime doesn't read it (Graph's
 * `/me/onenote/sections/{sectionId}/pages` endpoint doesn't need the
 * parent notebook id); it's preserved for re-activation idempotency
 * + payload echo.
 *
 * Server-managed state (`pollingEnabled`, `snapshot`, `polling`)
 * mirrors the Gmail / Discord polling-trigger convention — set by
 * activation hook + advanced by poll loop, never user-editable.
 *
 * Snapshot shape: `{lastSeenCreatedDateTime, capturedAt}`. Graph
 * `onenotePage.createdDateTime` is RFC3339 UTC with millisecond
 * precision — ISO string comparison (lexicographic) matches
 * chronological order. No need for a numeric cursor.
 */

export const NewNoteConfigSchema = z
  .object({
    notebookId: z
      .string({ required_error: "notebookId is required." })
      .min(1, "notebookId is required."),
    sectionId: z
      .string({ required_error: "sectionId is required." })
      .min(1, "sectionId is required."),

    // Polling-state fields (set by activation hook + advanced by poll loop)
    pollingEnabled: z.boolean().default(false),
    snapshot: z
      .object({
        lastSeenCreatedDateTime: z.string().min(1),
        capturedAt: z.string().min(1),
      })
      .optional(),
    polling: z
      .object({
        lastPolledAt: z.string().min(1),
      })
      .optional(),
  })
  .strict();

export type NewNoteConfig = z.infer<typeof NewNoteConfigSchema>;
