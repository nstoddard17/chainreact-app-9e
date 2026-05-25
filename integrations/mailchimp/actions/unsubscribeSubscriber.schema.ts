import { z } from "zod";

/**
 * `unsubscribe_subscriber` action schema — Mailchimp 2.1 Commit 2.
 *
 * **Semantic: state-change only.** PATCH `/lists/{listId}/members/{hash}`
 * with `status: 'unsubscribed'`. Preserves the subscriber record (V1
 * `lib/workflows/actions/mailchimp/unsubscribeSubscriber.ts` doc comment
 * is explicit on this — "unlike remove which permanently deletes").
 * Distinct from `remove_subscriber` (archive / hard-delete via the
 * Slice 14 destructive-gate Q11 mode).
 *
 * Schema is strict — unknown fields throw. Q11 has nothing to gate here
 * because the action's blast radius is bounded (single subscriber's
 * subscription state; no email is sent; no record is destroyed).
 *
 * **Dropped V1 dead flags (audit M-R3):**
 *   - `sendGoodbye` — V1 accepted but only TODO-logged the flag;
 *     Mailchimp's PATCH endpoint doesn't ship goodbye emails. The
 *     `goodbye_email` send is a list-level setting in the Mailchimp
 *     dashboard, NOT an API parameter. Schema rejects this field as
 *     `unknownKey` (strict).
 *   - `sendNotification` — same. List-owner notifications are a
 *     dashboard setting. Schema rejects.
 *   - `reason` — V1 fired an extra `POST /notes` call to add a note
 *     with the reason. Hidden side effect + non-atomic + V1 wrapped
 *     the second call in `.catch(swallow)`. Workflow authors who
 *     want to attach a reason note compose `unsubscribe_subscriber`
 *     → `add_note` explicitly. Schema rejects.
 *
 * Strict-mode enforcement (`.strict()`) means any of these three fields
 * cause Zod to throw, with the offending key in the error path —
 * surfaces clearly at config-validation time.
 */
export const UnsubscribeSubscriberConfigSchema = z
  .object({
    listId: z.string().min(1, "listId is required"),
    emailAddress: z.string().email("emailAddress must be a valid email"),
  })
  .strict();

export type UnsubscribeSubscriberConfig = z.infer<
  typeof UnsubscribeSubscriberConfigSchema
>;
