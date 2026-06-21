/**
 * Account-scoped failed-run repair client (HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR).
 *
 * Calls the GOVERNED route `POST /api/accounts/[id]/ai/workflow-repair`, which runs the
 * deterministic repair suggester under account-membership + workflow-ownership gating + persistent
 * audit (the same governance seam as the Hermes guidance route). This REPLACES the per-workflow
 * legacy client (`requestWorkflowRepair` → `/api/workflows/[id]/runs/[runId]/ai/repair`) for the
 * builder's run-results repair UI.
 *
 * The repair suggestion is DETERMINISTIC (no model / Hermes / gateway call), so this helper never
 * sees a token and the route sends no run-context payload to any model. The returned
 * `AiRepairResult` is the same value-free contract as before — the proposed patch stays OPAQUE on
 * the client and is forwarded verbatim to the existing deterministic apply route on confirmation.
 */

import { postStructured } from "./shared";
import type { AiRepairResult } from "./runRepair";

export type { AiRepairResult } from "./runRepair";

export interface RequestAccountWorkflowRepairInput {
  /** The account that owns the workflow/run — from trusted builder/page context, never user input. */
  readonly accountId: string;
  readonly workflowId: string;
  readonly runId: string;
}

export async function requestAccountWorkflowRepair(
  input: RequestAccountWorkflowRepairInput,
): Promise<AiRepairResult> {
  return postStructured<AiRepairResult>(
    `/api/accounts/${encodeURIComponent(input.accountId)}/ai/workflow-repair`,
    { workflowId: input.workflowId, runId: input.runId },
  );
}
