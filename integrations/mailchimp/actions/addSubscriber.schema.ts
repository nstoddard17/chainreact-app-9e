import { z } from "zod";

/**
 * `add_subscriber` action schema — Slice 14 Commit 3 (Q11 hot spot).
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/addSubscriber.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts).
 *
 * **Q11 — `status` REQUIRED with NO default.** Mailchimp's subscriber
 * status has CAN-SPAM / GDPR implications:
 *   - `'subscribed'` implies explicit prior consent — sending email
 *     without prior consent is a CAN-SPAM violation.
 *   - `'pending'` triggers a double-opt-in confirmation email — the
 *     subscriber confirms their intent before the status flips to
 *     `'subscribed'`. Recommended for GDPR-strict use cases.
 *   - `'unsubscribed'` / `'cleaned'` / `'transactional'` are
 *     administrative states.
 *
 * V1's [`addSubscriber.ts:23`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addSubscriber.ts#L23)
 * already uses `requireExplicitField('status')` — V2 inherits this
 * by making `status` a required Zod enum with no default. Workflow
 * authors must explicitly pick based on their opt-in process.
 *
 * Schema is strict — unknown fields throw. Merge-field collection is
 * a fixed allowlist of common standard fields (FNAME, LNAME, PHONE,
 * ADDRESS, CITY, STATE, ZIP, COUNTRY); custom merge tags are NOT
 * supported in Batch 1 and would need a separate slice with proper
 * dynamic-merge-field-discovery UX.
 */
export const AddSubscriberConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
    /** Q11 consent gate — required, no default. */
    status: z.enum([
      "subscribed",
      "pending",
      "unsubscribed",
      "cleaned",
      "transactional",
    ]),
    first_name: z.string().min(1).optional(),
    last_name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    zip: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    /**
     * Comma-separated tag names. Optional. Mailchimp auto-creates
     * tags that don't already exist. Empty string / undefined ⇒ no
     * tags set.
     *
     * V2 mirrors V1's CSV input shape rather than `string[]` because
     * the existing workflow-config UI ships text inputs; switching
     * to an array would require a separate UI slice.
     */
    tags: z.string().optional(),
  })
  .strict();

export type AddSubscriberConfig = z.infer<typeof AddSubscriberConfigSchema>;
