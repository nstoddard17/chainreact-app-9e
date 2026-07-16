import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:cancel_dataflow_refresh`.
 * Mirrors `cancelDataflowRefresh.schema.ts` 1:1. `dataflowId` exists to
 * drive the transaction-picker cascade — the provider cancel URL itself
 * is keyed by transaction id only.
 */
export const microsoftPowerBiCancelDataflowRefreshMeta: ActionMeta = {
  key: "microsoft-powerbi:cancel_dataflow_refresh",
  provider: "microsoft-powerbi",
  type: "cancel_dataflow_refresh",
  displayName: "Cancel Dataflow Refresh",
  description:
    "Cancel an in-flight dataflow refresh transaction. The output state reports the disposition (e.g. SuccessfullyMarked, alreadyConcluded).",
  category: "data",
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
      description: "The dataflow whose refresh transaction to cancel.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:dataflows",
      dependsOn: "workspaceId",
      placeholder: "Search dataflows…",
    },
    {
      name: "transactionId",
      label: "Refresh transaction",
      description:
        "The refresh transaction to cancel — pick an in-progress transaction or paste/insert a transaction id from a history step.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:dataflow_transactions",
      dependsOn: ["workspaceId", "dataflowId"],
      allowManualEntry: true,
      placeholder: "Pick a transaction or insert {{node.transactionId}}",
    },
  ],
  outputs: [
    {
      name: "transactionId",
      type: "string",
      description: "The cancelled transaction id (echoed for chaining).",
    },
    {
      name: "state",
      type: "string",
      description:
        "Cancellation disposition from Power BI (e.g. SuccessfullyMarked, alreadyConcluded). Null if the provider omitted it.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 410,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Stops an in-flight dataflow refresh — downstream datasets may be left on stale data until the next refresh.",
};
