import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * asana:update_task (writeSafe) — create a throwaway crsmoke- task, rename it with a
 * marker-suffixed name, prove the UPDATE landed via an independent read-back
 * (markerSuffix pins the post-update value, so the seed name can't false-pass), then
 * complete it.
 */
export default defineWriteSmokeFixture({
  provider: "asana",
  action: "update_task",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    taskGid: "{{ledger.task.id}}",
    name: "{{smokeMarker}}updated",
  },
  requiredEnv: ["SMOKE_ASANA_CONNECTED", "SMOKE_ASANA_PROJECT_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    setup: [
      {
        provider: "asana",
        action: "create_task",
        config: {
          projectId: "{{env.SMOKE_ASANA_PROJECT_ID}}",
          name: "{{smokeMarker}}seed - safe to ignore",
        },
        captureResource: { resourceKey: "task", idPath: "taskGid", kind: "task" },
      },
    ],
    verify: {
      provider: "asana",
      action: "get_task",
      config: { taskGid: "{{ledger.task.id}}" },
      markerPath: "taskName",
      markerSuffix: "updated",
    },
    cleanup: {
      provider: "asana",
      action: "complete_task",
      config: { taskGid: "{{ledger.task.id}}" },
    },
    cleanupKind: "archive",
  },
  notes:
    "setup create_task (seed) -> update_task renames to {{smokeMarker}}updated -> get_task " +
    "read-back requires the marker+updated suffix (seed name cannot false-pass) -> " +
    "complete_task (archive disposition; no Asana delete action in this slice).",
});
