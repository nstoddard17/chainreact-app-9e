import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `comment_on_post` ActionMeta — Slice 3.FACEBOOK-4.
 *
 * Posts a comment AS the Page on one of its posts, with an optional
 * attachment URL. `pageId` → `postId` cascade. Field name `comment`
 * mirrors the FACEBOOK-2 runtime schema (NOT `message`).
 */
export const facebookCommentOnPostMeta: ActionMeta = {
  key: "facebook:comment_on_post",
  provider: "facebook",
  type: "comment_on_post",
  displayName: "Comment on Post",
  description: "Add a comment to a Facebook Page post as the Page.",
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
      description: "The post to comment on. Pick a Page first to load its recent posts.",
      type: "combobox",
      optionsSource: "facebook:posts",
      dependsOn: "pageId",
      required: true,
      placeholder: "Select a post",
    },
    {
      name: "comment",
      label: "Comment",
      description: "The text of the comment.",
      type: "textarea",
      required: true,
      placeholder: "Write a comment…",
    },
    {
      name: "attachmentUrl",
      label: "Attachment URL",
      description: "Optional URL to attach to the comment (photo, video, or link preview).",
      type: "text",
      required: false,
      placeholder: "https://example.com/image.jpg",
    },
  ],
  outputs: [
    { name: "commentId", type: "string", description: "Id of the created comment." },
    { name: "postId", type: "string", description: "Id of the post commented on." },
    { name: "pageId", type: "string", description: "Id of the Page." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Publishes a public comment under the Page's identity. Recoverable by deleting the comment.",
};
