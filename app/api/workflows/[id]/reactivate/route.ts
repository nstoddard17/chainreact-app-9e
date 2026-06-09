import { NextResponse } from "next/server";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import {
  authorizeWorkflowLifecycleAccess,
  requireUser,
  runLifecycle,
  toWorkflowSummary,
} from "../../_shared";

/**
 * POST /api/workflows/[id]/reactivate — recover a DISABLED workflow.
 *
 * A `disabled` workflow has no direct path back to `active` (the state machine forbids
 * `disabled -> active`). This exposes the existing `markEligibleToResume` transition
 * (`disabled -> eligible_to_resume`) as the user-facing "Reactivate" action. From
 * `eligible_to_resume` the existing Resume flow finishes the job — it runs activation
 * preconditions (integration-connected) and RE-REGISTERS triggers off the CURRENT
 * draftDefinition, which is exactly what a template-replaced workflow needs.
 *
 * Authorization mirrors the other lifecycle routes (pause/resume/disable): account
 * membership is required; a non-member / missing workflow collapses to the standard
 * `WORKFLOW_NOT_FOUND` (no existence leak). Calling this on a non-disabled workflow is an
 * INVALID_TRANSITION (typed LifecycleError → 409) — no raw DB/provider detail leaks.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  // 4.TEAM-WORKFLOWS-1 (TW-1): explicit account-membership authorization.
  const authorized = await authorizeWorkflowLifecycleAccess(id, auth.userId);
  if (!authorized.ok) return authorized.response;

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () => orch.markEligibleToResume(id),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
