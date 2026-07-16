import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:semantic_model_refresh_failed`.
 *
 * Polling; fires once per refresh that reaches `Failed`, deduped on the
 * provider's `requestId`. `errorCode` is the stable code parsed out of
 * Power BI's `serviceExceptionJson` — the raw exception JSON (provider
 * internals) is never surfaced.
 */
export const microsoftPowerBiSemanticModelRefreshFailedTriggerMeta: TriggerMeta =
  {
    key: "microsoft-powerbi:semantic_model_refresh_failed",
    provider: "microsoft-powerbi",
    type: "semantic_model_refresh_failed",
    displayName: "Semantic Model Refresh Failed",
    description:
      "Fires when a refresh of the chosen semantic model (dataset) fails. Carries the Power BI error code.",
    category: "data",
    activation: "polling",
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
        description: "The semantic model (dataset) whose refreshes to watch.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:semantic_models",
        dependsOn: "workspaceId",
        placeholder: "Search semantic models…",
      },
    ],
    payloadShape: [
      { name: "workspaceId", type: "string", description: "Workspace the semantic model lives in." },
      { name: "semanticModelId", type: "string", description: "The semantic model whose refresh failed." },
      {
        name: "refreshRequestId",
        type: "string",
        description:
          "Power BI's refresh request id. Null for the rare portal-triggered refresh that reports no request id.",
        nullable: true,
      },
      {
        name: "refreshType",
        type: "string",
        description:
          "How the refresh was started: Scheduled, OnDemand, ViaApi, ViaEnhancedApi, ViaXmlaEndpoint, OnDemandTraining, or Unknown.",
      },
      { name: "status", type: "string", description: "Refresh status — always Failed for this trigger." },
      { name: "startTime", type: "string", description: "When the refresh started, or null.", nullable: true },
      { name: "endTime", type: "string", description: "When the refresh ended, or null.", nullable: true },
      {
        name: "errorCode",
        type: "string",
        description:
          "Power BI failure code (e.g. ModelRefreshFailed_CredentialsNotSpecified). Null when the provider reported no code.",
        nullable: true,
      },
    ],
    displayOrder: 20,
  };
