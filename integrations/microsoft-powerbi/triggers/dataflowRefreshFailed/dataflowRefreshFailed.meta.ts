import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:dataflow_refresh_failed`.
 *
 * Polling on the dataflow's transaction list. Fires once per transaction
 * that reaches the failed state, deduped on the transaction id. The
 * transaction list carries no error detail, so no `errorCode` is
 * surfaced — pair with Get Dataflow Refresh History for detail.
 */
export const microsoftPowerBiDataflowRefreshFailedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:dataflow_refresh_failed",
  provider: "microsoft-powerbi",
  type: "dataflow_refresh_failed",
  displayName: "Dataflow Refresh Failed",
  description: "Fires when a refresh of the chosen dataflow fails.",
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
    { name: "dataflowId", type: "string", description: "The dataflow whose refresh failed." },
    { name: "transactionId", type: "string", description: "Power BI's dataflow transaction id." },
    { name: "status", type: "string", description: "Transaction status as Power BI reports it." },
    { name: "startTime", type: "string", description: "When the refresh started, or null.", nullable: true },
    { name: "endTime", type: "string", description: "When the refresh ended, or null.", nullable: true },
    {
      name: "refreshType",
      type: "string",
      description: "How the refresh was started (e.g. OnDemand), or null.",
      nullable: true,
    },
  ],
  displayOrder: 50,
};
