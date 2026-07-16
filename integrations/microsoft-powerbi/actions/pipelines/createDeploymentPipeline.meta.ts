import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:create_deployment_pipeline`.
 * Mirrors `createDeploymentPipeline.schema.ts` 1:1.
 */
export const microsoftPowerBiCreateDeploymentPipelineMeta: ActionMeta = {
  key: "microsoft-powerbi:create_deployment_pipeline",
  provider: "microsoft-powerbi",
  type: "create_deployment_pipeline",
  displayName: "Create Deployment Pipeline",
  description:
    "Create an empty deployment pipeline. Chain Assign Workspace to Pipeline Stage to wire workspaces in — deploying requires the workspaces to be on Premium/Fabric capacity.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "displayName",
      label: "Pipeline name",
      description: "Display name for the new pipeline (max 256 characters).",
      type: "text",
      required: true,
      placeholder: "Sales BI pipeline",
    },
    {
      name: "description",
      label: "Description",
      description: "Optional description (max 1024 characters).",
      type: "textarea",
      required: false,
    },
  ],
  outputs: [
    {
      name: "pipelineId",
      type: "string",
      description: "Id of the created pipeline.",
    },
    {
      name: "displayName",
      type: "string",
      description: "Display name echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 560,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a real deployment pipeline in the tenant; usable only with Premium/Fabric-capacity workspaces.",
};
