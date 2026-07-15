import { z } from "zod";
import { EDEN_SCHEDULING_PLATFORMS } from "@/integrations/_shared/eden/api/scheduling";

/**
 * Shared scheduling content schema (EDEN-6). One place for the post-body shape used by
 * `create_scheduling_draft` / `schedule_post` / `publish_post_now` and (partially) `update`.
 * `.strict()` at each action; authors never hand-write Eden wire-format. Platform-specific rules
 * are validated HERE (before Eden is called), never silently stripped.
 */

export const EdenPlatformEnum = z.enum(EDEN_SCHEDULING_PLATFORMS);

/** Public-URL media only — the file-output contract forbids bytes/base64 in config. */
export const EdenMediaItemSchema = z
  .object({
    url: z.string().url(),
    mimeType: z.string().max(128).optional(),
    alt: z.string().max(1000).optional(),
  })
  .strict();

/** Content fields spread into each write action's `.object({...})`. */
export const edenPostContentShape = {
  workspaceId: z.string().optional(),
  scheduleId: z.string().optional(),
  platforms: z.array(EdenPlatformEnum).min(1).max(8).optional(),
  text: z.string().min(1).max(25000),
  segments: z.array(z.string().min(1).max(25000)).max(100).optional(),
  media: z.array(EdenMediaItemSchema).max(20).optional(),
  youtubeTitle: z.string().min(1).max(100).optional(),
  timezone: z.string().max(64).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
};

/** Platforms that CANNOT publish text-only — Eden rejects them without hosted media. */
const MEDIA_REQUIRED_PLATFORMS = new Set(["instagram", "tiktok", "youtube"]);

/**
 * Shared platform/content validation. Applied via `.superRefine`. Rejects the combinations Eden
 * itself rejects, with a clear pre-flight message instead of a provider-side failure:
 *   - Instagram/TikTok/YouTube with no media → media required (no text-only publish).
 *   - YouTube with no title → Shorts require `perPlatform.youtube.title`.
 */
export function refinePlatformContent(
  val: { platforms?: readonly string[]; media?: readonly unknown[]; youtubeTitle?: string },
  ctx: z.RefinementCtx,
): void {
  const platforms = val.platforms ?? [];
  const hasMedia = Array.isArray(val.media) && val.media.length > 0;
  const needMedia = platforms.filter((p) => MEDIA_REQUIRED_PLATFORMS.has(p));
  if (needMedia.length > 0 && !hasMedia) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["media"],
      message: `${needMedia.join(", ")} require hosted media (a public URL). Text-only publishing is not supported on these platforms.`,
    });
  }
  if (platforms.includes("youtube") && !val.youtubeTitle) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["youtubeTitle"],
      message: "YouTube Shorts require a title. Set the YouTube title field.",
    });
  }
}
