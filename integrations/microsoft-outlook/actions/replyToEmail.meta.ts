import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:reply_to_email`.
 *
 * Mirrors `replyToEmail.schema.ts`. The handler dispatches against
 * Graph's /reply or /replyAll endpoint based on `replyAll`.
 *
 * **Required-no-default**:
 *   - `replyAll`: per Outlook Phase 2 Q11 the endpoint switches on this
 *     boolean. V1 silently picked false; V2 forces explicit because a
 *     wrong-direction default sends a less-broad or much-broader
 *     message than the author intended.
 *
 * `body` is required-by-key but may be empty (Graph wraps as `{ comment }`).
 *
 * Required scope: `Mail.Send`.
 *
 * Outputs match `replyToEmail.ts:47-53` exactly.
 */
export const outlookReplyToEmailMeta: ActionMeta = {
  key: "microsoft-outlook:reply_to_email",
  provider: "microsoft-outlook",
  type: "reply_to_email",
  displayName: "Reply to Email",
  description:
    "Reply to an existing Outlook message. 'Reply all' is required with no default — V2 forces explicit choice between sender-only reply and reply-all because the endpoint switches on it. Requires the Mail.Send scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "emailId",
      label: "Email id",
      description:
        "Graph message id of the email being replied to. Source from a trigger payload (payload.messageId) or a fetch_emails / search result.",
      type: "text",
      required: true,
    },
    {
      name: "replyAll",
      label: "Reply all",
      description:
        "Required. When on, the reply goes to the sender AND all other recipients (Graph /replyAll endpoint). When off, only the sender (/reply endpoint). NO default per Outlook Phase 2 Q11 — endpoint selection is destructive enough to force explicit choice.",
      type: "boolean",
      required: true,
    },
    {
      name: "body",
      label: "Body",
      description:
        "Reply text. Graph wraps this as the comment field. May be empty (Graph accepts empty replies); the field is required by key but may be left blank.",
      type: "textarea",
      required: false,
    },
  ],
  outputs: [
    { name: "replied", type: "boolean", description: "Always true on success." },
    { name: "replyAll", type: "boolean", description: "Echoes the chosen mode." },
    { name: "originalEmailId", type: "string", description: "Echoes the input emailId." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
};
