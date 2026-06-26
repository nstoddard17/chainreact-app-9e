import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-docs:update_document (destructiveSafe, cleaned — CROSS-PROVIDER) — SMOKE-WRITE-34.
 *
 *   setup    create_document  -> create a WHOLE smoke-owned Doc (marker title +
 *            marker body) in My Drive root; capture { documentId } into ledger key
 *            "doc". A Google Doc IS a Drive file, so documentId is a Drive file id.
 *   execute  update_document  -> APPEND "<marker>updated" to the body of OUR doc
 *            (insertLocation "end" — additive, never the body-wiping "replace" mode).
 *            The handler's `documentId` / `contentLength` outputs are echoes, never
 *            trusted for verification.
 *   verify   get_document     -> READ-BACK the doc and confirm the marker on the
 *            PERSISTED flattened `content` (markerSuffix "updated" -> requires
 *            "<marker>updated", which the seed body "<marker>body" lacks, so a no-op
 *            update fails). Independent read (its `content` is the live body, not the
 *            write echo).
 *   cleanup  google-drive:delete_file (permanent) -> delete the WHOLE smoke Doc.
 *            Google Docs has NO own delete action; a documentId IS a Drive file id, so
 *            the certified Drive delete is the correct teardown. CROSS-PROVIDER
 *            cleanup, declared via `crossProviderCleanup: true`.
 *
 * Safety: every mutation is confined to a Doc THIS run created, then the entire
 * artifact is permanently deleted (true erase) -> LIVE_PASS_CLEANED. Smoke-owned
 * throughout (My Drive root, no target discovery); requiredEnv is only the connection
 * signal. `insertLocation: "end"` is deliberate — it APPENDS, so the read-back proves
 * the update landed without exercising the irreversible body-wipe `replace` mode.
 */
export default defineWriteSmokeFixture({
  provider: "google-docs",
  action: "update_document",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    documentId: "{{ledger.doc.id}}",
    content: "{{smokeMarker}}updated",
    insertLocation: "end",
  },
  requiredEnv: ["SMOKE_GOOGLE_DOCS_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    crossProviderCleanup: true,
    setup: [
      {
        provider: "google-docs",
        action: "create_document",
        config: { title: "{{smokeMarker}}doc", content: "{{smokeMarker}}body" },
        captureResource: { resourceKey: "doc", idPath: "documentId", kind: "document" },
      },
    ],
    // Independent read-back: get_document returns the persisted flattened body.
    verify: {
      provider: "google-docs",
      action: "get_document",
      config: { documentId: "{{ledger.doc.id}}" },
      markerPath: "content",
      markerSuffix: "updated",
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
    "SMOKE-WRITE-34 — create smoke doc (marker title+body) -> update_document append " +
    "<marker>updated (insertLocation end) -> get_document read-back marker(+suffix " +
    "updated) on flattened content -> google-drive:delete_file (cross-provider, " +
    "permanent). documentId IS a Drive file id. destructiveSafe.",
});
