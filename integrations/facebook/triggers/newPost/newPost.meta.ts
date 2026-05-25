import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `facebook:new_post` — Slice 3.FACEBOOK-5.
 *
 * Webhook-activated. Activation subscribes the selected Page to the app via
 * `POST /{pageId}/subscribed_apps` (`subscribed_fields=feed`); inbound feed
 * changes arrive at the app-level `/api/webhooks/facebook` route, which
 * verifies `X-Hub-Signature-256`, normalizes each new post, and dispatches
 * through the per-trigger filter (pageId match).
 *
 * `payloadShape` mirrors `_shared/normalize.ts:normalizeNewPost`. Message
 * text, the permalink, and the author id are surfaced (the trigger's
 * purpose) but marked sensitive so the run-detail API redacts them. Opaque
 * ids / timestamps / changeKind are non-sensitive.
 *
 * Risk: observational; low.
 */
export const facebookNewPostTriggerMeta: TriggerMeta = {
  key: "facebook:new_post",
  provider: "facebook",
  type: "new_post",
  displayName: "New Post",
  description:
    "Fires when a new post is published on the watched Facebook Page. Set the webhook callback URL once in the Meta App Dashboard; activating a workflow subscribes the selected Page automatically.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page whose new posts trigger the workflow.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'new_post'." },
    { name: "pageId", type: "string", description: "Id of the Page the post belongs to." },
    { name: "postId", type: "string", description: "Id of the new post (stable; usable as a dedup key)." },
    {
      name: "message",
      type: "string",
      description: "Post text (when present). Sensitive — user-authored content.",
      sensitive: true,
    },
    {
      name: "permalinkUrl",
      type: "string",
      description: "Permalink to the post (when present). Sensitive — public-surface link.",
      sensitive: true,
    },
    { name: "createdTime", type: "string", description: "ISO-8601 time the post was created." },
    {
      name: "fromId",
      type: "string",
      description: "Id of the author/actor (when present). Sensitive — a stable per-user identifier.",
      sensitive: true,
    },
    { name: "mediaType", type: "string", description: "Feed item type (status/photo/video/share/…)." },
  ],
  displayOrder: 10,
};
