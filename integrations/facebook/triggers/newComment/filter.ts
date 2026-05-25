import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for `facebook:new_comment` — Slice 3.FACEBOOK-5.
 *
 * Narrows the app-level webhook fan-out to the right Page (and, optionally,
 * the right post). The Page is subscribed to `feed` wholesale at activation;
 * the optional `postId` is a LOCAL filter applied here.
 *
 * Per-workflow config:
 *   - `pageId` (required) — only comments on this Page match.
 *   - `postId` (optional) — when set, only comments on this specific post
 *     match. When absent, all comments on the Page match.
 *
 * Fails closed: a config missing `pageId` throws in `parseConfig`.
 */
const ConfigSchema = z.object({
  pageId: z.string().min(1),
  postId: z.string().min(1).optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const facebookNewCommentFilter: TriggerFilter<Config> = {
  provider: "facebook",
  eventType: "new_comment",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    const eventPageId = event.payload.pageId;
    if (eventPageId !== config.pageId) {
      return {
        kind: "no-match",
        reason: `page ${String(eventPageId)} does not match filter ${config.pageId}`,
      };
    }
    if (config.postId !== undefined) {
      const eventPostId = event.payload.postId;
      if (eventPostId !== config.postId) {
        return {
          kind: "no-match",
          reason: `post ${String(eventPostId)} does not match filter ${config.postId}`,
        };
      }
    }
    return { kind: "match" };
  },
};
