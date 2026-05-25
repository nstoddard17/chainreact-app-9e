import { z } from "zod";

/**
 * Resolved-config schema for `facebook:update_post` — Slice 3.FACEBOOK-2.
 * Edits a published Page post's message and/or publish state.
 */
export const UpdatePostConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    postId: z.string().min(1, "postId is required."),
    message: z.string().min(1, "message is required."),
    /** Toggle publish state (e.g. publish a scheduled draft). */
    isPublished: z.boolean().optional(),
  })
  .strict();

export type UpdatePostConfig = z.infer<typeof UpdatePostConfigSchema>;
