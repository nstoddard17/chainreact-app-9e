import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:assign_workspace_to_capacity — moves the smoke
 * workspace onto the smoke capacity.
 *
 * NOT liveSafe: changes the workspace's capacity (feature availability +
 * billing footprint), and unassigning is deliberately not exposed by the
 * provider integration — moving it back requires the Power BI portal.
 * Requires capacity admin/assign + workspace admin on the smoke tenant.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "assign_workspace_to_capacity",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {},
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    capacityId: "SMOKE_POWERBI_CAPACITY_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_CAPACITY_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Assigns the smoke workspace to SMOKE_POWERBI_CAPACITY_ID. No unassign action exists in the integration — reverting requires the Power BI portal. Needs capacity admin/assign + workspace admin. Certification-run only.",
});
