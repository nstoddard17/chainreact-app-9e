import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:cancel_semantic_model_refresh`.
 * Mirrors `cancelSemanticModelRefresh.schema.ts` 1:1 (camelCase field names).
 */
export const microsoftPowerBiCancelSemanticModelRefreshMeta: ActionMeta = {
  key: "microsoft-powerbi:cancel_semantic_model_refresh",
  provider: "microsoft-powerbi",
  type: "cancel_semantic_model_refresh",
  displayName: "Cancel Semantic Model Refresh",
  description:
    "Cancel an in-flight refresh of a semantic model by its refresh request id. Only works for enhanced (API-started) refreshes — standard and scheduled refreshes can't be canceled.",
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
      description: "The semantic model (dataset) whose refresh to cancel.",
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
        "The refresh request id to cancel — pick a recent refresh, or insert a variable from Refresh Semantic Model's refreshRequestId output. Only enhanced (API-started) refreshes have a request id and can be canceled.",
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
      name: "canceled",
      type: "boolean",
      description: "True when Power BI accepted the cancellation.",
    },
    {
      name: "refreshRequestId",
      type: "string",
      description: "Refresh request id echoed for chaining.",
    },
    {
      name: "semanticModelId",
      type: "string",
      description: "Semantic model id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Stops an in-flight refresh — downstream consumers keep seeing the previous data version.",
};
