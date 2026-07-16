import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:add_or_update_pipeline_user`.
 * Mirrors `addOrUpdatePipelineUser.schema.ts` 1:1.
 *
 * `accessRight` offers EXACTLY the documented PipelineUserAccessRight
 * set — a single value, Admin.
 */
export const microsoftPowerBiAddOrUpdatePipelineUserMeta: ActionMeta = {
  key: "microsoft-powerbi:add_or_update_pipeline_user",
  provider: "microsoft-powerbi",
  type: "add_or_update_pipeline_user",
  displayName: "Add or Update Pipeline User",
  description:
    "Grant a user, group, or app access to a deployment pipeline. Power BI pipelines have a single documented access right: Admin.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pipelineId",
      label: "Deployment pipeline",
      description: "The deployment pipeline to grant access to.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:pipelines",
      placeholder: "Search pipelines…",
    },
    {
      name: "principalIdentifier",
      label: "Principal",
      description:
        "Email/UPN for a user; Azure AD object id for a group or app.",
      type: "text",
      required: true,
      placeholder: "user@contoso.com or object id",
    },
    {
      name: "principalType",
      label: "Principal type",
      description: "What kind of principal the identifier names.",
      type: "select",
      required: true,
      options: [
        { value: "User", label: "User" },
        { value: "Group", label: "Group" },
        { value: "App", label: "App (service principal)" },
      ],
    },
    {
      name: "accessRight",
      label: "Access right",
      description:
        "Pipeline access right. Admin is the only right Power BI pipelines support.",
      type: "select",
      required: true,
      options: [{ value: "Admin", label: "Admin" }],
    },
  ],
  outputs: [
    {
      name: "granted",
      type: "boolean",
      description: "True — the grant call succeeded.",
    },
    {
      name: "principalIdentifier",
      type: "string",
      description:
        "Granted principal identifier echoed for chaining (may be an email/UPN).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 580,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Grants pipeline Admin access — the principal can deploy and manage the pipeline.",
};
