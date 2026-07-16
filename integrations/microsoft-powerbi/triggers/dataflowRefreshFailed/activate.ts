import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { dataflowTransactionsList } from "../../api/dataflows/dataflowTransactionsList";
import { matchingTransactions } from "../_shared/pollDataflowTransactions";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiDataflowRefreshFailedConfigSchema } from "./schema";

/**
 * `dataflow_refresh_failed` activation hook — seeds the dataflow
 * transaction ids already in the failed state so historical failures are
 * not replayed. Throws on seed failure (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as { workspaceId?: string; dataflowId?: string };
  const parsed = PowerBiDataflowRefreshFailedConfigSchema.parse({
    workspaceId: cfg.workspaceId,
    dataflowId: cfg.dataflowId,
  });

  const { transactions } = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-powerbi",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      dataflowTransactionsList({
        accessToken,
        groupId: parsed.workspaceId,
        dataflowId: parsed.dataflowId,
        top: 20,
      }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      seenTransactionIds: mergeSeenIds(
        [],
        matchingTransactions(transactions, "dataflow_refresh_failed").map(
          (t) => t.id,
        ),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
