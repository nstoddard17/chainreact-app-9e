import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * asana:complete_task (writeSafe) — create a throwaway crsmoke- task, complete it,
 * prove the STATE CHANGE via an independent get_task read-back (`expectEquals
 * completed: true` — the action's own output echoes the flag, so only a read-back
 * proves it). The completion IS the disposition (a completed crsmoke- task remains
 * in the smoke project — archive-equivalent; Asana ships no delete in this slice).
 */
export default defineWriteSmokeFixture({
  provider: "asana",
  action: "complete_task",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    taskGid: "{{ledger.task.id}}",
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
          name: "{{smokeMarker}}complete-me - safe to ignore",
        },
        captureResource: { resourceKey: "task", idPath: "taskGid", kind: "task" },
      },
    ],
    verify: {
      provider: "asana",
      action: "get_task",
      config: { taskGid: "{{ledger.task.id}}" },
      markerPath: "taskName",
      expectEquals: { path: "completed", value: true },
    },
  },
  notes:
    "setup create_task (seed) -> complete_task -> get_task read-back proves completed === " +
    "true + the marker on taskName. The completed crsmoke- task is the intentional " +
    "artifact (archive-equivalent disposition; no delete action in this slice).",
});
