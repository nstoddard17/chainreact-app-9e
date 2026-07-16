import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:create_workspace — creates a real (V2) workspace.
 *
 * Live-safe in the "self-contained new resource" sense: the workspace is
 * new and touches nothing existing, but there is NO automated cleanup —
 * the created workspace must be deleted manually in the Power BI portal
 * after a live run. Name comes from SMOKE_POWERBI_NEW_WORKSPACE_NAME when
 * set, else the fixed literal below.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "create_workspace",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: {
    name:
      process.env.SMOKE_POWERBI_NEW_WORKSPACE_NAME ??
      "ChainReact Smoke Workspace",
  },
  requiredEnv: ["SMOKE_MICROSOFT_POWERBI_CONNECTED"],
  expect: { outcome: "success" },
  notes:
    "Creates a workspace named from SMOKE_POWERBI_NEW_WORKSPACE_NAME (or the literal 'ChainReact Smoke Workspace'). No automated cleanup — delete the workspace manually after a live run. Re-runs against an existing name fail provider-side (name conflict).",
});
