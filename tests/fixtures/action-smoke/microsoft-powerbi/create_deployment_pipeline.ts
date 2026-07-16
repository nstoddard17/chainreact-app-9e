import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

/**
 * microsoft-powerbi:create_deployment_pipeline — creates a real (empty)
 * pipeline. liveSafe: the create is self-contained (no workspace/data
 * touched; stages unassigned), but Power BI pipelines have no smoke-
 * harness delete step wired here — MANUAL CLEANUP of the created
 * pipeline is required after a live run.
 */
export default defineActionSmokeFixture({
  provider: "microsoft-powerbi",
  action: "create_deployment_pipeline",
  risk: "write",
  liveSafe: true,
  liveRisk: "write",
  config: {
    displayName: "crsmoke pipeline - safe to delete",
    description:
      "ChainReact action-smoke fixture artifact. Safe to delete at any time.",
  },
  requiredEnv: ["SMOKE_MICROSOFT_POWERBI_CONNECTED"],
  expect: { outcome: "success" },
  notes:
    "Creates an empty 'crsmoke pipeline - safe to delete' deployment pipeline (no workspaces assigned, nothing deployed). MANUAL CLEANUP: delete the pipeline in the Power BI portal after the run.",
});
