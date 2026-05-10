import { z } from "zod";

/**
 * `remove_tag` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/removeTag.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/removeTag.ts).
 *
 * Removes one or more tags from a subscriber. Same endpoint as
 * `add_tag` — just status `'inactive'` instead of `'active'`.
 * Removing a tag the subscriber doesn't have is a no-op (Mailchimp
 * silently skips it; the wrapper still returns 204 No Content).
 *
 * Schema is strict — unknown fields throw.
 */
export const RemoveTagConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
    tags: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type RemoveTagConfig = z.infer<typeof RemoveTagConfigSchema>;
