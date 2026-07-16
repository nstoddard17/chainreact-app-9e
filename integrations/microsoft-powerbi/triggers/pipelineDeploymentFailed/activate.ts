import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { pipelineOperationsList } from "../../api/pipelines/pipelineOperationsList";
import { matchingOperations } from "../_shared/pollPipelineOperations";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiPipelineDeploymentFailedConfigSchema } from "./schema";

/**
 * `pipeline_deployment_failed` activation hook — seeds the pipeline's
 * already-`Failed` operation ids so historical failures are not replayed.
 * Throws on seed failure (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as { pipelineId?: string };
  const parsed = PowerBiPipelineDeploymentFailedConfigSchema.parse({
    pipelineId: cfg.pipelineId,
  });

  const operations = await refreshAndRetry({
    accountId: integration.accountId,
    provider: "microsoft-powerbi",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      pipelineOperationsList({ accessToken, pipelineId: parsed.pipelineId }),
  });

  return {
    pollingEnabled: true,
    snapshot: {
      seenOperationIds: mergeSeenIds(
        [],
        matchingOperations(operations, "pipeline_deployment_failed").map(
          (o) => o.operationId,
        ),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
