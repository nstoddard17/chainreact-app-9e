import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * google-docs:share_document (destructiveSafe, cleaned) — anyone-link share a
 * smoke-owned doc, prove the permission landed via an INDEPENDENT Drive
 * permissions read, then permanently delete the doc (which removes the public
 * link with it).
 *
 *   setup    create_document -> a marker-titled doc in My Drive root (capture
 *            ledger key "doc").
 *   execute  share_document { makePublic: true, publicPermission: "reader",
 *            sendNotification: false } -> ONE permissions.create of type
 *            "anyone" on the smoke doc. No per-user share (shareWith stays
 *            empty), so NO external principal is ever involved and nothing is
 *            notified (Q11 sendNotification explicit false).
 *   verify   file_permissions (SMOKE READ-BACK) -> Drive permissions list with a
 *            types/roles-only fields mask; asserts permissionTypes CONTAINS
 *            "anyone" (the share echo is never trusted). The seam never returns
 *            principals, so no PII can surface.
 *   cleanup  google-drive:delete_file (permanent, CROSS-PROVIDER — a Doc's
 *            documentId IS a Drive file id; same declared pattern as the
 *            certified create_document pilot). Deleting the doc erases the
 *            anyone-link permission with it — nothing stays public.
 *
 * Scope: Drive file permissions via the connected Google login. The doc is
 * smoke-created, marker-titled, public for only the seconds between execute and
 * cleanup, and hard-deleted every run.
 */
export default defineWriteSmokeFixture({
  provider: "google-docs",
  action: "share_document",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    documentId: "{{ledger.doc.id}}",
    permission: "reader",
    sendNotification: false,
    makePublic: true,
    publicPermission: "reader",
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
        config: {
          title: "{{smokeMarker}}share doc",
          content: "{{smokeMarker}}share body - safe to ignore",
        },
        captureResource: { resourceKey: "doc", idPath: "documentId", kind: "document" },
      },
    ],
    verify: {
      provider: "google-docs",
      action: "file_permissions",
      config: { fileId: "{{ledger.doc.id}}" },
      smokeRead: true,
      expectContains: { path: "permissionTypes", value: "anyone" },
    },
    cleanupKind: "delete",
    cleanup: {
      provider: "google-drive",
      action: "delete_file",
      config: { fileId: "{{ledger.doc.id}}", permanent: true },
    },
  },
  notes:
    "create_document (marker title) -> share_document anyone-link reader " +
    "(sendNotification false, no per-user share) -> file_permissions read-back " +
    "proves type 'anyone' -> google-drive:delete_file permanent erases doc + " +
    "public link. destructiveSafe, cross-provider cleanup; cleaned.",
});
