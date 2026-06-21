/**
 * Typed client for the Hermes Agent workflow-guidance route (HERMES-AGENT-GUIDANCE-UI).
 *
 * Browser code calls THIS helper — never `fetch()` from a component, and NEVER the Render AI
 * gateway / a model vendor / the private Hermes Agent directly. The only thing this touches is the
 * ChainReact server route `POST /api/accounts/[id]/ai/workflow-guidance`, which owns auth, account
 * membership, the AI-credit gate, config gating, audit, and the safe (token-free) response.
 *
 * Advisory only: the response carries `guidanceText` (+ a safe `source` / `warnings`) and an OPTIONAL
 * `workflowPlan` (HERMES-AGENT-PLAN-EXTRACTION). The plan is capability-validated server-side and is
 * `notApplied: true` — rendered REVIEW-ONLY (no create/apply/run). No secret, provider envelope, or
 * token ever crosses this boundary.
 */

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import { postStructured } from "./shared";

export type WorkflowGuidanceResponse =
  | {
      ok: true;
      guidanceText: string;
      source: string;
      /** Capability-validated advisory plan, or null. Review-only — never applied by this response. */
      workflowPlan: WorkflowPlan | null;
      warnings?: readonly string[];
    }
  | { ok: false; code: string; message: string };

export interface RequestWorkflowGuidanceInput {
  /** The account whose guidance is requested. Comes from server/router context — never arbitrary. */
  readonly accountId: string;
  /** The user's own automation goal text. */
  readonly goalText: string;
  /** Optional builder-context workflow id; verified server-side to belong to the account. */
  readonly workflowId?: string;
}

/**
 * Request advisory workflow guidance. Returns the structured `{ ok, ... }` body for handled outcomes
 * (success and `ok:false` denials like credits/unavailable); throws `AiApiError` for transport-level
 * failures (401 / 400 / 500). Callers render only `guidanceText` and map failures to safe copy.
 */
export async function requestWorkflowGuidance(
  input: RequestWorkflowGuidanceInput,
): Promise<WorkflowGuidanceResponse> {
  return postStructured<WorkflowGuidanceResponse>(
    `/api/accounts/${encodeURIComponent(input.accountId)}/ai/workflow-guidance`,
    { goalText: input.goalText, ...(input.workflowId ? { workflowId: input.workflowId } : {}) },
  );
}
