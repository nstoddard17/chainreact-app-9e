import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:semantic_model_refresh_canceled`.
 *
 * Polling; fires once per refresh that reaches the provider's `Cancelled`
 * state, deduped on the provider's `requestId`. The event type uses the
 * product's American spelling ("canceled") while the provider's wire
 * value is `Cancelled` — the reconciliation lives in the poll function,
 * so the event type stays a stable V2 identifier.
 *
 * Only enhanced refreshes can be cancelled via the API (research.md
 * §2.1); portal/scheduled refreshes never reach this state.
 */
export const microsoftPowerBiSemanticModelRefreshCanceledTriggerMeta: TriggerMeta =
  {
    key: "microsoft-powerbi:semantic_model_refresh_canceled",
    provider: "microsoft-powerbi",
    type: "semantic_model_refresh_canceled",
    displayName: "Semantic Model Refresh Canceled",
    description:
      "Fires when a refresh of the chosen semantic model (dataset) is cancelled. Applies to enhanced refreshes — Power BI cannot cancel scheduled or portal-started refreshes.",
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
      { name: "semanticModelId", type: "string", description: "The semantic model whose refresh was cancelled." },
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
      {
        name: "status",
        type: "string",
        description: "Refresh status as Power BI spells it — always Cancelled for this trigger.",
      },
      { name: "startTime", type: "string", description: "When the refresh started, or null.", nullable: true },
      { name: "endTime", type: "string", description: "When the refresh ended, or null.", nullable: true },
    ],
    displayOrder: 30,
  };
