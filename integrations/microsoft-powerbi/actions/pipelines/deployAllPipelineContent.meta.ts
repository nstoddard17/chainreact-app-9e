import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:deploy_all_pipeline_content`.
 * Mirrors `deployAllPipelineContent.schema.ts` 1:1 (camelCase field names).
 */
export const microsoftPowerBiDeployAllPipelineContentMeta: ActionMeta = {
  key: "microsoft-powerbi:deploy_all_pipeline_content",
  provider: "microsoft-powerbi",
  type: "deploy_all_pipeline_content",
  displayName: "Deploy All Pipeline Content",
  description:
    "Deploy ALL content from a deployment-pipeline stage to the next stage. Returns an operation id — the deployment continues asynchronously; pair with Get Pipeline Deployment Status (in a loop) or the pipeline triggers to react to the outcome.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pipelineId",
      label: "Deployment pipeline",
      description: "The deployment pipeline to deploy in.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipelines",
      placeholder: "Search pipelines…",
    },
    {
      name: "sourceStageOrder",
      label: "Source stage",
      description:
        "The stage to deploy FROM. Content moves to the next stage (or the previous stage when backward deployment is on).",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipeline_stages",
      dependsOn: "pipelineId",
      placeholder: "Select the source stage…",
    },
    {
      name: "allowCreateArtifact",
      label: "Allow creating items in the target stage",
      description:
        "Whether the deploy may CREATE items that don't exist in the target stage yet. Required — the deploy fails if it needs to create and this is off.",
      type: "boolean",
      required: true,
    },
    {
      name: "allowOverwriteArtifact",
      label: "Allow overwriting items in the target stage",
      description:
        "Whether the deploy may OVERWRITE items that already exist in the target stage. Required — the deploy fails if it needs to overwrite and this is off.",
      type: "boolean",
      required: true,
    },
    {
      name: "isBackwardDeployment",
      label: "Backward deployment",
      description:
        "Deploy to the PREVIOUS stage instead of the next one (e.g. Test back to Development).",
      type: "boolean",
      required: false,
      advanced: true,
    },
    {
      name: "allowPurgeData",
      label: "Allow purging target data",
      description:
        "WARNING: lets Power BI WIPE data in the target stage when the incoming schema doesn't match (e.g. incremental-refresh policy changes). Target-stage data is lost and must be re-refreshed. Leave off unless you explicitly need it.",
      type: "boolean",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    {
      name: "operationId",
      type: "string",
      description:
        "Pipeline operation id — poll Get Pipeline Deployment Status with it.",
    },
    {
      name: "status",
      type: "string",
      description:
        "Initial operation status (usually NotStarted). Null if the provider omitted it.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 500,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Overwrites the target stage's content; with purge enabled it can wipe target data. Deployment continues async after this action returns.",
};
