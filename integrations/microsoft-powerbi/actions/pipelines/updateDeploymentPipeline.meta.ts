import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:update_deployment_pipeline`.
 * Mirrors `updateDeploymentPipeline.schema.ts` 1:1 (runtime refinement:
 * at least one of displayName / description must be provided).
 */
export const microsoftPowerBiUpdateDeploymentPipelineMeta: ActionMeta = {
  key: "microsoft-powerbi:update_deployment_pipeline",
  provider: "microsoft-powerbi",
  type: "update_deployment_pipeline",
  displayName: "Update Deployment Pipeline",
  description:
    "Rename a deployment pipeline and/or change its description. Provide at least one of the two.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pipelineId",
      label: "Deployment pipeline",
      description: "The deployment pipeline to update.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipelines",
      placeholder: "Search pipelines…",
    },
    {
      name: "displayName",
      label: "New pipeline name",
      description: "New display name (max 256 characters).",
      type: "text",
      required: false,
    },
    {
      name: "description",
      label: "New description",
      description: "New description (max 1024 characters).",
      type: "textarea",
      required: false,
    },
  ],
  outputs: [
    {
      name: "updated",
      type: "boolean",
      description: "True — the update call succeeded.",
    },
    {
      name: "pipelineId",
      type: "string",
      description: "Pipeline id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 570,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Renames/redescribes a shared pipeline (recoverable).",
};
