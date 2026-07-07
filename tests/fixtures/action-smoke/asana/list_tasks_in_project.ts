import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * asana:list_tasks_in_project — ASANA-2. Read-only one-page task list for
 * the smoke project (bounded per-task fields, cursor pagination).
 *
 * Needs a connected Asana account and a project gid. The smoke report
 * asserts only the terminal run status — never task content.
 */
export default defineActionSmokeFixture({
  provider: "asana",
  action: "list_tasks_in_project",
  risk: "read",
  liveSafe: true,
  liveRisk: "read",
  config: {},
  configFromEnv: {
    projectId: "SMOKE_ASANA_PROJECT_ID",
  },
  requiredEnv: ["SMOKE_ASANA_CONNECTED", "SMOKE_ASANA_PROJECT_ID"],
  expect: { outcome: "success" },
  notes:
    "Read-only one-page task list for the smoke project; needs a connected Asana + a project gid in SMOKE_ASANA_PROJECT_ID.",
});
