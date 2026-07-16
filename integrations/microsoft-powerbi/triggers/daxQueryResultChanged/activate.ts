import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { executeQueries } from "../../api/datasets/executeQueries";
import { hashResultRows } from "../_shared/pollDax";
import { PowerBiDaxQueryResultChangedConfigSchema } from "./schema";

/**
 * `dax_query_result_changed` activation hook.
 *
 * Seeds the hash of the current bounded result before the first poll, so
 * the existing result is the baseline rather than a phantom "change". Uses
 * the same slice + hash path as the poller — a divergence here would fire
 * a spurious event on the first tick.
 *
 * Throws on seed failure → TRIGGER_REGISTRATION_FAILED (never swallowed).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const config = node.config as Record<string, unknown>;
  const parsed = PowerBiDaxQueryResultChangedConfigSchema.parse({
    workspaceId: config.workspaceId,
    semanticModelId: config.semanticModelId,
    daxQuery: config.daxQuery,
    maxRows: config.maxRows,
  });

  const result = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-powerbi",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      executeQueries({
        accessToken,
        groupId: parsed.workspaceId,
        datasetId: parsed.semanticModelId,
        daxQuery: parsed.daxQuery,
      }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      resultHash: hashResultRows(result.rows.slice(0, parsed.maxRows)),
      updatedAt: new Date().toISOString(),
    },
  };
};
