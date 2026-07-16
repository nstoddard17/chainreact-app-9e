import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:get_semantic_model_refresh_details`.
 * Mirrors `getSemanticModelRefreshDetails.schema.ts` 1:1.
 */
export const microsoftPowerBiGetSemanticModelRefreshDetailsMeta: ActionMeta = {
  key: "microsoft-powerbi:get_semantic_model_refresh_details",
  provider: "microsoft-powerbi",
  type: "get_semantic_model_refresh_details",
  displayName: "Get Semantic Model Refresh Details",
  description:
    "Read the execution details of one refresh by its refresh request id. Only works for enhanced (API-started) refreshes — pair with Refresh Semantic Model's output.",
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
      description: "The semantic model (dataset) the refresh belongs to.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
    {
      name: "refreshRequestId",
      label: "Refresh request id",
      description:
        "The refresh request id to inspect — pick a recent refresh, or insert a variable from Refresh Semantic Model's refreshRequestId output. Only enhanced (API-started) refreshes have a request id.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_model_refreshes",
      dependsOn: ["workspaceId", "semanticModelId"],
      allowManualEntry: true,
      placeholder: "Pick a refresh or insert {{refreshNode.refreshRequestId}}",
    },
  ],
  outputs: [
    {
      name: "status",
      type: "string",
      description: "Unknown (in progress) | Completed | Failed | Disabled.",
    },
    {
      name: "extendedStatus",
      type: "string",
      description:
        "NotStarted | InProgress | Completed | TimedOut | Failed | Disabled | Cancelled, when reported.",
      nullable: true,
    },
    {
      name: "currentRefreshType",
      type: "string",
      description: "The refresh type in effect, when reported.",
      nullable: true,
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
      name: "commitMode",
      type: "string",
      description: "transactional | partialBatch, when reported.",
      nullable: true,
    },
    {
      name: "numberOfAttempts",
      type: "number",
      description: "Provider-side attempt count, when reported.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
