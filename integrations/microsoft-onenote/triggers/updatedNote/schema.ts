import { z } from "zod";

/**
 * Zod schema for the OneNote `updated_note` polling trigger config —
 * Slice 3.ONENOTE-5.
 *
 * **Section-scoped polling** with optional page filter. Same scope
 * choice as `new_note` (see that schema's header for rationale).
 *
 * Optional `pageId` filter: when set, the trigger fires ONLY when
 * the matching page is updated. When unset (`null`), the trigger
 * fires for any updated page in the section. The pageId picker reuses
 * the ONENOTE-3 `microsoft-onenote:pages` resolver via the
 * `dependsOn: "sectionId"` cascade.
 *
 * Snapshot shape: `{lastSeenModifiedDateTime, capturedAt}` — Graph's
 * `lastModifiedDateTime` is RFC3339 UTC; ISO string comparison
 * matches chronological order.
 *
 * **New-page exclusion handled inside poll.ts** — pages where
 * `createdDateTime === lastModifiedDateTime` are excluded from
 * `updated_note` because `new_note` covers them. Without this guard,
 * a brand-new page would fire both triggers. Matches the standard V2
 * polling-trigger convention.
 *
 * Server-managed state (`pollingEnabled`, `snapshot`, `polling`)
 * mirrors the Gmail / Discord pattern.
 */

export const UpdatedNoteConfigSchema = z
  .object({
    notebookId: z
      .string({ required_error: "notebookId is required." })
      .min(1, "notebookId is required."),
    sectionId: z
      .string({ required_error: "sectionId is required." })
      .min(1, "sectionId is required."),
    pageId: z.string().min(1).nullable().default(null),

    // Polling-state fields (set by activation hook + advanced by poll loop)
    pollingEnabled: z.boolean().default(false),
    snapshot: z
      .object({
        lastSeenModifiedDateTime: z.string().min(1),
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

export type UpdatedNoteConfig = z.infer<typeof UpdatedNoteConfigSchema>;
