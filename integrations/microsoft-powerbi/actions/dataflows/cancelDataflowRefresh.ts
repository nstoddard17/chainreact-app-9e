import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { dataflowTransactionCancel } from "../../api/dataflows/dataflowTransactionCancel";
import { CancelDataflowRefreshConfigSchema } from "./cancelDataflowRefresh.schema";

/**
 * Power BI `cancel_dataflow_refresh` action handler.
 *
 * Cancels an in-flight dataflow refresh transaction. The provider
 * response reports the cancellation disposition (`SuccessfullyMarked`,
 * `alreadyConcluded`, …) — surfaced as `state`.
 *
 * Output shape: { transactionId, state }
 */
export const cancelDataflowRefresh: ActionHandler = async (input) => {
  const config = CancelDataflowRefreshConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      dataflowTransactionCancel({
        accessToken,
        groupId: config.workspaceId,
        transactionId: config.transactionId,
      }),
  });

  return {
    output: {
      transactionId: result.transactionId ?? config.transactionId,
      state: result.status,
    },
  };
};
