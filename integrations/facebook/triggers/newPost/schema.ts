import { z } from "zod";

/**
 * Zod schema for the `facebook:new_post` trigger config — Slice 3.FACEBOOK-5.
 *
 * User-set:
 *   - `pageId` — the Page to watch (required).
 *
 * Server-managed (merged by the activation hook):
 *   - `subscribedFields` — what the Page was subscribed to (["feed"]).
 *   - `subscribedAt` — activation timestamp marker.
 *
 * NOT strict — the lifecycle merges activation fields and forward-compat
 * shouldn't break a parse at the filter boundary (mirrors the Dropbox /
 * Gmail trigger config schemas).
 */
export const FacebookNewPostConfigSchema = z.object({
  pageId: z.string().min(1, "pageId is required."),
  subscribedFields: z.array(z.string()).optional(),
  subscribedAt: z.string().optional(),
});

export type FacebookNewPostConfig = z.infer<typeof FacebookNewPostConfigSchema>;
