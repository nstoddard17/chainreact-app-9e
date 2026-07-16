import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:get_pipeline_deployment_status`.
 * Mirrors `getPipelineDeploymentStatus.schema.ts` 1:1.
 */
export const microsoftPowerBiGetPipelineDeploymentStatusMeta: ActionMeta = {
  key: "microsoft-powerbi:get_pipeline_deployment_status",
  provider: "microsoft-powerbi",
  type: "get_pipeline_deployment_status",
  displayName: "Get Pipeline Deployment Status",
  description:
    "Fetch one deployment operation's status (NotStarted / Executing / Succeeded / Failed). Use it in a loop after Deploy All / Selectively Deploy to observe the async deployment's outcome.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pipelineId",
      label: "Deployment pipeline",
      description: "The deployment pipeline the operation belongs to.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipelines",
      placeholder: "Search pipelines…",
    },
    {
      name: "operationId",
      label: "Deployment operation",
      description:
        "The deployment operation to inspect — pick a recent operation, or insert the operationId output of a preceding deploy action.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipeline_operations",
      dependsOn: "pipelineId",
      allowManualEntry: true,
      placeholder: "Pick an operation or insert {{deployNode.operationId}}",
    },
  ],
  outputs: [
    {
      name: "status",
      type: "string",
      description:
        "Operation status: NotStarted, Executing, Succeeded, or Failed.",
    },
    {
      name: "executionStartTime",
      type: "string",
      description: "When execution started (ISO timestamp). Null until started.",
      nullable: true,
    },
    {
      name: "executionEndTime",
      type: "string",
      description: "When execution ended (ISO timestamp). Null until finished.",
      nullable: true,
    },
    {
      name: "sourceStageOrder",
      type: "number",
      description: "Source stage order. Null if the provider omitted it.",
      nullable: true,
    },
    {
      name: "targetStageOrder",
      type: "number",
      description: "Target stage order. Null if the provider omitted it.",
      nullable: true,
    },
    {
      name: "errorCode",
      type: "string",
      description:
        "First deployment-step error code when the operation failed (stable code only). Null when there is no error.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 520,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
