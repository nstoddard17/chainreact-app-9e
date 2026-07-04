import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * hubspot:create_task (writeSafe) — HubSpot engagement batch.
 *
 *   execute  create_task -> capture { taskId } into ledger key "task". The task
 *            SUBJECT carries the unique smoke marker. Status/priority/type ride
 *            the documented schema defaults (NOT_STARTED / MEDIUM / TODO); no
 *            associations and no owner, so the task pings nobody.
 *   verify   task_state (smokeRead) -> INDEPENDENT GET-by-id read-back via the
 *            smoke-only seam (`GET /crm/v3/objects/tasks/{id}`); markerPath
 *            proves the marker on the PERSISTED hs_task_subject.
 *   cleanup  none — HubSpot has NO registered delete/archive action for tasks
 *            (artifact "left" on the throwaway portal).
 *
 * Connection is DB-probed by the dev test; task fixtures need no target env.
 */
export default defineWriteSmokeFixture({
  provider: "hubspot",
  action: "create_task",
  risk: "write",
  liveRisk: "write",
  liveSafe: false,
  config: {
    hs_task_subject: "{{smokeMarker}}task",
    hs_task_body: "ChainReact action-smoke artifact - safe to ignore",
  },
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "writeSafe",
    smokeMarker: "crsmoke-",
    captureResource: { resourceKey: "task", idPath: "taskId", kind: "task" },
    // create_task echoes the stored subject; confirm the unique marker round-tripped.
    markerEchoPath: "subject",
    verify: {
      provider: "hubspot",
      action: "task_state",
      smokeRead: true,
      config: { taskId: "{{ledger.task.id}}" },
      markerPath: "subject",
    },
  },
  notes:
    "Create a smoke-marked task (schema-default status/priority/type, no owner, no " +
    "associations) -> task_state seam GET-by-id read-back (marker on hs_task_subject). " +
    "No registered task delete/archive action -> artifact left on the throwaway portal.",
});
