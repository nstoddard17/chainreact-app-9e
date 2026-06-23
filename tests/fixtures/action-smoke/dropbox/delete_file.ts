import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * PILOT — dropbox:delete_file (destructiveSafe, cleaned-to-trash).
 *
 *   setup    create_folder  -> capture { path } (marker-named, smoke-owned)
 *   execute  delete_file    -> delete exactly the ledger folder (Dropbox moves it
 *            to trash; recoverable ~30d). The execute IS the disposition
 *            (executeIsCleanup) — there is no permanent-delete to chase it with.
 *   verify   path_metadata  -> INDEPENDENT smoke read-back asserting the folder is
 *            ABSENT (`exists == false`). The Dropbox get_metadata read conflates
 *            nothing: a deleted path surfaces a TYPED NotFoundError (409
 *            path/not_found) mapped to exists:false, while a permission/other error
 *            propagates -> VERIFY_FAILED (never a false "deleted"). delete_file's
 *            own structural output is NOT trusted.
 *
 * Operates ONLY on a folder THIS run created. requiredEnv is only the connection
 * signal. There is no separate cleanup step — the delete under test is the cleanup.
 */
export default defineWriteSmokeFixture({
  provider: "dropbox",
  action: "delete_file",
  risk: "destructive",
  liveRisk: "destructive",
  liveSafe: false,
  config: {
    path: "{{ledger.folder.id}}",
  },
  requiredEnv: ["SMOKE_DROPBOX_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "dropbox",
        action: "create_folder",
        config: { path: "/{{smokeMarker}}folder", autorename: false },
        captureResource: { resourceKey: "folder", idPath: "path", kind: "folder" },
      },
    ],
    // The delete under test removes the smoke folder -> it IS the disposition.
    executeIsCleanup: true,
    // Independent absence read-back (smoke-only get_metadata existence probe).
    verify: {
      provider: "dropbox",
      action: "path_metadata",
      config: { path: "{{ledger.folder.id}}" },
      expectEquals: { path: "exists", value: false },
      smokeRead: true,
    },
  },
  notes:
    "PILOT — create folder -> delete_file (to Dropbox trash) -> independent " +
    "path_metadata exists==false. Absence proven via typed NotFoundError, not the " +
    "delete echo. destructiveSafe.",
});
