import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — google-docs:create_document (destructiveSafe, cleaned — CROSS-PROVIDER).
 *
 *   execute  create_document  -> create a marker-titled doc in My Drive root;
 *            capture { documentId } into ledger key "doc". A Google Doc IS a Drive
 *            file, so documentId is a Drive file id.
 *   verify   get_document     -> READ-BACK by id and confirm the marker on the
 *            PERSISTED `title`. create_document's own `title` output falls back to
 *            config (input echo), so the read-back is independent.
 *   cleanup  google-drive:delete_file (permanent) -> remove exactly the ledger doc.
 *            Google Docs has NO own delete action; its documentId is a Drive file
 *            id, so the certified Drive delete is the correct teardown. This is a
 *            CROSS-PROVIDER cleanup, declared via `crossProviderCleanup: true`.
 *
 * Smoke-owned throughout (My Drive root, no target discovery). requiredEnv is only
 * the connection signal. Drive delete with permanent:true is a TRUE erase (gone) ->
 * LIVE_PASS_CLEANED.
 */
export default defineWriteSmokeFixture({
  provider: "google-docs",
  action: "create_document",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    title: "{{smokeMarker}}doc",
    content: "{{smokeMarker}}body",
  },
  requiredEnv: ["SMOKE_GOOGLE_DOCS_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    crossProviderCleanup: true,
    captureResource: { resourceKey: "doc", idPath: "documentId", kind: "document" },
    // Independent read-back: get_document returns the persisted title.
    verify: {
      provider: "google-docs",
      action: "get_document",
      config: { documentId: "{{ledger.doc.id}}" },
      markerPath: "title",
    },
    // Cross-provider teardown: a Doc's documentId is a Drive file id.
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.doc.id}}", permanent: true },
    },
  },
  notes:
    "PILOT — create doc (marker title) -> get_document read-back marker on title -> " +
    "google-drive:delete_file (cross-provider, permanent). documentId IS a Drive file id. destructiveSafe.",
});
