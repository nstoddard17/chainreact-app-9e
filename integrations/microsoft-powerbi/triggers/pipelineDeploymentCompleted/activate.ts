import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { pipelineOperationsList } from "../../api/pipelines/pipelineOperationsList";
import { matchingOperations } from "../_shared/pollPipelineOperations";
import { mergeSeenIds } from "../_shared/snapshot";
import { PowerBiPipelineDeploymentCompletedConfigSchema } from "./schema";

/**
 * `pipeline_deployment_completed` activation hook — seeds the pipeline's
 * already-`Succeeded` operation ids so historical deployments are not
 * replayed. An operation still `NotStarted` / `Executing` is not seeded
 * and fires when it succeeds. Throws on seed failure
 * (→ TRIGGER_REGISTRATION_FAILED).
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const cfg = node.config as { pipelineId?: string };
  const parsed = PowerBiPipelineDeploymentCompletedConfigSchema.parse({
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
        matchingOperations(operations, "pipeline_deployment_completed").map(
          (o) => o.operationId,
        ),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
};
