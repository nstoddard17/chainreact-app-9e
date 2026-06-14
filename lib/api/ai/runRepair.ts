/**
 * AI-13 failed-run repair client (POST /api/workflows/[id]/runs/[runId]/ai/repair).
 * Extracted from the monolithic `lib/api/ai.ts` in Slice 4.AI-REPAIR-CLEANUP-1 —
 * refactor only, no behavior change.
 *
 * Client-side view of the AI-7 service's `RepairSuggestionResult`. Like
 * `proposedPatch` on the plan response, the repair patch is treated as OPAQUE by
 * the client — the Builder forwards it verbatim to the existing apply route
 * (`applyWorkflowPatch`) on confirmation, never inspects its config.
 *
 * Fields here mirror the route response (value-free recommendations + a preview's
 * structural summary). Extra fields the server adds in the future are tolerated.
 */

import { postStructured, type AiOpaquePatch } from "./shared";
import type { AiPreview } from "./plan";

export interface AiRepairFailureSummary {
  readonly failed: boolean;
  readonly status: "succeeded" | "failed";
  readonly isTest: boolean;
  readonly failedNodeId: string | null;
  readonly errorCode: string | null;
  readonly classification: {
    readonly title: string;
    readonly description: string;
    readonly hint?: string;
    readonly action?: "reconnect" | "open_node" | "upgrade_plan";
    readonly severity: "warning" | "error";
  } | null;
}

export type AiRepairability = "repairable" | "needsUserInput" | "noSafeRepair";

export interface AiRepairRequiredUserInput {
  readonly nodeId: string;
  readonly field?: string;
  readonly label: string;
  readonly kind: "config_value" | "select_integration" | "choose_trigger" | "variable_reference";
}

export interface AiRepairSuccess {
  readonly ok: true;
  readonly workflowId: string;
  readonly workflowRunId: string;
  readonly failureSummary: AiRepairFailureSummary;
  readonly repairability: AiRepairability;
  /** Categorical reason (e.g. MISSING_REQUIRED_FIELD, DISCONNECTED_INTEGRATION). */
  readonly reasonCode: string;
  /** Opaque to the client — forwarded to `applyWorkflowPatch` on confirm. */
  readonly proposedPatch?: AiOpaquePatch;
  readonly preview?: AiPreview;
  readonly requiredUserInput: readonly AiRepairRequiredUserInput[];
  readonly recommendations: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly safetyNotes: readonly string[];
}

export interface AiRepairFailure {
  readonly ok: false;
  /** NOT_FOUND | READ_FAILED — surface error shape from the service. */
  readonly code: string;
  readonly message: string;
}

export type AiRepairResult = AiRepairSuccess | AiRepairFailure;

/** Forward-compat: empty body is accepted; fields below are ignored at AI-13. */
export interface RequestWorkflowRepairRequest {
  readonly repairPrompt?: string;
  readonly modelTier?: "fast" | "strong";
  readonly selectedNodeId?: string;
}

export async function requestWorkflowRepair(
  workflowId: string,
  runId: string,
  request: RequestWorkflowRepairRequest = {},
): Promise<AiRepairResult> {
  return postStructured<AiRepairResult>(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/ai/repair`,
    request,
  );
}
