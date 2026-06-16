import { NextResponse } from "next/server";
import * as workflowsRepo from "@/repositories/workflows";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import {
  assertWorkflowRunEditAllowed,
  authorizeWorkflowLifecycleAccess,
  requireUser,
  runLifecycle,
  toWorkflowSummary,
} from "../../_shared";

/**
 * POST /api/workflows/[id]/publish — V2-READY-41G.
 *
 * Publishes the current draft of an ACTIVE workflow: snapshots it into a new
 * immutable revision and repoints `active_revision_id` so live execution +
 * trigger registration use it. The workflow stays `active` (NOT a state
 * transition). Idempotent — a workflow whose draft already equals its active
 * revision is a no-op.
 *
 * Authorization mirrors the other lifecycle routes (pause/resume/reactivate):
 * account membership is required; a non-member / missing workflow collapses to
 * the standard `WORKFLOW_NOT_FOUND` (no existence leak). WF-RUNPERM applies —
 * publishing makes the current draft live, so only the creator may publish a
 * private-credential workflow. Publishing a non-active workflow is an
 * INVALID_TRANSITION (typed LifecycleError → 409); a snapshot failure maps to the
 * shared safe error — no raw DB/provider detail leaks.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await authorizeWorkflowLifecycleAccess(id, auth.userId);
  if (!authorized.ok) return authorized.response;

  // WF-RUNPERM — publishing moves the current draft into live execution; only the
  // creator may do so for a private-credential workflow.
  const record = await workflowsRepo.getById(id);
  if (record && record.state !== "deleted") {
    const runEditDenied = await assertWorkflowRunEditAllowed(record, auth.userId);
    if (runEditDenied) return runEditDenied;
  }

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () => orch.publish(id),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
