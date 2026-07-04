import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:comment_on_post (writeSafe, cleaned) — comment as the Page on a smoke-owned
 * post, prove the comment via an independent comments read, then delete the post
 * (which removes its comments too).
 *
 *   setup    create_post -> marker comment-target post. Capture ledger "post".
 *   execute  comment_on_post -> marker comment (the comment id is not captured; the
 *            verify reads the post's comments list, so no separate cleanup is needed
 *            for the comment).
 *   verify   post_comments (SMOKE READ-BACK) -> GET /{postId}/comments; markerPath
 *            proves the marker is present in the PERSISTED comments list.
 *   cleanup  delete_post (registered, smoke-owned) -> post + its comments removed.
 */
export default defineWriteSmokeFixture({
  provider: "facebook",
  action: "comment_on_post",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
    postId: "{{ledger.post.id}}",
    comment: "{{smokeMarker}}comment - safe to ignore",
  },
  requiredEnv: ["SMOKE_FACEBOOK_CONNECTED", "SMOKE_FACEBOOK_PAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "facebook",
        action: "create_post",
        config: {
          pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
          message: "{{smokeMarker}}comment-target post - safe to delete",
        },
        captureResource: { resourceKey: "post", idPath: "postId", kind: "post" },
      },
    ],
    verify: {
      provider: "facebook",
      action: "post_comments",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.post.id}}" },
      smokeRead: true,
      markerPath: "comments",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "facebook",
      action: "delete_post",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.post.id}}" },
    },
  },
  notes:
    "create_post (seed) -> comment_on_post (marker) -> post_comments read-back proves " +
    "the marker in the persisted comments list -> delete_post cleanup. writeSafe; cleaned.",
});
