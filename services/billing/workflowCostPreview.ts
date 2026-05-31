import * as accountBillingRepo from "@/repositories/accountBilling";
import * as workflowsRepo from "@/repositories/workflows";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import {
  estimateWorkflowTaskCost,
  type CostWarning,
  type NodeCostBreakdown,
  type WorkflowCostEstimate,
} from "./workflowCostEstimator";

/**
 * Read-only workflow cost preview surface (Slice 4.COST-5).
 *
 * Wraps the COST-2 deterministic estimator in a compact, user-safe shape the
 * Builder UI, the future AI patch preview, future templates, and owner tools
 * can all request WITHOUT touching live billing. Pure + side-effect free:
 *   - no workflow mutation
 *   - no task deduction
 *   - no ledger writes
 *   - no provider / AI calls
 *
 * Redaction is by construction: the preview is built only from the
 * estimator's `NodeCostBreakdown` (node identity + registry metadata) — it
 * never reads or echoes `node.config`, so secrets cannot appear.
 */

export interface PreviewBillingSummary {
  tasksLimit: number;
  tasksUsed: number;
  tasksRemaining: number;
  /** True when ONE run at the estimate would exceed the user's remaining tasks. */
  wouldExceedCurrentRemaining: boolean;
}

export interface WorkflowCostPreview {
  workflowId: string;
  estimatedTasksPerRun: number;
  policyVersion: string;
  billableNodes: NodeCostBreakdown[];
  nonBillableNodes: NodeCostBreakdown[];
  unknownCostNodes: NodeCostBreakdown[];
  warnings: CostWarning[];
  nodeBreakdown: NodeCostBreakdown[];
  /** Present only when the caller's billing usage was available. */
  billing: PreviewBillingSummary | null;
  /** Always true — this is an estimate, never an actual charge. */
  isEstimate: true;
  /** User-safe caption. No internal billing-state language. */
  note: string;
}

const PREVIEW_NOTE =
  "Estimated workflow tasks per run. Actual usage may vary depending on which steps run.";

/**
 * Pure: fold an estimate (+ optional billing summary) into the preview shape.
 * Exported so the future AI patch preview can build a preview from a
 * candidate definition's estimate without re-loading the workflow.
 */
export function buildWorkflowCostPreview(input: {
  workflowId: string;
  estimate: WorkflowCostEstimate;
  billingSummary?: PreviewBillingSummary | null;
}): WorkflowCostPreview {
  const { workflowId, estimate, billingSummary } = input;
  return {
    workflowId,
    estimatedTasksPerRun: estimate.estimatedTasksPerRun,
    policyVersion: estimate.policyVersion,
    billableNodes: estimate.billableNodes,
    nonBillableNodes: estimate.nonBillableNodes,
    unknownCostNodes: estimate.unknownCostNodes,
    warnings: estimate.warnings,
    nodeBreakdown: estimate.nodeBreakdown,
    billing: billingSummary ?? null,
    isEstimate: true,
    note: PREVIEW_NOTE,
  };
}

/** Derive the billing summary for one run at the given estimate. */
export function buildBillingSummary(
  usage: { tasksLimit: number; tasksUsed: number },
  estimatedTasksPerRun: number,
): PreviewBillingSummary {
  const tasksRemaining = Math.max(0, usage.tasksLimit - usage.tasksUsed);
  return {
    tasksLimit: usage.tasksLimit,
    tasksUsed: usage.tasksUsed,
    tasksRemaining,
    wouldExceedCurrentRemaining: estimatedTasksPerRun > tasksRemaining,
  };
}

/**
 * Repository-backed preview: load the workflow (RLS-gated) + the caller's
 * billing usage, then build the preview. Returns `null` when the workflow
 * does not exist or is not in the caller's account (the route maps that to
 * 404).
 *
 * 4.ACCOUNT-MODEL-7: workflow ownership is account-based — resolve the
 * caller's account and require record.accountId to match.
 * 4.ACCOUNT-MODEL-9c: the billing read is now ACCOUNT-scoped
 * (`getUsage(record.accountId)`) — the workflow's owning account, which equals
 * the caller's personal account here. userId is used only to resolve/authorize
 * the account, never as a billing key.
 *
 * The billing summary is best-effort — if usage can't be read it is omitted
 * (`billing: null`) rather than failing the whole preview.
 */
export async function getWorkflowCostPreview(input: {
  workflowId: string;
  userId: string;
}): Promise<WorkflowCostPreview | null> {
  const record = await workflowsRepo.getById(input.workflowId);
  if (!record) return null;
  const account = await ensurePersonalAccount(input.userId);
  if (record.accountId !== account.id) return null;

  const estimate = estimateWorkflowTaskCost(record.draftDefinition);

  let billingSummary: PreviewBillingSummary | null = null;
  try {
    const usage = await accountBillingRepo.getUsage(record.accountId);
    if (usage) {
      billingSummary = buildBillingSummary(usage, estimate.estimatedTasksPerRun);
    }
  } catch {
    // Best-effort: a billing-read failure must not break the cost preview.
    billingSummary = null;
  }

  return buildWorkflowCostPreview({
    workflowId: input.workflowId,
    estimate,
    billingSummary,
  });
}
