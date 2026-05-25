import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `facebook:new_comment` — Slice 3.FACEBOOK-5.
 *
 * Webhook-activated (shares the Page `subscribed_apps` `feed` subscription
 * with `new_post`). Inbound comments arrive at `/api/webhooks/facebook`,
 * are normalized, and dispatched through the per-trigger filter (pageId +
 * optional postId match).
 *
 * The optional `postId` field is a LOCAL filter (cascades from `pageId` via
 * `facebook:posts`): leave it empty to fire on comments to ANY post on the
 * Page, or pick a post to scope the trigger to that thread.
 *
 * `payloadShape` mirrors `_shared/normalize.ts:normalizeNewComment`. Comment
 * text + author id are sensitive; opaque ids / timestamps / changeKind are
 * not.
 *
 * Risk: observational; low.
 */
export const facebookNewCommentTriggerMeta: TriggerMeta = {
  key: "facebook:new_comment",
  provider: "facebook",
  type: "new_comment",
  displayName: "New Comment",
  description:
    "Fires when a new comment is posted on the watched Facebook Page. Optionally scope it to a single post; leave the post empty to watch every post on the Page.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page whose new comments trigger the workflow.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "postId",
      label: "Post (optional filter)",
      description:
        "Optional. Only fire for comments on this specific post. Pick a Page first to load its recent posts; leave empty to watch all posts.",
      type: "combobox",
      optionsSource: "facebook:posts",
      dependsOn: "pageId",
      required: false,
      placeholder: "All posts",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'new_comment'." },
    { name: "pageId", type: "string", description: "Id of the Page the comment belongs to." },
    { name: "postId", type: "string", description: "Id of the post that was commented on (when present)." },
    { name: "commentId", type: "string", description: "Id of the new comment (stable; usable as a dedup key)." },
    {
      name: "message",
      type: "string",
      description: "Comment text (when present). Sensitive — user-authored content.",
      sensitive: true,
    },
    { name: "createdTime", type: "string", description: "ISO-8601 time the comment was created." },
    {
      name: "fromId",
      type: "string",
      description: "Id of the commenter (when present). Sensitive — a stable per-user identifier.",
      sensitive: true,
    },
    { name: "parentId", type: "string", description: "Id of the parent post or comment (when present)." },
  ],
  displayOrder: 20,
};
