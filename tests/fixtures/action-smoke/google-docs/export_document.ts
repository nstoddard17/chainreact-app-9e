import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-docs:export_document (writeSafe, artifact left) — FileRef PRODUCER:
 * export a smoke-owned doc to txt and stage the bytes to OUR v2_storage,
 * proving the staged object exists WITHOUT any raw bytes surfacing.
 *
 *   setup    create_document -> a marker-titled doc in My Drive root (capture
 *            ledger key "doc"). Same certified create the pilot fixture uses.
 *   execute  export_document { exportFormat: "txt" } -> Drive files.export
 *            converts server-side; stageFileToStorage stages the bytes and the
 *            output is { file: FileRef(v2_storage), fileName, fileSize, ... } —
 *            NO inline bytes / base64 / data field (contract enforced by the
 *            handler). fileName derives from the doc's marker title, so
 *            markerEchoPath proves the right doc was exported. Capture the
 *            FileRef's storagePath into ledger key "staged".
 *   verify   staged_file (SMOKE READ-BACK) -> reads OUR workflow-files bucket at
 *            that storagePath and asserts exists == true. Seam returns only
 *            { exists, sizeBytes } — never bytes.
 *
 * DISPOSITION: none. The ledger holds BOTH the doc and the staged object; the
 * staged object has no registered delete, so declaring a doc-only cleanup would
 * misreport the run as fully cleaned (the harness disposition is per-run, not
 * per-resource). Honest accounting: NO cleanup, both marked artifacts stay
 * (slack:download_file precedent — the marker title/name makes them ignorable).
 */
export default defineWriteSmokeFixture({
  provider: "google-docs",
  action: "export_document",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    documentId: "{{ledger.doc.id}}",
    exportFormat: "txt",
  },
  requiredEnv: ["SMOKE_GOOGLE_DOCS_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "google-docs",
        action: "create_document",
        config: {
          title: "{{smokeMarker}}export doc",
          content: "{{smokeMarker}}export body - safe to ignore",
        },
        captureResource: { resourceKey: "doc", idPath: "documentId", kind: "document" },
      },
    ],
    captureResource: { resourceKey: "staged", idPath: "file.storagePath", kind: "staged_file" },
    // fileName falls back to the PERSISTED doc title (documents.get) + ".txt".
    markerEchoPath: "fileName",
    verify: {
      provider: "google-docs",
      action: "staged_file",
      config: { storagePath: "{{ledger.staged.id}}" },
      smokeRead: true,
      expectEquals: { path: "exists", value: true },
    },
    // No cleanup: the staged v2_storage object has no registered delete, and a
    // doc-only cleanup would misreport the run disposition -> both marked
    // artifacts intentionally left.
  },
  notes:
    "create_document (marker title) -> export_document txt stages bytes to " +
    "v2_storage -> markerEchoPath proves fileName + staged_file read-back proves " +
    "the object exists. writeSafe; marked doc + staged-object artifacts left. " +
    "Output is FileRef(v2_storage), no bytes.",
});
