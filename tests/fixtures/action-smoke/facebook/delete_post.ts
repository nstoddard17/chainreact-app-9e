import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:delete_post (destructiveSafe, cleaned by the action under test) — delete a
 * smoke-owned Page post and prove the deletion by ABSENCE from the Page's posts edge.
 *
 *   setup    create_post "keeper"  -> a control post that stays until cleanup.
 *            create_post "target"  -> the delete-target. Capture ledger "post".
 *   execute  delete_post -> the action under test permanently removes the target
 *            (executeIsCleanup: the execute IS the disposition for "post").
 *   verify   page_posts (SMOKE READ-BACK) -> GET /{pageId}/posts. Two assertions on
 *            the SAME live read make the proof non-vacuous:
 *              - expectContains keeper id  -> the read is live + the page is non-empty
 *                (a broken/empty read would fail here, so absence can't vacuously pass);
 *              - expectAbsent  target id   -> the deleted post is gone.
 *            (A GET of the deleted node itself returns code=10 on this Page, not a
 *            clean not-found, so absence-from-the-edge is the honest proof.)
 *   cleanup  delete_post keeper (registered, smoke-owned) -> the control post removed.
 *
 * DISPOSITION: the action under test removed the target and cleanup removed the
 * keeper -> both cleaned.
 */
export default defineWriteSmokeFixture({
  provider: "facebook",
  action: "delete_post",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
    postId: "{{ledger.post.id}}",
  },
  requiredEnv: ["SMOKE_FACEBOOK_CONNECTED", "SMOKE_FACEBOOK_PAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "facebook",
        action: "create_post",
        config: {
          pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
          message: "{{smokeMarker}}keeper post - safe to delete",
        },
        captureResource: { resourceKey: "keeper", idPath: "postId", kind: "post" },
      },
      {
        provider: "facebook",
        action: "create_post",
        config: {
          pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
          message: "{{smokeMarker}}delete-target post - safe to delete",
        },
        captureResource: { resourceKey: "post", idPath: "postId", kind: "post" },
      },
    ],
    executeIsCleanup: true,
    verify: {
      provider: "facebook",
      action: "page_posts",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}" },
      smokeRead: true,
      expectContains: { path: "postIds", value: "{{ledger.keeper.id}}" },
      expectAbsent: { path: "postIds", value: "{{ledger.post.id}}" },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "facebook",
      action: "delete_post",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.keeper.id}}" },
    },
  },
  notes:
    "create_post keeper + target -> delete_post target (action under test) -> " +
    "page_posts read-back proves keeper PRESENT + target ABSENT -> delete_post keeper " +
    "cleanup. destructiveSafe; both posts gone (cleaned).",
});
