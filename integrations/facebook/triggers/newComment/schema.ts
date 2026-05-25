import { z } from "zod";

/**
 * Zod schema for the `facebook:new_comment` trigger config —
 * Slice 3.FACEBOOK-5.
 *
 * User-set:
 *   - `pageId` — the Page to watch (required).
 *   - `postId` — OPTIONAL post filter. When set, only comments on this post
 *     fire (applied LOCALLY in the filter, not at subscription time — the
 *     Page subscribes to `feed` wholesale). Leave empty to fire on comments
 *     to ANY post on the Page.
 *
 * Server-managed (merged by the activation hook):
 *   - `subscribedFields` / `subscribedAt`.
 *
 * NOT strict — the lifecycle merges activation fields.
 */
export const FacebookNewCommentConfigSchema = z.object({
  pageId: z.string().min(1, "pageId is required."),
  postId: z.string().min(1).optional(),
  subscribedFields: z.array(z.string()).optional(),
  subscribedAt: z.string().optional(),
});

export type FacebookNewCommentConfig = z.infer<
  typeof FacebookNewCommentConfigSchema
>;
