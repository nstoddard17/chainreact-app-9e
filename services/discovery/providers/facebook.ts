import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Facebook discovery sub-registry — Slice 3.FACEBOOK-4 (actions) +
 * Slice 3.FACEBOOK-5 (triggers).
 *
 * Per-provider grouping of the 8 Facebook action meta imports + the 2
 * webhook trigger metas — mirrors `services/discovery/providers/dropbox.ts` /
 * `services/discovery/providers/discord.ts`. Central registry validation
 * (`ActionMetaSchema.parse` / `TriggerMetaSchema.parse` + duplicate-key
 * rejection) still happens in `services/discovery/_registry.ts`; this file is
 * purely an import grouping.
 *
 * **Coverage:** 8 actions, 2 triggers (`new_post`, `new_comment`).
 *
 * **Trigger arc (FACEBOOK-5).** Facebook's webhook is app-level — ONE URL in
 * the Meta App Dashboard serves the whole app; per-Page opt-in happens via
 * `POST /{pageId}/subscribed_apps` (`subscribed_fields=feed`) at workflow-
 * activate time (`registerActivation("facebook", "new_post"|"new_comment",
 * …)`), satisfying the `trigger-meta-activation-invariant` test WITHOUT a
 * `SHARED_INFRA_EXEMPT_KEYS` entry. Inbound feed changes arrive at the global
 * `/api/webhooks/facebook` route (X-Hub-Signature-256 verified), normalize,
 * and dispatch through the per-trigger filter (pageId / optional postId).
 * `subscribed_apps` is page-LEVEL, so deactivation is reference-count-safe
 * (only unsubscribe when no other workflow watches the Page). The manifest's
 * `capabilities.webhookTrigger` flips `true` in this slice.
 *
 * Action metas in displayOrder (10..80). Categories: messaging (publishing /
 * engagement / Messenger), files (media uploads), data (insights).
 * `requiresIntegration: true` on all 8.
 *   10 - create_post          50 - upload_video
 *   20 - update_post          60 - get_page_insights
 *   30 - comment_on_post      70 - send_message
 *   40 - upload_photo         80 - delete_post (destructive — last)
 *
 * Resolver wiring (the 4 FACEBOOK-3 keys):
 *   - `facebook:pages` (no deps) backs the `pageId` field on every action.
 *   - `facebook:posts` (dep `pageId`) backs `postId` on update_post /
 *     comment_on_post / delete_post.
 *   - `facebook:conversations` (dep `pageId`) backs the `recipientId` field
 *     on send_message (the resolver emits `conversationId:psid`; the runtime
 *     extracts the PSID).
 *   - `facebook:albums` (dep `pageId`) is NOT wired — the upload_photo
 *     runtime schema has no `albumId` field (album select/create is a
 *     deferred follow-up). The resolver remains registered for that future
 *     field.
 *
 * FileRef flags: `upload_photo` + `upload_video` consumeFileRef. No Facebook
 * action produces a FileRef.
 */

import { facebookCreatePostMeta } from "@/integrations/facebook/actions/createPost.meta";
import { facebookUpdatePostMeta } from "@/integrations/facebook/actions/updatePost.meta";
import { facebookCommentOnPostMeta } from "@/integrations/facebook/actions/commentOnPost.meta";
import { facebookUploadPhotoMeta } from "@/integrations/facebook/actions/uploadPhoto.meta";
import { facebookUploadVideoMeta } from "@/integrations/facebook/actions/uploadVideo.meta";
import { facebookGetPageInsightsMeta } from "@/integrations/facebook/actions/getPageInsights.meta";
import { facebookSendMessageMeta } from "@/integrations/facebook/actions/sendMessage.meta";
import { facebookDeletePostMeta } from "@/integrations/facebook/actions/deletePost.meta";

// triggers/ (FACEBOOK-5) — 2 app-level webhook triggers.
import { facebookNewPostTriggerMeta } from "@/integrations/facebook/triggers/newPost/newPost.meta";
import { facebookNewCommentTriggerMeta } from "@/integrations/facebook/triggers/newComment/newComment.meta";

export const FACEBOOK_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  facebookCreatePostMeta,
  facebookUpdatePostMeta,
  facebookCommentOnPostMeta,
  facebookUploadPhotoMeta,
  facebookUploadVideoMeta,
  facebookGetPageInsightsMeta,
  facebookSendMessageMeta,
  facebookDeletePostMeta,
];

/**
 * Facebook webhook trigger metas (FACEBOOK-5) — 2 triggers, displayOrder
 * 10..20:
 *   10 - new_post     (app-level webhook + per-page subscribed_apps)
 *   20 - new_comment  (same subscription; optional local postId filter)
 */
export const FACEBOOK_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  facebookNewPostTriggerMeta,
  facebookNewCommentTriggerMeta,
];
