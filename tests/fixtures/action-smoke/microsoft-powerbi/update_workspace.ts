import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:update_workspace — PATCHes the smoke workspace.
 *
 * NOT liveSafe: it mutates the shared smoke workspace's metadata (a
 * description write is used so the workspace NAME other fixtures key on
 * never changes). Run deliberately during owner certification only.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "update_workspace",
  risk: "write",
  liveSafe: false,
  liveRisk: "write",
  config: {
    description: "ChainReact smoke workspace — description touched by smoke run.",
  },
  configFromEnv: {
    workspaceId: "SMOKE_POWERBI_WORKSPACE_ID",
  },
  requiredEnv: [
    "SMOKE_MICROSOFT_POWERBI_CONNECTED",
    "SMOKE_POWERBI_WORKSPACE_ID",
  ],
  expect: { outcome: "success" },
  notes:
    "Updates the smoke workspace's description (never its name — other fixtures depend on it). Mutates shared smoke state; certification-run only.",
});
