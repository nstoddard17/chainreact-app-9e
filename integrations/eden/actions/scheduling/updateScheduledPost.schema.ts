import { z } from "zod";
import { EdenMediaItemSchema, EdenPlatformEnum, refinePlatformContent } from "./_content";

/**
 * `eden:update_scheduled_post` — edit a draft/scheduled post's CONTENT by id (not its time; use
 * `reschedule_post` for that). Every content field is optional; at least one must be present.
 * Cannot edit a post that is already publishing/posted (Eden returns a conflict → HANDLER_FAILED).
 */
export const UpdateScheduledPostConfigSchema = z
  .object({
    postId: z.string().min(1),
    scheduleId: z.string().optional(),
    platforms: z.array(EdenPlatformEnum).min(1).max(8).optional(),
    text: z.string().min(1).max(25000).optional(),
    segments: z.array(z.string().min(1).max(25000)).max(100).optional(),
    media: z.array(EdenMediaItemSchema).max(20).optional(),
    youtubeTitle: z.string().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.platforms === undefined &&
      val.text === undefined &&
      val.segments === undefined &&
      val.media === undefined &&
      val.youtubeTitle === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "Provide at least one field to change (text, platforms, segments, media, or YouTube title).",
      });
    }
    refinePlatformContent(val, ctx);
  });
export type UpdateScheduledPostConfig = z.infer<typeof UpdateScheduledPostConfigSchema>;
