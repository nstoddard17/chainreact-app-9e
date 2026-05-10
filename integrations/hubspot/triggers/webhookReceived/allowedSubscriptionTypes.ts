/**
 * Slice 13 Batch 1 curated HubSpot subscription-type allowlist.
 *
 * The consolidated `webhook_received` trigger lets workflow authors pick
 * one or more subscription types from this list at trigger config time.
 * Activation rejects values outside the list with a typed error — fail
 * loud at design time so misconfigured workflows never silently
 * subscribe to event types V2 doesn't intend to handle.
 *
 * 10 events selected from V1's 17 trigger node types (V1 lifecycle map
 * at [`HubSpotTriggerLifecycle.ts:41-59`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/HubSpotTriggerLifecycle.ts#L41)):
 *   - 3 contact.* (creation / propertyChange / deletion)
 *   - 3 company.* (creation / propertyChange / deletion)
 *   - 3 deal.* (creation / propertyChange / deletion)
 *   - 1 ticket.creation
 *
 * Deferred per slice plan (see slice-13-hubspot.md §"Deferred"):
 *   - ticket.propertyChange / ticket.deletion
 *   - note.creation / task.creation / call.creation / meeting.creation
 *     (engagements — deferred until shared engagement schema is needed)
 *   - form.submission (different subscription model — `/forms/v2/...`,
 *     NOT `/webhooks/v3/{appId}/subscriptions`)
 *   - marketing automation events
 *   - CMS / conversations
 *   - custom object subscriptions
 *
 * Adding a new type is an additive change here + a HubSpot dashboard
 * surface review. No schema migration.
 *
 * The receive route ALSO defends against unsupported events arriving
 * out of band: the lookup by (appId, eventType, propertyName) misses,
 * the receive route 200-acks without dispatch (logs `unknown_subscription`).
 */
export const HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES = [
  "contact.creation",
  "contact.propertyChange",
  "contact.deletion",
  "company.creation",
  "company.propertyChange",
  "company.deletion",
  "deal.creation",
  "deal.propertyChange",
  "deal.deletion",
  "ticket.creation",
] as const;

export type HubSpotAllowedSubscriptionType =
  (typeof HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set(
  HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES,
);

export function isAllowedHubSpotSubscriptionType(
  value: string,
): value is HubSpotAllowedSubscriptionType {
  return ALLOWED_SET.has(value);
}

/**
 * Returns `true` iff the subscription type is `*.propertyChange`. The
 * activation hook uses this to validate `propertyName` (required for
 * propertyChange, forbidden otherwise).
 */
export function isPropertyChangeSubscriptionType(value: string): boolean {
  return value.endsWith(".propertyChange");
}
