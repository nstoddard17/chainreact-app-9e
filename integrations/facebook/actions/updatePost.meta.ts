import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `update_post` ActionMeta — Slice 3.FACEBOOK-4.
 *
 * Edits a published Page post's message (and optionally its publish state).
 * `pageId` → `postId` cascade (`facebook:pages` → `facebook:posts`
 * dependsOn pageId). Field names mirror the FACEBOOK-2 runtime schema.
 */
export const facebookUpdatePostMeta: ActionMeta = {
  key: "facebook:update_post",
  provider: "facebook",
  type: "update_post",
  displayName: "Update Post",
  description: "Edit the message of an existing Facebook Page post.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page that owns the post.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "postId",
      label: "Post",
      description: "The post to edit. Pick a Page first to load its recent posts.",
      type: "combobox",
      optionsSource: "facebook:posts",
      dependsOn: "pageId",
      required: true,
      placeholder: "Select a post",
    },
    {
      name: "message",
      label: "Message",
      description: "The new text for the post.",
      type: "textarea",
      required: true,
      placeholder: "Updated post text",
    },
    {
      name: "isPublished",
      label: "Published",
      description: "Optional. Toggle the publish state (e.g. publish a scheduled draft).",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "postId", type: "string", description: "Id of the updated post." },
    { name: "pageId", type: "string", description: "Id of the Page that owns the post." },
    { name: "success", type: "boolean", description: "Whether the update succeeded." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Mutates existing public Page content. Recoverable by editing the post again.",
};
