import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:dataflow_refresh_completed`.
 *
 * Polling on the dataflow's transaction list — the dataflow analogue of
 * refresh history (research.md §2.4). Fires once per transaction that
 * reaches the success state, deduped on the provider's transaction id.
 */
export const microsoftPowerBiDataflowRefreshCompletedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:dataflow_refresh_completed",
  provider: "microsoft-powerbi",
  type: "dataflow_refresh_completed",
  displayName: "Dataflow Refresh Completed",
  description:
    "Fires when a refresh of the chosen dataflow finishes successfully.",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the dataflow.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "dataflowId",
      label: "Dataflow",
      description: "The dataflow whose refreshes to watch.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:dataflows",
      dependsOn: "workspaceId",
      placeholder: "Search dataflows…",
    },
  ],
  payloadShape: [
    { name: "workspaceId", type: "string", description: "Workspace the dataflow lives in." },
    { name: "dataflowId", type: "string", description: "The dataflow that refreshed." },
    { name: "transactionId", type: "string", description: "Power BI's dataflow transaction id." },
    { name: "status", type: "string", description: "Transaction status as Power BI reports it." },
    { name: "startTime", type: "string", description: "When the refresh started, or null.", nullable: true },
    { name: "endTime", type: "string", description: "When the refresh finished, or null.", nullable: true },
    {
      name: "refreshType",
      type: "string",
      description: "How the refresh was started (e.g. OnDemand), or null.",
      nullable: true,
    },
  ],
  displayOrder: 40,
};
