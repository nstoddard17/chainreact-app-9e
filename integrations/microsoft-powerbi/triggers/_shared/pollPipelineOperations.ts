import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  pipelineOperationsList,
  type PipelineOperationSummary,
} from "../../api/pipelines/pipelineOperationsList";
import { pipelineOperationGet } from "../../api/pipelines/pipelineOperationGet";
import { mergeSeenIds } from "./snapshot";
import { PowerBiPipelineDeploymentCompletedConfigSchema } from "../pipelineDeploymentCompleted/schema";
import { PowerBiPipelineDeploymentFailedConfigSchema } from "../pipelineDeploymentFailed/schema";
import {
  emitEvent,
  persistSnapshot,
  statusEquals,
  warnMissingSnapshot,
  type PowerBiPollInput,
} from "./pollShared";

/**
 * The deployment-pipeline domain: the two `pipeline_deployment_*` triggers'
 * status predicate and their single poll function.
 *
 * `matchingOperations` is exported because activation and polling MUST
 * agree on what "matches this trigger" means — `activate.ts` seeds the
 * snapshot with exactly the operation ids this poll function would emit
 * for, so a divergence would either replay history on the first tick or
 * swallow it.
 *
 * Diff shape and snapshot contract mirror the sibling job-lifecycle
 * modules (see `pollSemanticModelRefreshes.ts` for the full rationale):
 * only ids that ALREADY matched the terminal status enter the snapshot, so
 * an in-flight deployment still fires when it settles.
 */

export type PipelineDeploymentEventType =
  | "pipeline_deployment_completed"
  | "pipeline_deployment_failed";

/** Terminal `PipelineOperation.status` each pipeline trigger watches for (research.md §2.5). */
const PIPELINE_TARGET_STATUS: Record<PipelineDeploymentEventType, string> = {
  pipeline_deployment_completed: "Succeeded",
  pipeline_deployment_failed: "Failed",
};

/** Pipeline operations in this trigger's terminal status, newest first. */
export function matchingOperations(
  operations: readonly PipelineOperationSummary[],
  eventType: PipelineDeploymentEventType,
): PipelineOperationSummary[] {
  const target = PIPELINE_TARGET_STATUS[eventType];
  return operations.filter((o) => statusEquals(o.status, target));
}

const PIPELINE_SCHEMAS = {
  pipeline_deployment_completed:
    PowerBiPipelineDeploymentCompletedConfigSchema,
  pipeline_deployment_failed: PowerBiPipelineDeploymentFailedConfigSchema,
} as const;

export async function pollPipelineOperations(
  input: PowerBiPollInput & { eventType: PipelineDeploymentEventType },
): Promise<void> {
  const { trigger, providerAccountId, now, eventType } = input;
  const config = PIPELINE_SCHEMAS[eventType].parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, eventType);
    return;
  }

  const operations = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      pipelineOperationsList({ accessToken, pipelineId: config.pipelineId }),
  });

  const matching = matchingOperations(operations, eventType);
  const seen = new Set(config.snapshot.seenOperationIds);

  for (const operation of matching) {
    if (seen.has(operation.operationId)) continue;
    seen.add(operation.operationId);

    const payload: Record<string, unknown> = {
      pipelineId: config.pipelineId,
      operationId: operation.operationId,
      status: operation.status,
      sourceStageOrder: operation.sourceStageOrder,
      targetStageOrder: operation.targetStageOrder,
      executionStartTime: operation.executionStartTime,
      executionEndTime: operation.executionEndTime,
    };

    // NOTE: Get Pipeline Operations returns no error information — the
    // per-step `executionPlan.steps[].error.errorCode` only exists on Get
    // Pipeline Operation (research.md §2.5). The failure trigger therefore
    // reads back each NEWLY-failed operation once; the completed trigger
    // never pays for this call. The wrapper surfaces only the first
    // stable errorCode, never the raw errorDetails blob.
    if (eventType === "pipeline_deployment_failed") {
      const detail = await refreshAndRetry({
        accountId: trigger.workflowAccountId!,
        provider: "microsoft-powerbi",
        providerAccountId,
        apiCall: (accessToken) =>
          pipelineOperationGet({
            accessToken,
            pipelineId: config.pipelineId,
            operationId: operation.operationId,
          }),
      });
      payload.errorCode = detail.errorCode;
    }

    await emitEvent({
      trigger,
      providerAccountId,
      eventType,
      key: operation.operationId,
      payload,
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: {
      seenOperationIds: mergeSeenIds(
        config.snapshot.seenOperationIds,
        matching.map((o) => o.operationId),
      ),
      updatedAt: new Date().toISOString(),
    },
    now,
  });
}
