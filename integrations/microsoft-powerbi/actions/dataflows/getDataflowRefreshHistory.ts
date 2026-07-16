import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { dataflowTransactionsList } from "../../api/dataflows/dataflowTransactionsList";
import { GetDataflowRefreshHistoryConfigSchema } from "./getDataflowRefreshHistory.schema";

/**
 * Power BI `get_dataflow_refresh_history` action handler.
 *
 * Lists a dataflow's refresh transactions (newest first) — the way to
 * observe completion after `refresh_dataflow`, which returns no refresh
 * id. Single page (client-side bound; wrapper default 20).
 *
 * Output shape:
 *   { transactions: [{transactionId, refreshType, startTime, endTime,
 *     status}], count }
 */
export const getDataflowRefreshHistory: ActionHandler = async (input) => {
  const config = GetDataflowRefreshHistoryConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      dataflowTransactionsList({
        accessToken,
        groupId: config.workspaceId,
        dataflowId: config.dataflowId,
        top: config.top,
      }),
  });

  const transactions = result.transactions.map((t) => ({
    transactionId: t.id,
    refreshType: t.refreshType,
    startTime: t.startTime,
    endTime: t.endTime,
    status: t.status,
  }));

  return {
    output: {
      transactions,
      count: transactions.length,
    },
  };
};
