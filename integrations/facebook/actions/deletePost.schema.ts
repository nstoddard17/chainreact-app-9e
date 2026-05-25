import { z } from "zod";

/**
 * Resolved-config schema for `facebook:delete_post` — Slice 3.FACEBOOK-2.
 * High-risk / destructive (Graph DELETE is permanent — no restore). The
 * handler emits a structural-only output (no deleted content echoed).
 */
export const DeletePostConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    postId: z.string().min(1, "postId is required."),
  })
  .strict();

export type DeletePostConfig = z.infer<typeof DeletePostConfigSchema>;
