import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * asana:create_task (writeSafe) — create one crsmoke- task in the smoke project,
 * prove it landed via an INDEPENDENT get_task read-back, then complete it.
 *
 *   execute  create_task -> POST /tasks { projects: [SMOKE_ASANA_PROJECT_ID], name:
 *            "{{smokeMarker}}create ..." }. Capture { taskGid } into ledger key "task".
 *   verify   get_task (registered read action) by the captured gid; assert the marker
 *            on `taskName` (it is OURS). The create echo is never trusted.
 *   cleanup  complete_task — Asana has NO delete action in this slice, so the honest
 *            disposition is ARCHIVE-kind: the marker-prefixed task stays in the smoke
 *            project, completed. cleanupKind archive -> artifact "archived" on
 *            success, "left" on failure (both PASS-compatible on a smoke project).
 */
export default defineWriteSmokeFixture({
  provider: "asana",
  action: "create_task",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    projectId: "{{env.SMOKE_ASANA_PROJECT_ID}}",
    name: "{{smokeMarker}}create ChainReact action-smoke - safe to ignore",
    notes: "{{smokeMarker}}create body - safe to ignore",
  },
  requiredEnv: ["SMOKE_ASANA_CONNECTED", "SMOKE_ASANA_PROJECT_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "task", idPath: "taskGid", kind: "task" },
    verify: {
      provider: "asana",
      action: "get_task",
      config: { taskGid: "{{ledger.task.id}}" },
      markerPath: "taskName",
    },
    cleanup: {
      provider: "asana",
      action: "complete_task",
      config: { taskGid: "{{ledger.task.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create_task in the smoke project -> get_task read-back proves the marker on taskName -> " +
    "complete_task (archive disposition; no Asana delete action ships in this slice).",
});
