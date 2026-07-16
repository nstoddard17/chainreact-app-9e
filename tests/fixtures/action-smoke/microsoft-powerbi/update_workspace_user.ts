import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_workspace_user — re-asserts the smoke test
 * user's Viewer role on the smoke workspace (PUT with the same role is a
 * benign role write).
 *
 * NOT liveSafe: mutates a real principal's access. Requires the
 * add_workspace_user fixture to have granted the role first.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_workspace_user",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    principalType: "User",
    accessRight: "Viewer",
  },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
    principalEmail: "SMOKE_POWERBI_TEST_USER_EMAIL",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
    "SMOKE_POWERBI_TEST_USER_EMAIL",
  ],
  expect: { outcome: "success" },
  notes:
    "Re-asserts Viewer for SMOKE_POWERBI_TEST_USER_EMAIL on the smoke workspace (no role escalation). Needs the principal to already hold a role (run add_workspace_user first). Certification-run only.",
});
