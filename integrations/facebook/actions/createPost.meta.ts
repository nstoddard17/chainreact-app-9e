import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `create_post` ActionMeta — Slice 3.FACEBOOK-4.
 *
 * Publishes a text/link post to a Page (optionally scheduled). `pageId`
 * backed by `facebook:pages`. Media posts use `upload_photo` / `upload_video`
 * — create_post media[] is a deferred follow-up, so no media field here.
 * Field names mirror the FACEBOOK-2 runtime schema exactly.
 */
export const facebookCreatePostMeta: ActionMeta = {
  key: "facebook:create_post",
  provider: "facebook",
  type: "create_post",
  displayName: "Create Post",
  description:
    "Publish a post to a Facebook Page. Add a message, an optional link, and optionally schedule it to publish at a future time.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page to post to.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "message",
      label: "Message",
      description: "The text of the post.",
      type: "textarea",
      required: true,
      placeholder: "What do you want to share?",
    },
    {
      name: "link",
      label: "Link",
      description: "Optional URL to attach to the post.",
      type: "text",
      required: false,
      placeholder: "https://example.com",
    },
    {
      name: "scheduledPublishTime",
      label: "Schedule for",
      description:
        "Publish at this future time (UTC) instead of immediately. Leave empty to publish now.",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-06-01T09:00:00Z",
    },
  ],
  outputs: [
    { name: "postId", type: "string", description: "Id of the created post." },
    { name: "pageId", type: "string", description: "Id of the Page posted to." },
    {
      name: "scheduledPublishTime",
      type: "string",
      description: "Scheduled publish time (echo of input), or null if published immediately.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Publishes content publicly to a Facebook Page. Recoverable by editing or deleting the post.",
};
