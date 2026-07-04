import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * facebook:upload_photo (writeSafe, cleaned) — upload a deterministic crsmoke- photo
 * to the smoke Page from a self-contained v2_storage FileRef, prove it via an
 * independent photo read, then delete it.
 *
 *   target   SMOKE_FACEBOOK_PHOTO_STORAGE_PATH — the dev test stages a tiny PNG in
 *            OUR workflow-files bucket and overlays its path (self-contained bytes,
 *            never an invented external URL).
 *   execute  upload_photo -> multipart upload with the marker caption, published.
 *            Capture { photoId } into ledger "photo".
 *   verify   photo_state (SMOKE READ-BACK) -> GET /{photoId}?fields=name; markerPath
 *            proves the marker on the PERSISTED photo name (the caption; the upload
 *            echo is never trusted).
 *   cleanup  delete_post (registered) -> DELETE /{photoId} removes the photo + its
 *            feed story (artifact cleaned).
 */
export default defineWriteSmokeFixture({
  provider: "facebook",
  action: "upload_photo",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}",
    photo: {
      kind: "v2_storage",
      name: "{{smokeMarker}}photo.png",
      mimeType: "image/png",
      storagePath: "{{env.SMOKE_FACEBOOK_PHOTO_STORAGE_PATH}}",
    },
    caption: "{{smokeMarker}}photo - safe to delete",
    published: true,
  },
  requiredEnv: [
    "SMOKE_FACEBOOK_CONNECTED",
    "SMOKE_FACEBOOK_PAGE_ID",
    "SMOKE_FACEBOOK_PHOTO_STORAGE_PATH",
  ],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "photo", idPath: "photoId", kind: "photo" },
    verify: {
      provider: "facebook",
      action: "photo_state",
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", photoId: "{{ledger.photo.id}}" },
      smokeRead: true,
      markerPath: "name",
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "facebook",
      action: "delete_post",
      // delete_post is DELETE /{id}; the photo id is a deletable node (removes the
      // photo + its feed story). Smoke-owned ledger ref.
      config: { pageId: "{{env.SMOKE_FACEBOOK_PAGE_ID}}", postId: "{{ledger.photo.id}}" },
    },
  },
  notes:
    "upload_photo (marker caption, staged PNG) -> photo_state read-back proves the " +
    "persisted photo name marker -> delete_post (DELETE /{photoId}) cleanup. " +
    "writeSafe; cleaned.",
});
