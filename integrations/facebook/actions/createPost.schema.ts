import { z } from "zod";

/**
 * Resolved-config schema for `facebook:create_post` — Slice 3.FACEBOOK-2.
 * Text + optional link Page post, optional scheduled publish. Media posts
 * use `facebook:upload_photo` / `:upload_video` (create_post media[] is
 * deferred — FACEBOOK-N). Field names preserved from V1 (`pageId`,
 * `message`, `scheduledPublishTime`).
 */
export const CreatePostConfigSchema = z
  .object({
    pageId: z.string().min(1, "pageId is required."),
    message: z.string().min(1, "message is required."),
    /** Optional URL attached to the post. */
    link: z.string().url().optional(),
    /** ISO-8601; converted to unix seconds. When set, the post is scheduled. */
    scheduledPublishTime: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type CreatePostConfig = z.infer<typeof CreatePostConfigSchema>;
