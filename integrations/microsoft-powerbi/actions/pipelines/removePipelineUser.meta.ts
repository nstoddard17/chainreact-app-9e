import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:remove_pipeline_user`.
 * Mirrors `removePipelineUser.schema.ts` 1:1.
 */
export const microsoftPowerBiRemovePipelineUserMeta: ActionMeta = {
  key: "microsoft-powerbi:remove_pipeline_user",
  provider: "microsoft-powerbi",
  type: "remove_pipeline_user",
  displayName: "Remove Pipeline User",
  description:
    "Revoke a principal's access to a deployment pipeline. Workspace roles are untouched — only the pipeline permission is removed.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pipelineId",
      label: "Deployment pipeline",
      description: "The deployment pipeline to revoke access on.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipelines",
      placeholder: "Search pipelines…",
    },
    {
      name: "principalIdentifier",
      label: "Principal",
      description:
        "The principal to remove — pick from the pipeline's users, or enter the email/UPN (users) / object id (groups, apps) directly.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipeline_users",
      dependsOn: "pipelineId",
      allowManualEntry: true,
      placeholder: "Search pipeline users…",
    },
  ],
  outputs: [
    {
      name: "removed",
      type: "boolean",
      description: "True — the removal call succeeded.",
    },
    {
      name: "principalIdentifier",
      type: "string",
      description:
        "Removed principal identifier echoed for chaining (may be an email/UPN).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 590,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Revokes a principal's pipeline access — removing the last admin can lock the pipeline's management away from the team.",
};
