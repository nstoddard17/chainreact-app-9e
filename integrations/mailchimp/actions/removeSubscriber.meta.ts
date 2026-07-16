import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:remove_subscriber`.
 *
 * Mirrors `removeSubscriber.schema.ts` (3 required fields).
 *
 * **Full destructive trio — `isDestructive: true +
 * requiresConfirmation: true + riskLevel: "high"`.** The risk depends
 * on `mode`:
 *   - `archive`: removes the subscriber from active counts; Mailchimp
 *     retains the record and the subscriber can be re-subscribed
 *     later. Reversible.
 *   - `delete_permanent`: **IRREVERSIBLE.** Mailchimp purges the
 *     subscriber record AND blocks any future re-subscribe for that
 *     email address on this audience. Authors must explicitly pick.
 *
 * `mode` carries NO defaultValue (Q11) — workflow authors must
 * deliberately choose archive vs delete_permanent based on the
 * intended permanence. The riskDescription calls out the
 * permanent-block-on-re-subscribe consequence explicitly so authors
 * see it before confirmation.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver;
 * the subscriber picker uses `mailchimp:members` (dependsOn
 * `audience_id`, whose resolver value IS the member email string the
 * schema stores) with `allowManualEntry` so an unlisted / upstream-wired
 * email still commits. The picker does NOT soften the destructive trio —
 * `mode` still requires an explicit pick and confirmation still gates.
 *
 * Outputs are narrow and intentionally structural:
 *   - `email` is sensitive (PII + suspicious-name trigger).
 *   - `audienceId`, `mode`, `deletedAt`, `permanent` are structural.
 *     `mode` and `permanent` echo input/derived; they don't carry
 *     additional PII beyond what the workflow author already supplied.
 */
export const mailchimpRemoveSubscriberMeta: ActionMeta = {
  key: "mailchimp:remove_subscriber",
  provider: "mailchimp",
  type: "remove_subscriber",
  displayName: "Remove Subscriber",
  description:
    "Remove a Mailchimp subscriber via DELETE on `/lists/{id}/members/{hash}` (archive) or `/lists/{id}/members/{hash}/actions/delete-permanent`. **`mode = delete_permanent` is IRREVERSIBLE** — Mailchimp purges the record AND blocks any future re-subscribe for that email on the audience. `mode = archive` removes from active counts but keeps the record (re-subscribe possible).",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "audience_id",
      label: "Audience",
      description: "Mailchimp audience (list) holding the subscriber. Required.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "email",
      sensitivity: "recipient",
      label: "Email",
      description:
        "Subscriber to remove — pick a member of the selected audience, or type/wire an email. Required.",
      type: "combobox",
      optionsSource: "mailchimp:members",
      dependsOn: "audience_id",
      allowManualEntry: true,
      required: true,
      placeholder: "Select or type a subscriber email",
    },
    {
      name: "mode",
      label: "Mode",
      description:
        "**Required — no default.** `archive` removes from active member counts but Mailchimp keeps the record (re-subscribe possible). **`delete_permanent` is IRREVERSIBLE** — purges the record AND blocks future re-subscribe for this email on this audience.",
      type: "select",
      required: true,
      options: [
        { value: "archive", label: "Archive (reversible — record retained, re-subscribe possible)" },
        {
          value: "delete_permanent",
          label: "Delete permanently (IRREVERSIBLE — blocks future re-subscribe)",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "email",
      type: "string",
      description: "Echoed subscriber email (workflow-author-supplied). Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "mode",
      type: "string",
      description: "Echoed mode (`archive` or `delete_permanent`).",
    },
    {
      name: "deletedAt",
      type: "string",
      description: "Timestamp of the remove (ISO-8601). ChainReact-generated since Mailchimp returns 204 No Content.",
    },
    {
      name: "permanent",
      type: "boolean",
      description: "Derived from `mode === \"delete_permanent\"`. Convenience flag for downstream branching.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Removes a Mailchimp subscriber. `mode = delete_permanent` IRREVERSIBLY purges the record AND blocks any future re-subscribe for that email on this audience. `mode = archive` is reversible (re-subscribe possible). Workflow authors must explicitly pick `mode` (no default).",
};
