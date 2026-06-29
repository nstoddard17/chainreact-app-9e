/**
 * Failed-run repair CONTRACT TYPES (client view of the deterministic AI-7 service's
 * `RepairSuggestionResult`).
 *
 * HERMES-AGENT-RETIRE-LEGACY-REPAIR-ROUTE (2026-06-21): the old per-workflow request
 * function (`requestWorkflowRepair` → `POST /api/workflows/[id]/runs/[runId]/ai/repair`)
 * and that route were RETIRED — the run-results UI now asks through the governed,
 * account-scoped client `requestAccountWorkflowRepair` (`lib/api/ai/workflowRepair.ts` →
 * `POST /api/accounts/[id]/ai/workflow-repair`). These TYPES remain because they are the
 * live repair contract shared by that governed client + `RunResultsRepairBlock`.
 *
 * Like `proposedPatch` on the plan response, the repair patch is treated as OPAQUE by the
 * client — the Builder forwards it verbatim to the existing apply route
 * (`applyWorkflowPatch`) on confirmation, never inspects its config.
 */

import type { AiOpaquePatch } from "./shared";
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
    // CR-FAILREASON-2 — lockstep with the shared action taxonomy (HumanizedError
    // / HumanizedErrorSchema / WorkflowRunErrorClassification). Extended from the
    // original 3 with `retry_later` and `contact_support`.
    readonly action?:
      | "reconnect"
      | "open_node"
      | "retry_later"
      | "upgrade_plan"
      | "contact_support";
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
