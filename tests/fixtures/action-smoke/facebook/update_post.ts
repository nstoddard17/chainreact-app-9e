import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:update_post (writeSafe, cleaned) — edit a smoke-owned Page post's message
 * and prove the NEW message via an independent read, then delete it.
 *
 *   setup    create_post -> marker "seed" post on the smoke Page. Capture ledger
 *            "post".
 *   execute  update_post -> rewrite the message with a suffix-pinned marker.
 *   verify   post_state (SMOKE READ-BACK) -> markerPath + markerSuffix "updated"
 *            proves the PERSISTED message is the updated one (a vacuous pass on the
 *            un-updated seed message is impossible).
 *   cleanup  delete_post (registered, smoke-owned) -> post removed (cleaned).
 */
export default defineWriteSmokeFixture({
  provider: "facebook",
  action: "update_post",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
    postId: "{{ledger.post.id}}",
    message: "{{smokeMarker}}updated post - safe to delete",
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
          message: "{{smokeMarker}}seed post - safe to delete",
        },
        captureResource: { resourceKey: "post", idPath: "postId", kind: "post" },
      },
    ],
    verify: {
      provider: "facebook",
      action: "post_state",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.post.id}}" },
      smokeRead: true,
      markerPath: "message",
      markerSuffix: "updated",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "facebook",
      action: "delete_post",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.post.id}}" },
    },
  },
  notes:
    "create_post (seed) -> update_post (marker+updated) -> post_state read-back " +
    "proves the persisted updated message -> delete_post cleanup. writeSafe; cleaned.",
});
