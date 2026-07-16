import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:get_semantic_model_refresh_history`.
 * Mirrors `getSemanticModelRefreshHistory.schema.ts` 1:1.
 */
export const microsoftPowerBiGetSemanticModelRefreshHistoryMeta: ActionMeta = {
  key: "microsoft-powerbi:get_semantic_model_refresh_history",
  provider: "microsoft-powerbi",
  type: "get_semantic_model_refresh_history",
  displayName: "Get Semantic Model Refresh History",
  description:
    "List recent refreshes of a semantic model (dataset) with status, timing, and failure error code. Power BI retains up to 60 entries over 7 days.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the semantic model.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "semanticModelId",
      label: "Semantic model",
      description: "The semantic model (dataset) whose refresh history to read.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "top",
      label: "Max entries",
      description:
        "How many history entries to return (1–100). Defaults to 20 when left empty.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true },
    },
  ],
  outputs: [
    {
      name: "refreshes",
      type: "array",
      description: "Refresh history entries (newest first).",
      fields: [
        {
          name: "refreshRequestId",
          type: "string",
          description: "Stable refresh request id, when Power BI provided one.",
          nullable: true,
        },
        {
          name: "refreshType",
          type: "string",
          description:
            "Scheduled | OnDemand | ViaApi | ViaEnhancedApi | ViaXmlaEndpoint | OnDemandTraining.",
        },
        {
          name: "status",
          type: "string",
          description:
            "Unknown (in progress) | Completed | Failed | Disabled | Cancelled.",
        },
        {
          name: "startTime",
          type: "string",
          description: "Refresh start time (ISO), when reported.",
          nullable: true,
        },
        {
          name: "endTime",
          type: "string",
          description: "Refresh end time (ISO); empty while still running.",
          nullable: true,
        },
        {
          name: "errorCode",
          type: "string",
          description:
            "Failure error code (e.g. ModelRefreshFailed_CredentialsNotSpecified), when the refresh failed.",
          nullable: true,
        },
      ],
    },
    {
      name: "count",
      type: "number",
      description: "Number of entries returned.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when more history exists beyond the returned page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
