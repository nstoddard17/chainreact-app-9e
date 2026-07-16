import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:add_note`.
 *
 * Mirrors `addNote.schema.ts` (3 required fields). Notes are
 * private — they live on the subscriber record inside Mailchimp's
 * admin UI and are NOT shown to the subscriber. Append-only on the
 * Mailchimp side; this action attaches a new note rather than
 * editing an existing one.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver;
 * the subscriber picker uses `mailchimp:members` (dependsOn
 * `audience_id`, whose resolver value IS the member email string the
 * schema stores) with `allowManualEntry` so an unlisted / upstream-wired
 * email still commits.
 *
 * Sensitive outputs: `email` (PII + suspicious-name trigger), `note`
 * (free-form text the workflow author wrote — may carry context that's
 * sensitive in the run-detail surface).
 *
 * Risk: low — internal annotation only. No customer-facing side
 * effect; not destructive.
 */
export const mailchimpAddNoteMeta: ActionMeta = {
  key: "mailchimp:add_note",
  provider: "mailchimp",
  type: "add_note",
  displayName: "Add Note",
  description:
    "Attach a private note to a Mailchimp subscriber via `POST /lists/{id}/members/{hash}/notes`. Notes are visible only inside Mailchimp's admin UI — never shown to the subscriber. Max 1000 characters per note.",
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
        "Subscriber to annotate — pick a member of the selected audience, or type/wire an email. Required.",
      type: "combobox",
      optionsSource: "mailchimp:members",
      dependsOn: "audience_id",
      allowManualEntry: true,
      required: true,
      placeholder: "Select or type a subscriber email",
    },
    {
      name: "note",
      label: "Note",
      description: "Free-form note text. Max 1000 characters.",
      type: "textarea",
      required: true,
      placeholder: "Followed up about the demo — they want a callback Tuesday.",
    },
  ],
  outputs: [
    {
      name: "noteId",
      type: "string",
      description: "Mailchimp note id (stringified — Mailchimp's wire form is numeric).",
    },
    {
      name: "email",
      type: "string",
      description: "Echoed subscriber email. Marked sensitive — PII.",
      sensitive: true,
    },
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "note",
      type: "string",
      description: "Echoed note body (Mailchimp returns it on the create response). Marked sensitive — free-form workflow-author content.",
      sensitive: true,
    },
    {
      name: "createdAt",
      type: "string",
      description: "Note creation timestamp (ISO-8601).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Internal-only annotation on a Mailchimp subscriber. Not visible to the subscriber; no customer-facing side effect.",
};
