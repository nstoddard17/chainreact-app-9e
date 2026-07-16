import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { refreshesList } from "../../api/datasets/refreshesList";
import { matchingRefreshKeys } from "../_shared/pollSemanticModelRefreshes";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiSemanticModelRefreshCompletedConfigSchema } from "./schema";

/**
 * `semantic_model_refresh_completed` activation hook.
 *
 * Seeds the already-`Completed` refresh request ids BEFORE the first poll
 * so pre-existing refreshes are never replayed and the first poll after
 * activation emits zero events. A refresh still in flight is NOT seeded —
 * it isn't `Completed` yet, so it correctly fires when it finishes.
 *
 * Throws on seed failure (→ TRIGGER_REGISTRATION_FAILED). Swallowing it
 * would leave the trigger without a baseline and silently drop every
 * refresh that completed before the first successful poll.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as {
    workspaceId?: string;
    semanticModelId?: string;
  };
  const parsed = PowerBiSemanticModelRefreshCompletedConfigSchema.parse({
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
        matchingRefreshKeys(refreshes, "semantic_model_refresh_completed"),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
