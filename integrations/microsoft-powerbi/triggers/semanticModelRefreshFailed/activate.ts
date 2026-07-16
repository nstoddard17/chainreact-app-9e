import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshesList } from "../../api/datasets/refreshesList";
import { matchingRefreshKeys } from "../_shared/pollSemanticModelRefreshes";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiSemanticModelRefreshFailedConfigSchema } from "./schema";

/**
 * `semantic_model_refresh_failed` activation hook — seeds the already-
 * `Failed` refresh request ids so historical failures are not replayed.
 * Throws on seed failure (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as {
    workspaceId?: string;
    semanticModelId?: string;
  };
  const parsed = PowerBiSemanticModelRefreshFailedConfigSchema.parse({
    workspaceId: cfg.workspaceId,
    semanticModelId: cfg.semanticModelId,
  });

  const { refreshes } = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-powerbi",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      refreshesList({
        accessToken,
        groupId: parsed.workspaceId,
        datasetId: parsed.semanticModelId,
        top: 20,
      }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      seenRequestIds: mergeSeenIds(
        [],
        matchingRefreshKeys(refreshes, "semantic_model_refresh_failed"),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
