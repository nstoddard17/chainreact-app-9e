import { z } from "zod";

/**
 * Resolved-config schema for `facebook:comment_on_post` — Slice
 * 3.FACEBOOK-2. Comments as the Page on a post, optional attachment URL.
 * Field name `comment` preserved from V1.
 */
export const CommentOnPostConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    postId: z.string().min(1, "postId is required."),
    comment: z.string().min(1, "comment is required."),
    /** Optional URL to attach (photo / video / link preview). */
    attachmentUrl: z.string().url().optional(),
  })
  .strict();

export type CommentOnPostConfig = z.infer<typeof CommentOnPostConfigSchema>;
