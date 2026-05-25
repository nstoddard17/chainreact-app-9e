import { z } from "zod";

/**
 * `remove_subscriber` action schema — Slice 14 Commit 3 (Q11 hot
 * spot #2).
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/removeSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/removeSubscriber.ts).
 *
 * **Q11 — `mode` REQUIRED with NO default.** Mailchimp exposes two
 * subscriber-removal modes with very different consequences:
 *
 *   - `'archive'` — DELETE the member from the audience. Reversible:
 *     the member's history stays in Mailchimp's archive and the
 *     same email can be re-subscribed later via PUT. Maps to
 *     `DELETE /lists/{id}/members/{hash}`.
 *
 *   - `'delete_permanent'` — Permanently delete every trace of the
 *     subscriber. **NOT reversible.** All historical engagement /
 *     opt-in / event data is lost. Mailchimp also BLOCKS
 *     re-subscribing the same email afterward (GDPR erasure
 *     contract). Maps to `POST /lists/{id}/members/{hash}/actions/delete-permanent`.
 *
 * V1 [`removeSubscriber.ts:31`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/removeSubscriber.ts#L31)
 * exposes `delete_permanently: boolean` defaulting to `false`. The
 * destructive nature of permanent delete plus the Mailchimp-side
 * resubscribe block means workflow authors should consciously pick.
 * V2 promotes to explicit enum per Q11 — no silent defaults for
 * destructive actions.
 *
 * Schema is strict — unknown fields throw.
 */
export const RemoveSubscriberConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
    /** Q11 destructive-action gate — required, no default. */
    mode: z.enum(["archive", "delete_permanent"]),
  })
  .strict();

export type RemoveSubscriberConfig = z.infer<typeof RemoveSubscriberConfigSchema>;
