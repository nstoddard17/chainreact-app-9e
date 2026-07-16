import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:pipeline_deployment_completed`.
 *
 * Polling on the pipeline's operation list (Power BI returns the 20 most
 * recent). Fires once per deploy operation that reaches `Succeeded`,
 * deduped on the provider's operation id. Deployment pipelines are
 * tenant-scoped, so no workspace is chosen here (research.md §2.5).
 */
export const microsoftPowerBiPipelineDeploymentCompletedTriggerMeta: TriggerMeta =
  {
    key: "microsoft-powerbi:pipeline_deployment_completed",
    provider: "microsoft-powerbi",
    type: "pipeline_deployment_completed",
    displayName: "Pipeline Deployment Completed",
    description:
      "Fires when a deployment on the chosen deployment pipeline finishes successfully.",
    category: "data",
    activation: "polling",
    requiresIntegration: true,
    fields: [
      {
        name: "pipelineId",
        label: "Deployment pipeline",
        description: "The deployment pipeline whose deployments to watch.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:pipelines",
        placeholder: "Search deployment pipelines…",
      },
    ],
    payloadShape: [
      { name: "pipelineId", type: "string", description: "The deployment pipeline that ran." },
      { name: "operationId", type: "string", description: "Power BI's deploy operation id." },
      { name: "status", type: "string", description: "Operation status — always Succeeded for this trigger." },
      {
        name: "sourceStageOrder",
        type: "number",
        description: "Stage deployed FROM (Development 0, Test 1, Production 2), or null.",
        nullable: true,
      },
      {
        name: "targetStageOrder",
        type: "number",
        description: "Stage deployed TO (Development 0, Test 1, Production 2), or null.",
        nullable: true,
      },
      {
        name: "executionStartTime",
        type: "string",
        description: "When the deployment started, or null.",
        nullable: true,
      },
      {
        name: "executionEndTime",
        type: "string",
        description: "When the deployment finished, or null.",
        nullable: true,
      },
    ],
    displayOrder: 90,
  };
