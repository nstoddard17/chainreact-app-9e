import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshesList } from "../../api/datasets/refreshesList";
import { matchingRefreshKeys } from "../_shared/pollSemanticModelRefreshes";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiSemanticModelRefreshCanceledConfigSchema } from "./schema";

/**
 * `semantic_model_refresh_canceled` activation hook — seeds the refresh
 * request ids already in the provider's `Cancelled` state so historical
 * cancellations are not replayed. Throws on seed failure
 * (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as {
    workspaceId?: string;
    semanticModelId?: string;
  };
  const parsed = PowerBiSemanticModelRefreshCanceledConfigSchema.parse({
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
        matchingRefreshKeys(refreshes, "semantic_model_refresh_canceled"),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
