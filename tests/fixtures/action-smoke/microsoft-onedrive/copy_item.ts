import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-onedrive:copy_item (destructiveSafe, cleaned-to-recycle) — SMOKE-WRITE-33.
 *
 * The blocker this UNBLOCKS (prior `move_item` slice / runbook SMOKE-WRITE-26): Graph
 * `/copy` is async — the production handler returns `{ status: "pending", monitorUrl }`
 * with NO copied-item id and deliberately does NOT poll (Slice 8 V1-rot fix). The
 * copy's id was therefore not capturable into the cleanup ledger, so a verified copy
 * would LEAK. The write harness now has a `completeAsync` phase (a bounded, smoke-only
 * poll of the TRUSTED monitor URL that captures the completed `resourceId`), so the
 * copy is identifiable, verifiable, and cleanable. The PRODUCTION action is unchanged
 * — polling lives ONLY in the smoke seam.
 *
 *   setup    create_folder -> a SMOKE-OWNED folder ("<marker>copy-folder"). It is the
 *            copy DESTINATION and the source's container. Captured FIRST as "folder".
 *            upload_file   -> a SMOKE-OWNED source file ("<marker>src.txt", INLINE
 *            content) uploaded INTO the smoke folder. Captured as "source".
 *   execute  copy_item     -> copy the source INTO the same smoke folder, renamed to
 *            "<marker>copy.txt". Returns `{ status:"pending", monitorUrl }` — no id.
 *   complete copy_monitor  -> poll the TRUSTED Graph monitor URL to terminal
 *   (async)  completion, capture the COMPLETED copy's `resourceId` into ledger "copy".
 *            A poll failure/timeout/no-id is VERIFY_FAILED (never proceeds uncaptured).
 *   verify   get_file      -> INDEPENDENT read-back of the COPIED item (by its real
 *            captured id) proving THREE things the handler echo cannot:
 *              - marker + suffix "copy" on the PERSISTED `name` (the source was
 *                "<marker>src", so reading the source by mistake would FAIL this);
 *              - `kind == "file"`;
 *              - `parentReference.id == {{ledger.folder.id}}` — the copy landed in OUR
 *                smoke folder (compared against the captured folder id, never an echo).
 *   cleanup  delete_item (each) -> delete ALL THREE ledger items (folder, source, copy).
 *
 * CLEANUP ORDER / CASCADE: the folder is captured first (it must exist before the
 * source uploads into it and before the copy targets it), so `cleanupEach` deletes it
 * first — which recursively recycles its children (source + copy). The subsequent
 * per-child deletes then hit Graph 404, and OneDrive `delete_item` is IDEMPOTENT on
 * 404 (`alreadyMissing: true` -> ok), so every ledger entry reconciles as cleaned and
 * the run reports 0 leaked. The folder delete alone removes everything; the per-item
 * deletes make the ledger accounting honest.
 *
 * Operates ONLY on items THIS run created. requiredEnv is only the connection signal.
 *
 * HONESTY — OneDrive `delete_item` moves items to the RECYCLE BIN (recoverable), not a
 * hard erase. All three smoke items leave the active drive (a `get` then 404s), so the
 * harness reports artifact "cleaned"; the certification note discloses recycle-bin
 * semantics. `status: "pending"` on the action output is the HONEST production
 * contract (copy initiated) — the smoke seam, not the action, confirms completion.
 */
export default defineWriteSmokeFixture({
  provider: "microsoft-onedrive",
  action: "copy_item",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    // itemId = the smoke source uploaded in setup (ledger ref, never a literal).
    itemId: "{{ledger.source.id}}",
    // Copy INTO the same smoke folder, renamed with a distinguishing "copy" suffix.
    targetParentItemId: "{{ledger.folder.id}}",
    newName: "{{smokeMarker}}copy.txt",
  },
  requiredEnv: ["SMOKE_MICROSOFT_ONEDRIVE_CONNECTED"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",
    smokeMarker: "crsmoke-",
    setup: [
      // "folder" captured FIRST — the destination + source container. Must exist
      // before the source uploads into it and before the copy targets it.
      {
        provider: "microsoft-onedrive",
        action: "create_folder",
        config: { name: "{{smokeMarker}}copy-folder" },
        captureResource: { resourceKey: "folder", idPath: "itemId", kind: "folder" },
      },
      // "source" — a smoke-owned file uploaded INTO the smoke folder (INLINE content).
      {
        provider: "microsoft-onedrive",
        action: "upload_file",
        config: {
          filename: "{{smokeMarker}}src.txt",
          mimeType: "text/plain",
          content: "{{smokeMarker}}content",
          contentEncoding: "utf8",
          parentItemId: "{{ledger.folder.id}}",
        },
        captureResource: { resourceKey: "source", idPath: "itemId", kind: "file" },
      },
    ],
    // The execute action returns {status:"pending", monitorUrl} with NO id — poll the
    // TRUSTED Graph monitor URL to terminal completion and capture the COPIED item id.
    completeAsync: {
      monitorUrlPath: "monitorUrl",
      provider: "microsoft-onedrive",
      action: "copy_monitor",
      captureResource: { resourceKey: "copy", idPath: "itemId", kind: "file" },
    },
    verify: {
      provider: "microsoft-onedrive",
      action: "get_file",
      config: { itemId: "{{ledger.copy.id}}" },
      // (1) marker + suffix "copy" on the persisted name -> proves we read the COPY,
      //     not the source (source name is "<marker>src", which lacks "copy").
      markerPath: "name",
      markerSuffix: "copy",
      // (2) kind == "file" -> the read-back is the copied file, not a folder.
      expectEquals: { path: "kind", value: "file" },
      // (3) parentReference.id == the captured smoke folder id -> the copy landed in
      //     OUR smoke folder (compared against a smoke-owned id, never an echo).
      expectContains: { path: "parentReference.id", value: "{{ledger.folder.id}}" },
    },
    cleanupEach: {
      provider: "microsoft-onedrive",
      action: "delete_item",
      config: { itemId: "{{each.id}}" },
    },
    cleanupKind: "delete",
  },
  notes:
    "SMOKE-WRITE-33 — setup create smoke folder + upload smoke source INTO it -> " +
    "copy_item into the same folder (async: returns pending + monitorUrl) -> " +
    "completeAsync polls the TRUSTED Graph monitor URL to terminal completion and " +
    "captures the copied item's resourceId -> get_file read-back marker(+suffix copy) " +
    "on name + kind==file + parentReference.id==smoke folder -> delete all three " +
    "(recycle bin, recoverable; folder cascade + idempotent 404 delete reconciles). " +
    "destructiveSafe. PRODUCTION action unchanged — polling is smoke-only.",
});
