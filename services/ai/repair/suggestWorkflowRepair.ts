/**
 * Failed-run repair proposal service (Slice 4.AI-7).
 *
 * Deterministic + READ-ONLY. Inspects a failed run, classifies the failure,
 * and — only when safe — proposes a `WorkflowPatch` that is run through AI-5
 * preview. It NEVER calls a model, NEVER applies (no AI-6 import), NEVER
 * mutates a workflow, and NEVER invents config values / providers / actions /
 * fields. Auth + billing failures become recommendations, not patches.
 *
 * Pipeline: read run (ownership) → if not failed, done → load graph +
 * validation (AI-2) → classify into one category → build a StrategyOutcome →
 * if it proposes operations, build a patch + run AI-5 preview (downgrade to
 * noSafeRepair when the preview rejects it) → assemble a value-free suggestion.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §3/§8.
 */

import { getById as getRunById } from "@/repositories/workflowRuns";
import {
  getWorkflowGraphForAI,
  getWorkflowValidationStateForAI,
} from "@/services/ai/tools/workflowContext";
import { previewWorkflowPatchForAI } from "@/services/ai/preview";
import type { WorkflowPatch } from "@/services/workflows/patch/types";
import type { PatchPreviewResult } from "@/services/ai/preview/types";
import {
  billingOutcome,
  buildEdgeRepairOutcome,
  buildMissingFieldOutcome,
  buildVariableRepairOutcome,
  disconnectedOutcome,
  downstreamReferenceOutcome,
  missingTriggerOutcome,
  noDeterministicRepairOutcome,
  runNotFailedOutcome,
  unknownNodeOutcome,
} from "./repairStrategies";
import type {
  RepairFailureSummary,
  RepairSuggestionResult,
  RepairSuggestionSuccess,
  StrategyOutcome,
  SuggestWorkflowRepairInput,
} from "./types";

/** Engine/handler codes that mean "the integration needs to be reconnected". */
const AUTH_ERROR_CODES = new Set([
  "invalid_auth",
  "token_revoked",
  "not_authed",
  "account_inactive",
  "invalid_grant",
  "unauthorized",
]);

function notFound(message: string): RepairSuggestionResult {
  return { ok: false, code: "NOT_FOUND", message, noMutation: true };
}

export async function suggestWorkflowRepairForAI(
  input: SuggestWorkflowRepairInput,
): Promise<RepairSuggestionResult> {
  const { userId, workflowId, workflowRunId } = input;

  // 1. Read the run; enforce ownership + workflow match (no existence leak).
  let run;
  try {
    run = await getRunById(workflowRunId);
  } catch {
    return { ok: false, code: "READ_FAILED", message: "Couldn't read the workflow run.", noMutation: true };
  }
  if (!run || run.userId !== userId || run.workflowId !== workflowId) {
    return notFound(`No workflow run '${workflowRunId}'.`);
  }

  const failedStep = run.steps.find((s) => s.status === "failed");
  const primaryErrorCode = failedStep?.error?.code ?? run.fatalError?.code ?? null;
  const failedNodeId = failedStep?.nodeId ?? null;
  const cls = run.errorClassification;

  const failureSummary: RepairFailureSummary = {
    failed: run.status === "failed",
    status: run.status,
    isTest: run.isTest,
    failedNodeId,
    errorCode: primaryErrorCode,
    classification: cls
      ? {
          title: cls.title,
          description: cls.description,
          ...(cls.hint !== undefined ? { hint: cls.hint } : {}),
          ...(cls.action !== undefined ? { action: cls.action } : {}),
          severity: cls.severity,
        }
      : null,
  };

  // 2. Nothing to repair on a non-failed run.
  if (run.status !== "failed") {
    return assemble(workflowId, workflowRunId, failureSummary, runNotFailedOutcome());
  }

  // 3. Load current graph (ownership re-enforced by AI-2) + validation.
  const graphRes = await getWorkflowGraphForAI(userId, workflowId);
  if (!graphRes.ok) {
    return graphRes.code === "NOT_FOUND"
      ? notFound(`No workflow '${workflowId}'.`)
      : { ok: false, code: "READ_FAILED", message: "Couldn't read the workflow.", noMutation: true };
  }
  const graph = graphRes.data;
  const validationRes = await getWorkflowValidationStateForAI(userId, workflowId);
  const issues = validationRes.ok ? validationRes.data.issues : [];
  const has = (code: string) => issues.some((i) => i.code === code);
  const failedNodeProvider = failedNodeId
    ? graph.nodes.find((n) => n.id === failedNodeId)?.provider ?? null
    : null;

  // 4. Classify into exactly one category (priority order).
  let outcome: StrategyOutcome;
  if (cls?.action === "reconnect" || has("INTEGRATION_NOT_CONNECTED") || AUTH_ERROR_CODES.has(primaryErrorCode ?? "")) {
    outcome = disconnectedOutcome(failedNodeProvider);
  } else if (primaryErrorCode === "MISSING_HANDLER" || has("UNKNOWN_NODE_TYPE")) {
    outcome = unknownNodeOutcome();
  } else if (primaryErrorCode === "BILLING_EXHAUSTED" || cls?.action === "upgrade_plan") {
    outcome = billingOutcome();
  } else if (has("MISSING_REQUIRED_FIELD")) {
    outcome = buildMissingFieldOutcome(graph, issues.filter((i) => i.code === "MISSING_REQUIRED_FIELD"));
  } else if (primaryErrorCode === "MISSING_VARIABLE" || has("INVALID_VARIABLE_REFERENCE")) {
    outcome = await buildVariableRepairOutcome(userId, workflowId, graph, failedNodeId);
  } else if (has("DOWNSTREAM_VARIABLE_REFERENCE")) {
    outcome = downstreamReferenceOutcome();
  } else {
    const edgeOutcome = buildEdgeRepairOutcome(graph);
    if (edgeOutcome) {
      outcome = edgeOutcome;
    } else if (has("EMPTY_WORKFLOW") || !graph.nodes.some((n) => n.kind === "trigger")) {
      outcome = missingTriggerOutcome();
    } else {
      outcome = noDeterministicRepairOutcome();
    }
  }

  // 5. If the strategy proposed operations, build a patch + run AI-5 preview.
  if (outcome.operations.length === 0) {
    return assemble(workflowId, workflowRunId, failureSummary, outcome);
  }

  const patch: WorkflowPatch = {
    patchId: `repair:${workflowRunId}`,
    workflowId,
    baseRevision: graph.updatedAt, // AI-5/AI-6 revision-token contract
    operations: [...outcome.operations],
    summary: `Repair proposal (${outcome.reasonCode})`,
    rationale: outcome.recommendations[0] ?? "Deterministic repair proposal.",
  };

  const previewRes = await previewWorkflowPatchForAI({ userId, workflowId, patch });
  const safetyNotes = [...outcome.safetyNotes];

  if (!previewRes.ok || !previewRes.data.ok) {
    // The proposed patch did not validate — never surface it as applyable.
    if (previewRes.ok && previewRes.data.blockedReason) {
      safetyNotes.push(`Preview rejected the repair: ${previewRes.data.blockedReason}`);
    } else if (!previewRes.ok) {
      safetyNotes.push("The repair patch could not be previewed.");
    }
    return assemble(workflowId, workflowRunId, failureSummary, {
      ...outcome,
      repairability: "noSafeRepair",
      reasonCode: "FAILED_PREVIEW",
      operations: [],
      safetyNotes,
    });
  }

  const preview: PatchPreviewResult = previewRes.data;
  if (preview.requiresConfirmation) {
    safetyNotes.push("Applying this repair requires explicit confirmation.");
  }

  return assemble(
    workflowId,
    workflowRunId,
    failureSummary,
    { ...outcome, safetyNotes },
    patch,
    preview,
  );
}

function assemble(
  workflowId: string,
  workflowRunId: string,
  failureSummary: RepairFailureSummary,
  outcome: StrategyOutcome,
  proposedPatch?: WorkflowPatch,
  preview?: PatchPreviewResult,
): RepairSuggestionSuccess {
  return {
    ok: true,
    workflowId,
    workflowRunId,
    failureSummary,
    repairability: outcome.repairability,
    reasonCode: outcome.reasonCode,
    ...(proposedPatch ? { proposedPatch } : {}),
    ...(preview ? { preview } : {}),
    requiredUserInput: [...outcome.requiredUserInput],
    recommendations: [...outcome.recommendations],
    confidence: outcome.confidence,
    safetyNotes: [...outcome.safetyNotes],
    noMutation: true,
  };
}
