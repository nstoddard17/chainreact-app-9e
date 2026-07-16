import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:get_dataflow_refresh_history`.
 * Mirrors `getDataflowRefreshHistory.schema.ts` 1:1.
 */
export const microsoftPowerBiGetDataflowRefreshHistoryMeta: ActionMeta = {
  key: "microsoft-powerbi:get_dataflow_refresh_history",
  provider: "microsoft-powerbi",
  type: "get_dataflow_refresh_history",
  displayName: "Get Dataflow Refresh History",
  description:
    "List a dataflow's refresh transactions (newest first) — start time, end time, and status. Use this to observe completion after Refresh Dataflow, which returns no refresh id.",
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
      description: "The dataflow whose refresh history to read.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:dataflows",
      dependsOn: "workspaceId",
      placeholder: "Search dataflows…",
    },
    {
      name: "top",
      label: "Max transactions",
      description:
        "Maximum number of transactions to return (1–100). Defaults to 20.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true },
    },
  ],
  outputs: [
    {
      name: "transactions",
      type: "array",
      description:
        "Refresh transactions, newest first. Each: {transactionId, refreshType, startTime, endTime, status} — the last four are null when the provider omits them (e.g. endTime while in progress).",
    },
    {
      name: "count",
      type: "number",
      description: "Number of transactions returned.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 420,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
