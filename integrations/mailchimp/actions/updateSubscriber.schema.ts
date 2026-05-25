import { z } from "zod";

/**
 * `update_subscriber` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/updateSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/updateSubscriber.ts).
 *
 * PATCH semantics — every field is optional. The action sends only
 * the fields that are present in config; Mailchimp leaves everything
 * else untouched. `email` is required because we need it to derive
 * the subscriber hash for the URL path.
 *
 * `status` is OPTIONAL here (unlike `add_subscriber` where it's
 * Q11-required) because updating profile fields without changing
 * status is the common case. When status IS supplied, it ships
 * verbatim — but if no status change is intended, leave it omitted.
 *
 * `new_email` triggers Mailchimp's email-change workflow (and fires
 * `upemail` webhooks if subscribed). Optional.
 */
export const UpdateSubscriberConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
    new_email: z.string().email().optional(),
    status: z
      .enum([
        "subscribed",
        "pending",
        "unsubscribed",
        "cleaned",
        "transactional",
      ])
      .optional(),
    first_name: z.string().min(1).optional(),
    last_name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    zip: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
  })
  .strict();

export type UpdateSubscriberConfig = z.infer<typeof UpdateSubscriberConfigSchema>;
