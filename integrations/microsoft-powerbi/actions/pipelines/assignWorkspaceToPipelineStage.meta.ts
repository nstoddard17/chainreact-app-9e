import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:assign_workspace_to_pipeline_stage`.
 * Mirrors `assignWorkspaceToPipelineStage.schema.ts` 1:1.
 */
export const microsoftPowerBiAssignWorkspaceToPipelineStageMeta: ActionMeta = {
  key: "microsoft-powerbi:assign_workspace_to_pipeline_stage",
  provider: "microsoft-powerbi",
  type: "assign_workspace_to_pipeline_stage",
  displayName: "Assign Workspace to Pipeline Stage",
  description:
    "Assign a workspace to a deployment-pipeline stage. The stage must be unassigned, you must be an admin of the workspace, and the workspace must not belong to another pipeline.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pipelineId",
      label: "Deployment pipeline",
      description: "The deployment pipeline to assign the workspace in.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipelines",
      placeholder: "Search pipelines…",
    },
    {
      name: "stageOrder",
      label: "Stage",
      description: "The pipeline stage to assign the workspace to.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipeline_stages",
      dependsOn: "pipelineId",
      placeholder: "Select a stage…",
    },
    {
      name: "workspaceId",
      label: "Workspace",
      description:
        "The workspace to assign. You must be an admin of it, and it must be on a Premium/Fabric capacity to deploy.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
  ],
  outputs: [
    {
      name: "assigned",
      type: "boolean",
      description: "True — the assignment call succeeded.",
    },
    {
      name: "stageOrder",
      type: "number",
      description: "Stage order echoed for chaining.",
    },
    {
      name: "workspaceId",
      type: "string",
      description: "Workspace id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 540,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Links a workspace into a deployment pipeline; later deploys can then overwrite its content.",
};
