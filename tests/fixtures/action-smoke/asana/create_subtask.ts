import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * asana:create_subtask (writeSafe) — ASANA-2. Create one crsmoke- subtask
 * under the designated smoke parent task, prove it landed via an
 * INDEPENDENT get_task read-back, then complete it.
 *
 *   execute  create_subtask -> POST /tasks/{SMOKE_ASANA_TASK_ID}/subtasks
 *            { name: "{{smokeMarker}}subtask ..." }. Capture { taskGid }
 *            into ledger key "subtask".
 *   verify   get_task (registered read action) by the captured gid; assert
 *            the marker on `taskName` (it is OURS). The create echo is
 *            never trusted.
 *   cleanup  complete_task — Asana has NO delete action shipped, so the
 *            honest disposition is ARCHIVE-kind: the marker-prefixed
 *            subtask stays under the smoke parent task, completed.
 */
export default defineWriteSmokeFixture({
  provider: "asana",
  action: "create_subtask",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    parentTaskGid: "{{env.SMOKE_ASANA_TASK_ID}}",
    name: "{{smokeMarker}}subtask ChainReact action-smoke - safe to ignore",
    notes: "{{smokeMarker}}subtask body - safe to ignore",
  },
  requiredEnv: ["SMOKE_ASANA_CONNECTED", "SMOKE_ASANA_TASK_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "subtask", idPath: "taskGid", kind: "task" },
    verify: {
      provider: "asana",
      action: "get_task",
      config: { taskGid: "{{ledger.subtask.id}}" },
      markerPath: "taskName",
    },
    cleanup: {
      provider: "asana",
      action: "complete_task",
      config: { taskGid: "{{ledger.subtask.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "create_subtask under the smoke parent task -> get_task read-back proves the marker on " +
    "taskName -> complete_task (archive disposition; no Asana delete action ships).",
});
