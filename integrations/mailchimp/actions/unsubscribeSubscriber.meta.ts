import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:unsubscribe_subscriber`.
 *
 * Mirrors `unsubscribeSubscriber.schema.ts` (2 required fields).
 *
 * **Field-name variance preserved.** Like `get_subscribers`, this
 * action inherits V1's `listId` / `emailAddress` naming instead of the
 * `audience_id` / `email` convention used by the other 10 actions. The
 * `mailchimp:audiences` resolver has no `requiredDeps` so it backs
 * `listId` directly — no sibling resolver needed.
 *
 * **Risk classification: HIGH + requiresConfirmation: true, but
 * isDestructive: false.** This is the new risk shape introduced by
 * Slice MAILCHIMP-3:
 *   - Consent / list-status change has marketing + regulatory weight
 *     (CAN-SPAM unsubscribe enforcement, GDPR consent withdrawal).
 *   - Workflow authors should explicitly confirm before wiring this
 *     into a flow.
 *   - But the subscriber RECORD is not destroyed — Mailchimp retains
 *     the member with status `unsubscribed`, suppression rules kick in,
 *     and the subscriber can be re-subscribed later via opt-in. That's
 *     distinct from `remove_subscriber.delete_permanent` which DOES
 *     destroy the record and blocks re-subscribe.
 *
 * Per the V2 contract: `isDestructive: true OR requiresConfirmation:
 * true` MUST pair with `riskLevel: "high"`. We assert all three
 * fields explicitly.
 *
 * Sensitive outputs: `emailAddress` (PII — not in the suspicious-name
 * set so the structural guard doesn't force it, but plan classifies
 * it sensitive), `subscriberHash` (per-list identifier). `listId`,
 * `status`, `unsubscribed`, `lastChanged`, `success` are structural.
 */
export const mailchimpUnsubscribeSubscriberMeta: ActionMeta = {
  key: "mailchimp:unsubscribe_subscriber",
  provider: "mailchimp",
  type: "unsubscribe_subscriber",
  displayName: "Unsubscribe Subscriber",
  description:
    "Set a Mailchimp subscriber's status to `unsubscribed` via `PATCH /lists/{id}/members/{hash}`. **Consent change** — Mailchimp enforces suppression going forward (CAN-SPAM / GDPR unsubscribe handling). The subscriber RECORD is retained (re-subscribe is possible via fresh opt-in); the action does NOT delete the member. Use `Remove Subscriber` with mode `delete_permanent` for irreversible removal.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "listId",
      label: "Audience",
      description:
        "Mailchimp audience (list) holding the subscriber. Required. Field name is `listId` (camelCase) — preserved verbatim from the action schema.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "emailAddress",
      label: "Email",
      description:
        "Subscriber email. Required. Field name is `emailAddress` (camelCase) — preserved verbatim from the action schema.",
      type: "text",
      required: true,
      placeholder: "subscriber@example.com",
    },
  ],
  outputs: [
    {
      name: "listId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "subscriberHash",
      type: "string",
      description: "md5(lowercase(email)) — Mailchimp's per-list member hash. Marked sensitive — derives from PII.",
      sensitive: true,
    },
    {
      name: "emailAddress",
      type: "string",
      description: "Echoed subscriber email from Mailchimp's response. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "status",
      type: "string",
      description: "Mailchimp status after the change (expected `unsubscribed` on success).",
    },
    {
      name: "unsubscribed",
      type: "boolean",
      description: "`true` when Mailchimp's response status equals `unsubscribed`; defensive convenience derived from `status`.",
    },
    {
      name: "lastChanged",
      type: "string",
      description: "Mailchimp `last_changed` timestamp (ISO-8601). `null` when omitted.",
    },
    {
      name: "success",
      type: "boolean",
      description: "Always `true` on a successful Mailchimp response.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Changes the subscriber's marketing consent / list-status to `unsubscribed`. Mailchimp enforces suppression going forward (CAN-SPAM / GDPR). The subscriber record is RETAINED — re-subscribe is possible via fresh opt-in. For irreversible removal use `Remove Subscriber` mode `delete_permanent`.",
};
