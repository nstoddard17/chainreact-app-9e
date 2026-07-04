import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:upload_video (writeSafe, cleaned) — upload a deterministic crsmoke- video
 * to the smoke Page from a self-contained v2_storage FileRef, prove it via an
 * independent video read, then delete it.
 *
 *   target   SMOKE_FACEBOOK_VIDEO_STORAGE_PATH — the dev test stages a tiny MP4 in
 *            OUR workflow-files bucket and overlays its path. NOTE: the staged clip is
 *            a minimal MP4 container, not a real encoded stream, so Facebook's
 *            server-side video ingest may reject it; that rejection is a documented
 *            blocker, never faked as a pass.
 *   execute  upload_video -> simple multipart upload with marker title/description,
 *            published. Capture { videoId } into ledger "video".
 *   verify   video_state (SMOKE READ-BACK) -> GET /{videoId}?fields=title,description;
 *            markerPath proves the marker on the PERSISTED description (metadata is
 *            set at creation even while the video is still processing).
 *   cleanup  delete_post (registered) -> DELETE /{videoId} removes the video
 *            (artifact cleaned).
 */
export default defineWriteSmokeFixture({
  provider: "facebook",
  action: "upload_video",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
    video: {
      kind: "v2_storage",
      name: "{{smokeMarker}}video.mp4",
      mimeType: "video/mp4",
      storagePath: "{{env.SMOKE_FACEBOOK_VIDEO_STORAGE_PATH}}",
    },
    title: "{{smokeMarker}}video",
    description: "{{smokeMarker}}video - safe to delete",
    published: true,
  },
  requiredEnv: [
    "SMOKE_FACEBOOK_CONNECTED",
    "SMOKE_FACEBOOK_PAGE_ID",
    "SMOKE_FACEBOOK_VIDEO_STORAGE_PATH",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "video", idPath: "videoId", kind: "video" },
    verify: {
      provider: "facebook",
      action: "video_state",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", videoId: "{{ledger.video.id}}" },
      smokeRead: true,
      markerPath: "description",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "facebook",
      action: "delete_post",
      // delete_post is DELETE /{id}; a video id is a deletable node. Smoke-owned ref.
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.video.id}}" },
    },
  },
  notes:
    "upload_video (marker title/description, staged MP4) -> video_state read-back " +
    "proves the persisted description marker -> delete_post (DELETE /{videoId}) " +
    "cleanup. writeSafe; cleaned. May be BLOCKED if Facebook rejects the synthetic MP4.",
});
