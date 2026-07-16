import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { executeQueries } from "../../api/datasets/executeQueries";
import { evaluateCondition, extractScalar } from "../_shared/pollDax";
import { PowerBiDaxConditionMetConfigSchema } from "./schema";

/**
 * `dax_condition_met` activation hook.
 *
 * Seeds the condition's CURRENT truth value before the first poll runs, so
 * a condition that is already true at activation time is not replayed —
 * the trigger only fires on a later false→true transition. Seeding through
 * the same `executeQueries` + `evaluateCondition` path the poller uses
 * guarantees the baseline and the first diff are computed identically.
 *
 * Throws on seed failure (bad DAX, missing Build permission, disabled
 * tenant setting) → TRIGGER_REGISTRATION_FAILED. Never swallowed: a
 * silent seed failure is V1's "first poll miss" bug.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const config = node.config as Record<string, unknown>;
  const parsed = PowerBiDaxConditionMetConfigSchema.parse({
    workspaceId: config.workspaceId,
    semanticModelId: config.semanticModelId,
    daxQuery: config.daxQuery,
    operator: config.operator,
    threshold: config.threshold,
    ...(config.impersonatedUserName !== undefined
      ? { impersonatedUserName: config.impersonatedUserName }
      : {}),
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
        ...(parsed.impersonatedUserName !== undefined
          ? { impersonatedUserName: parsed.impersonatedUserName }
          : {}),
        daxQuery: parsed.daxQuery,
      }),
  });

  const lastConditionMet = evaluateCondition({
    value: extractScalar(result.rows),
    operator: parsed.operator,
    threshold: parsed.threshold,
  });

  return {
    pollingEnabled: true,
    snapshot: { lastConditionMet, updatedAt: new Date().toISOString() },
  };
};
