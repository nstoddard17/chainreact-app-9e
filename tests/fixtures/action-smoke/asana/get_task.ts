import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * asana:get_task — read-only single task by gid (bounded opt_fields set).
 *
 * Needs a connected Asana account and a task gid. The smoke report asserts only
 * the terminal run status — never task content.
 */
export default defineActionSmokeFixture({
  provider: "asana",
  action: "get_task",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    taskGid: "SMOKE_ASANA_TASK_ID",
  },
  requiredEnv: ["SMOKE_ASANA_CONNECTED", "SMOKE_ASANA_TASK_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only Asana task by gid; needs a connected Asana + a task gid in SMOKE_ASANA_TASK_ID.",
});
