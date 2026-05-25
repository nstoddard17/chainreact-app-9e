import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook discovery sub-registry — Slice 3.FACEBOOK-4 (actions only).
 *
 * Per-provider grouping of the 8 Facebook action meta imports — mirrors
 * `services/discovery/providers/dropbox.ts` /
 * `services/discovery/providers/discord.ts`. Central registry validation
 * (`ActionMetaSchema.parse` + duplicate-key rejection) still happens in
 * `services/discovery/_registry.ts`; this file is purely an import grouping.
 *
 * **Coverage:** 8 actions, 0 triggers.
 *
 * **Staged provider arc — triggers come in FACEBOOK-5.** This slice ships
 * the complete Facebook ACTION-metadata surface and flips `facebook` into
 * `COVERED_PROVIDERS`. The `new_post` / `new_comment` webhook triggers
 * (app-level webhook + per-page `subscribed_apps`) land in FACEBOOK-5; the
 * manifest's `capabilities.webhookTrigger` stays `false` until then. The
 * meta-coverage structural test enforces action↔handler 1:1 only — trigger
 * coverage is NOT enforced (precedent: Stripe / Discord / Google Docs /
 * OneNote / Monday / Dropbox). This is a deliberate staged arc, not a
 * missing-trigger gap.
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
