import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:unassign_workspace_from_pipeline_stage`.
 * Mirrors `unassignWorkspaceFromPipelineStage.schema.ts` 1:1.
 */
export const microsoftPowerBiUnassignWorkspaceFromPipelineStageMeta: ActionMeta =
  {
    key: "microsoft-powerbi:unassign_workspace_from_pipeline_stage",
    provider: "microsoft-powerbi",
    type: "unassign_workspace_from_pipeline_stage",
    displayName: "Unassign Workspace from Pipeline Stage",
    description:
      "Detach the workspace assigned to a deployment-pipeline stage. The workspace and its content are untouched — only the pipeline linkage is removed.",
    category: "data",
    requiresIntegration: true,
    fields: [
      {
        name: "pipelineId",
        label: "Deployment pipeline",
        description: "The deployment pipeline to unassign the workspace in.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:pipelines",
        placeholder: "Search pipelines…",
      },
      {
        name: "stageOrder",
        label: "Stage",
        description: "The pipeline stage whose workspace to detach.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:pipeline_stages",
        dependsOn: "pipelineId",
        placeholder: "Select a stage…",
      },
    ],
    outputs: [
      {
        name: "unassigned",
        type: "boolean",
        description: "True — the unassignment call succeeded.",
      },
      {
        name: "stageOrder",
        type: "number",
        description: "Stage order echoed for chaining.",
      },
    ],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 550,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "medium",
    riskDescription:
      "Breaks the stage's pipeline linkage (deploy comparisons stop working until reassigned); workspace content is untouched.",
  };
