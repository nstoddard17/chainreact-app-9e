import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:create_post (writeSafe, cleaned) — publish a deterministic crsmoke- text
 * post to the connected smoke Page, prove it via an independent post read, then
 * delete it via the registered delete_post action.
 *
 *   target   SMOKE_FACEBOOK_PAGE_ID — the dev test discovers the connected smoke
 *            Page id and overlays it (never a personal timeline).
 *   execute  create_post -> marker message. Capture { postId } into ledger "post".
 *   verify   post_state (SMOKE READ-BACK) -> GET /{postId}?fields=message; markerPath
 *            proves the marker on the PERSISTED post message (the echo is never
 *            trusted; Facebook has no per-post registered read action).
 *   cleanup  delete_post (registered, smoke-owned ledger ref) -> the marker post is
 *            permanently removed (artifact cleaned).
 */
export default defineWriteSmokeFixture({
  provider: "facebook",
  action: "create_post",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
    message: "{{smokeMarker}}post - safe to delete",
  },
  requiredEnv: ["SMOKE_FACEBOOK_CONNECTED", "SMOKE_FACEBOOK_PAGE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "post", idPath: "postId", kind: "post" },
    verify: {
      provider: "facebook",
      action: "post_state",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.post.id}}" },
      smokeRead: true,
      markerPath: "message",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "facebook",
      action: "delete_post",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.post.id}}" },
    },
  },
  notes:
    "create_post (marker message) -> post_state read-back proves the persisted " +
    "message marker -> delete_post cleanup. writeSafe; smoke post deleted (cleaned).",
});
