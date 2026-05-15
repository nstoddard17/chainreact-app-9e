import { z } from "zod";

/**
 * `find_subscription` action schema.
 *
 * Stripe 2.1 Commit 5 — direct id lookup only.
 *
 * V1 (`lib/workflows/actions/stripe/findSubscription.ts`) hits
 * `GET /v1/subscriptions/{id}` with no list / search fallback.
 * V2 mirrors that surface — no email / customer fallback at the
 * schema layer. Workflow authors who want list-by-customer can
 * compose `get_subscriptions` once it ships (Stripe 2.2+).
 *
 * Returns `{ found: false, subscription: null }` on 404 — does NOT
 * throw NotFoundError. Same "find" semantic as `find_customer`.
 *
 * V1 patterns deliberately NOT ported (parity-stripe §8):
 *   - **Raw `expand` passthrough:** V1 doesn't have it; V2 rejects.
 *   - **`search` / `list` fields:** V1 only does direct id lookup
 *     (no search by customer / status / metadata); V2 schema rejects.
 */
export const FindSubscriptionConfigSchema = z
  .object({
    subscriptionId: z.string().min(1, "subscriptionId is required"),
  })
  .strict();

export type FindSubscriptionConfig = z.infer<typeof FindSubscriptionConfigSchema>;
