import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:semantic_model_refresh_completed`.
 *
 * Polling (Power BI has no refresh webhook — research.md §3.6: the
 * supported detection path is the refresh-history endpoint). Fires once
 * per refresh that reaches `Completed`, deduped on the provider's
 * `requestId`. Refreshes that already completed before the workflow was
 * activated are not replayed.
 */
export const microsoftPowerBiSemanticModelRefreshCompletedTriggerMeta: TriggerMeta =
  {
    key: "microsoft-powerbi:semantic_model_refresh_completed",
    provider: "microsoft-powerbi",
    type: "semantic_model_refresh_completed",
    displayName: "Semantic Model Refresh Completed",
    description:
      "Fires when a refresh of the chosen semantic model (dataset) finishes successfully.",
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
      { name: "semanticModelId", type: "string", description: "The semantic model that refreshed." },
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
      { name: "status", type: "string", description: "Refresh status — always Completed for this trigger." },
      { name: "startTime", type: "string", description: "When the refresh started, or null.", nullable: true },
      { name: "endTime", type: "string", description: "When the refresh finished, or null.", nullable: true },
    ],
    displayOrder: 10,
  };
