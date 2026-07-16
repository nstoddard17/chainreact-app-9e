import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { dataflowTransactionsList } from "../../api/dataflows/dataflowTransactionsList";
import { matchingTransactions } from "../_shared/pollDataflowTransactions";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiDataflowRefreshCompletedConfigSchema } from "./schema";

/**
 * `dataflow_refresh_completed` activation hook — seeds the dataflow
 * transaction ids already in the success state so historical refreshes
 * are not replayed. An in-flight transaction is not seeded and fires when
 * it succeeds. Throws on seed failure (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as { workspaceId?: string; dataflowId?: string };
  const parsed = PowerBiDataflowRefreshCompletedConfigSchema.parse({
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
        matchingTransactions(transactions, "dataflow_refresh_completed").map(
          (t) => t.id,
        ),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
