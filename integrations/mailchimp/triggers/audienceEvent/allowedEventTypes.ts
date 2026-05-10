/**
 * Curated allowlist of Mailchimp audience-event types for the
 * consolidated `audience_event` webhook trigger — Slice 14 Commit 4.
 *
 * Mirrors V1's 5 separate webhook-driven trigger types
 * ([V1 mailchimp/index.ts:50-543](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/mailchimp/index.ts#L50))
 * collapsed into one V2 trigger. Workflow authors select a subset of
 * these event types at trigger config time, and dispatch branches on
 * the `type` discriminator in the payload.
 *
 *   - `subscribe` — new subscriber added to the audience.
 *   - `unsubscribe` — subscriber unsubscribed.
 *   - `profile` — subscriber profile updated.
 *   - `upemail` — subscriber email address changed.
 *   - `cleaned` — Mailchimp marked the address as cleaned (hard bounce
 *     / repeated soft bounces). NEW in V2 — V1 doesn't expose this as
 *     a workflow trigger but Mailchimp's webhook protocol supports it
 *     natively at minimal cost.
 *   - `campaign` — a campaign was sent to the audience.
 *
 * Activation rejects any event type outside this list with a typed
 * error — fail-loud at design time so misconfigured workflows never
 * silently subscribe to event types V2 doesn't intend to handle.
 *
 * Receive treats events outside the activation-time selection as a
 * 200 quiet ack — defense-in-depth against dashboard re-config
 * subscribing the same endpoint to extra events out-of-band.
 */
export const MAILCHIMP_ALLOWED_EVENT_TYPES = [
  "subscribe",
  "unsubscribe",
  "profile",
  "upemail",
  "cleaned",
  "campaign",
] as const;

export type MailchimpAllowedEventType =
  (typeof MAILCHIMP_ALLOWED_EVENT_TYPES)[number];

const allowedSet: ReadonlySet<string> = new Set(MAILCHIMP_ALLOWED_EVENT_TYPES);

export function isAllowedMailchimpEventType(
  eventType: string,
): eventType is MailchimpAllowedEventType {
  return allowedSet.has(eventType);
}
