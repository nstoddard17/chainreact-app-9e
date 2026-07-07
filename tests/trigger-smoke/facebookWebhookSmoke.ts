/**
 * Trigger-smoke — Facebook Page WEBHOOK pure specs (Lane C direct-seed,
 * pure-synthetic), on the generic orchestrator in directSeedWebhookSmoke.ts.
 *
 * Covers both registered Facebook triggers:
 *   facebook:new_post / new_comment
 *
 * ARCHITECTURE: Facebook's webhook is APP-LEVEL — one URL receives feed
 * changes for every subscribed Page, signed with `X-Hub-Signature-256`
 * (`sha256=` + HMAC-SHA256-hex over the raw body keyed
 * FACEBOOK_CLIENT_SECRET). Unlike Google/Dropbox, the change data is PUSHED
 * INLINE in the body — the receive path does NO provider fetch (verify →
 * classify feed change → normalize verbatim → dispatchTriggerEvent → pageId
 * filter → dedup → enqueue).
 *
 * HONESTY SCOPE (the Slack-message-batch policy): because the production
 * path never calls the Facebook API, a fully SYNTHETIC signed feed change
 * exercises the ENTIRE ingestion path unweakened — real Page resources would
 * add zero coverage while creating real public posts. All ids (pageId /
 * post_id / comment_id) and the message text are smoke-minted crsmoke
 * markers; NO real Page, post, comment, user content, or PII. The seeded
 * row's `config.pageId` matches the synthetic entry's pageId, so the
 * registered per-trigger filter's Zod parse + POSITIVE match runs inside
 * real dispatch. Certifies the V2 ingestion path for the Page feed event
 * shape; it does NOT certify provider-side Page subscription activation
 * (`/subscribed_apps`) and does NOT claim Facebook delivered.
 *
 * DEDUP: normalize keys `(facebook, new_post:${pageId}:${postId})` /
 * `(facebook, new_comment:${pageId}:${commentId})` — fully known at mint, so
 * the identity's eventId IS the dedup key and re-POSTing the identical body
 * must be dropped by the dispatcher's markSeen.
 *
 * Every spec is pure (no I/O). Real wiring (signing + the real route POST)
 * lives in facebookWebhookSmokeDeps.ts.
 */
import {
  buildDirectSeedSmokeWorkflow,
  type DirectSeedSmokeIdentity,
  type DirectSeedWebhookSpec,
} from "./directSeedWebhookSmoke";

export interface FacebookSmokeIdentity extends DirectSeedSmokeIdentity {
  /** = the normalize dedup key (`new_post:…` / `new_comment:…`). */
  readonly eventId: string;
  /** Smoke-minted Page id (never a real Page). */
  readonly pageId: string;
  /** Smoke-minted post id (`${pageId}_…`, shape-faithful). */
  readonly postId: string;
  /** Smoke-minted comment id — new_comment only. */
  readonly commentId: string;
  /** Run-unique crsmoke marker carried as the message text. */
  readonly marker: string;
}

/** Build the signed-body JSON for a Page feed change. */
export function buildFacebookFeedChangeBody(
  identity: FacebookSmokeIdentity,
  kind: "new_post" | "new_comment",
  createdTimeUnix: number,
): string {
  const value: Record<string, unknown> =
    kind === "new_post"
      ? {
          item: "status",
          verb: "add",
          post_id: identity.postId,
          created_time: createdTimeUnix,
          message: `${identity.marker} trigger-smoke post - safe to ignore`,
          from: { id: `crsmoke-user-${identity.marker}` },
        }
      : {
          item: "comment",
          verb: "add",
          post_id: identity.postId,
          comment_id: identity.commentId,
          parent_id: identity.postId,
          created_time: createdTimeUnix,
          message: `${identity.marker} trigger-smoke comment - safe to ignore`,
          from: { id: `crsmoke-user-${identity.marker}` },
        };
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: identity.pageId,
        time: createdTimeUnix,
        changes: [{ field: "feed", value }],
      },
    ],
  });
}

export type FacebookSpec = DirectSeedWebhookSpec<FacebookSmokeIdentity>;

export const FACEBOOK_NEW_POST_SPEC: FacebookSpec = {
  label: "facebook:new_post",
  provider: "facebook",
  expectedEventType: "new_post",
  // pageId is the meta's REQUIRED builder field AND the filter's config —
  // the deps seed the SAME smoke-minted pageId on the row, so the filter's
  // positive match runs inside real dispatch.
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "facebook",
      "new_post",
      { pageId: "crsmoke-page-placeholder" },
      "facebook:new_post",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "new_post") return false;
    if (run.eventId !== `new_post:${identity.pageId}:${identity.postId}`) {
      return false;
    }
    if (run.triggerPayload?.pageId !== identity.pageId) return false;
    if (run.triggerPayload?.postId !== identity.postId) return false;
    const message = run.triggerPayload?.message;
    return typeof message === "string" && message.includes(identity.marker);
  },
};

export const FACEBOOK_NEW_COMMENT_SPEC: FacebookSpec = {
  label: "facebook:new_comment",
  provider: "facebook",
  expectedEventType: "new_comment",
  buildWorkflow: () =>
    buildDirectSeedSmokeWorkflow(
      "facebook",
      "new_comment",
      { pageId: "crsmoke-page-placeholder" },
      "facebook:new_comment",
    ),
  identityMatches: (run, identity) => {
    if (run.eventType !== "new_comment") return false;
    if (run.eventId !== `new_comment:${identity.pageId}:${identity.commentId}`) {
      return false;
    }
    if (run.triggerPayload?.pageId !== identity.pageId) return false;
    if (run.triggerPayload?.commentId !== identity.commentId) return false;
    if (run.triggerPayload?.parentId !== identity.postId) return false;
    const message = run.triggerPayload?.message;
    return typeof message === "string" && message.includes(identity.marker);
  },
};

export const ALL_FACEBOOK_WEBHOOK_SPECS: readonly FacebookSpec[] = [
  FACEBOOK_NEW_POST_SPEC,
  FACEBOOK_NEW_COMMENT_SPEC,
];
