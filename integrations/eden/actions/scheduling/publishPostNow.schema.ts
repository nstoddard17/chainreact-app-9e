import { z } from "zod";
import { edenPostContentShape, refinePlatformContent } from "./_content";

/**
 * `eden:publish_post_now` — IMMEDIATELY queue a post for public publishing. Recipient-visible and
 * irreversible from ChainReact. Same content shape as schedule/draft, with no time.
 */
export const PublishPostNowConfigSchema = z
  .object({ ...edenPostContentShape })
  .strict()
  .superRefine(refinePlatformContent);
export type PublishPostNowConfig = z.infer<typeof PublishPostNowConfigSchema>;
