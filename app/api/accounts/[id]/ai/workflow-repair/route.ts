import { NextResponse } from "next/server";
import { z } from "zod";
import {
  requireUserWithAccount,
  loadWorkflowForMember,
  parseJsonBody,
  workflowNotFoundResponse,
} from "@/app/api/workflows/_shared";
import { suggestWorkflowRepairForAI } from "@/services/ai/repair";
import { recordAiRepairOutcome } from "@/services/ai/events";

/**
 * POST /api/accounts/[id]/ai/workflow-repair (HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR).
 *
 * Account-scoped, governed home for the failed-run repair suggestion that the builder's
 * run-results `RunResultsRepairBlock` asks for. It REPLACES the per-workflow legacy entry
 * (`POST /api/workflows/[id]/runs/[runId]/ai/repair`) for that UI by putting the SAME
 * deterministic repair suggester onto the same account-governed seam as the Hermes guidance
 * route (`requireUserWithAccount` + workflow-belongs-to-account + persistent audit).
 *
 * DELIBERATELY DETERMINISTIC — NO MODEL CALL (governance-only rehome, decided 2026-06-21).
 * `suggestWorkflowRepairForAI` reads the run, classifies the failure with fixed rules, builds a
 * repair `WorkflowPatch` ONLY when safe, runs it through the deterministic AI-5 preview, and
 * returns a VALUE-FREE result (recommendations + a structural preview summary — never raw
 * error_details / config values / secrets / provider payloads / tokens). Because there is no
 * model / Hermes / Render / OpenAI / Nous call here:
 *   - there is NO prompt or run-context payload sent to any model — nothing to sanitize on the
 *     way out, and no `CHAINREACT_AI_GATEWAY_TOKEN` involvement;
 *   - the AI-credit gate and `HERMES_AGENT_ENABLED` gate are intentionally NOT applied (they gate
 *     model spend / Hermes availability, neither of which exists on this deterministic path). If a
 *     future slice adds an LLM-backed repair-guidance augmentation, it MUST add those gates around
 *     that model call.
 * The route NEVER applies a patch, mutates / saves / activates / runs a workflow, or creates a
 * separate workflow. To APPLY a proposed repair the UI still calls the existing deterministic apply
 * route (`POST /api/workflows/[id]/ai/apply`) with explicit confirmation — unchanged.
 *
 * Gates, in order:
 *   1. auth + account membership + freeze → `requireUserWithAccount(id)` (401 / 403). accountId is
 *      the VALIDATED URL param, never trusted from the body.
 *   2. strict body { workflowId, runId } → 400. `.strict()` blocks a client-supplied accountId.
 *   3. workflowId must belong to THIS account + caller is a member → else no-leak 404. The
 *      deterministic suggester additionally cross-checks that the run belongs to that workflow and
 *      is owned (→ its own NOT_FOUND), so run ownership is enforced.
 *   4. persistent audit via the existing `recordAiRepairOutcome` seam (scope ids + safe outcome
 *      only; fire-and-forget, never blocks the response).
 *
 * No-leak: the body is the already-sanitized `RepairSuggestionResult` (identical to the legacy
 * route), so the response carries no raw error details / config values / secrets / provider account
 * ids.
 */

const BodySchema = z
  .object({
    workflowId: z.string().trim().min(1, "A workflow id is required."),
    runId: z.string().trim().min(1, "A run id is required."),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // 1. Auth + account membership + freeze. accountId is the validated URL param (never from body).
  const auth = await requireUserWithAccount(id);
  if (!auth.ok) return auth.response;
  const { userId, accountId } = auth;

  // 2. Strict body — workflowId + runId required; a client-supplied accountId/extra field is rejected.
  const parsed = await parseJsonBody(request, BodySchema);
  if (!parsed.ok) return parsed.response;
  const { workflowId, runId } = parsed.data;

  // 3. Workflow must belong to THIS account + caller is a member (else no-leak 404). Cross-account
  //    workflow ids never reveal existence.
  const wf = await loadWorkflowForMember(workflowId, userId);
  if (!wf.ok) return wf.response;
  if (wf.record.accountId !== accountId) return workflowNotFoundResponse();

  // 4. Deterministic repair suggestion (no model). The suggester cross-checks run→workflow ownership
  //    and returns NOT_FOUND for a missing / not-owned / wrong-workflow run.
  let result;
  try {
    result = await suggestWorkflowRepairForAI({
      userId,
      workflowId,
      workflowRunId: runId,
    });
  } catch {
    // Sanitized — never leak internals / connection strings / stack traces.
    return NextResponse.json({ ok: false, code: "READ_FAILED", message: "Failed to suggest a repair." }, { status: 500 });
  }

  // Persistent audit (existing seam). Fire-and-forget: analytics must never affect the response.
  try {
    await recordAiRepairOutcome({ accountId, userId, workflowId, workflowRunId: runId }, result);
  } catch {
    /* audit must never break the route */
  }

  if (!result.ok) {
    if (result.code === "NOT_FOUND") {
      return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "Workflow run not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: false, code: "READ_FAILED", message: "Failed to suggest a repair." }, { status: 500 });
  }

  return NextResponse.json(result, { status: 200 });
}
