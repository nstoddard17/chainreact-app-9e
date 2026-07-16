import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:get_pipeline_deployment_history`.
 * Mirrors `getPipelineDeploymentHistory.schema.ts` 1:1.
 */
export const microsoftPowerBiGetPipelineDeploymentHistoryMeta: ActionMeta = {
  key: "microsoft-powerbi:get_pipeline_deployment_history",
  provider: "microsoft-powerbi",
  type: "get_pipeline_deployment_history",
  displayName: "Get Pipeline Deployment History",
  description:
    "List a deployment pipeline's recent deploy operations (Power BI keeps the 20 most recent). One page — no pagination cursor.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pipelineId",
      label: "Deployment pipeline",
      description: "The deployment pipeline whose history to fetch.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipelines",
      placeholder: "Search pipelines…",
    },
    {
      name: "top",
      label: "Max operations",
      description:
        "Maximum operations to return (1–100, default 20). Power BI itself keeps only the 20 most recent.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true },
    },
  ],
  outputs: [
    {
      name: "operations",
      type: "array",
      description: "Recent deploy operations, newest first (provider order).",
      fields: [
        { name: "operationId", type: "string", description: "Operation id." },
        {
          name: "status",
          type: "string",
          description: "NotStarted, Executing, Succeeded, or Failed.",
        },
        {
          name: "executionStartTime",
          type: "string",
          description: "Execution start (ISO). Null until started.",
          nullable: true,
        },
        {
          name: "executionEndTime",
          type: "string",
          description: "Execution end (ISO). Null until finished.",
          nullable: true,
        },
        {
          name: "sourceStageOrder",
          type: "number",
          description: "Source stage order. Null if omitted.",
          nullable: true,
        },
        {
          name: "targetStageOrder",
          type: "number",
          description: "Target stage order. Null if omitted.",
          nullable: true,
        },
      ],
    },
    {
      name: "count",
      type: "number",
      description: "Number of operations returned.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 530,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
