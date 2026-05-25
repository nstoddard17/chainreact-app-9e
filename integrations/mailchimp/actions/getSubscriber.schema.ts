import { z } from "zod";

/**
 * `get_subscriber` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/getSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/getSubscriber.ts).
 *
 * Looks up a single subscriber by email + audience. Read-only. Returns
 * an error (via `NotFoundError`) if the subscriber doesn't exist —
 * caller's responsibility to branch on the error in the workflow.
 *
 * Schema is strict — unknown fields throw.
 */
export const GetSubscriberConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
  })
  .strict();

export type GetSubscriberConfig = z.infer<typeof GetSubscriberConfigSchema>;
