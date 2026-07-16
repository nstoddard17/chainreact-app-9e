import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:pipeline_deployment_failed`.
 *
 * Polling on the pipeline's operation list. Fires once per deploy
 * operation that reaches `Failed`, deduped on the provider's operation id.
 * `errorCode` is the first failing step's stable code, read back from Get
 * Pipeline Operation (the operation LIST carries no error detail) — the
 * raw errorDetails blob is never surfaced.
 */
export const microsoftPowerBiPipelineDeploymentFailedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:pipeline_deployment_failed",
  provider: "microsoft-powerbi",
  type: "pipeline_deployment_failed",
  displayName: "Pipeline Deployment Failed",
  description:
    "Fires when a deployment on the chosen deployment pipeline fails. Carries the first failing step's Power BI error code.",
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
    { name: "status", type: "string", description: "Operation status — always Failed for this trigger." },
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
      description: "When the deployment ended, or null.",
      nullable: true,
    },
    {
      name: "errorCode",
      type: "string",
      description:
        "Error code of the first failing deployment step. Null when the provider reported no code.",
      nullable: true,
    },
  ],
  displayOrder: 100,
};
