import { NextResponse } from "next/server";
import * as workflowsRepo from "@/repositories/workflows";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import { checkWritePathReadiness } from "@/services/workflows/executionReadiness";
import {
  assertDefinitionPlanEntitlement,
  isPlanFeatureRequiredError,
  planFeatureRequiredBody,
} from "@/services/workflows/planFeatureGate";
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

    // AI-READINESS-CONVERGENCE CS-2 — Publish previously had NO readiness gate. Publish
    // snapshots the current DRAFT into a new immutable active revision, so validate the
    // draft about to go live with the shared write-path gate: structural/field integrity
    // (incl. self-loops from CS-1) AND broken deleted-step variable references — the same
    // problems Check flags. Blocks a NEW publish of a broken draft WITHOUT touching the
    // existing active revision (which keeps running). Typed 422; no config value leaks.
    const readinessError = checkWritePathReadiness(record.draftDefinition);
    if (readinessError) {
      return NextResponse.json(readinessError, { status: 422 });
    }

    // BRANCH-ENT-1 C5 — plan-feature preflight: a draft that uses advanced
    // branching cannot be published live by a non-entitled account (typed 403
    // with the upgrade CTA). The engine's pre-execution gate stays the backstop.
    try {
      await assertDefinitionPlanEntitlement({
        accountId: record.accountId,
        definition: record.draftDefinition,
      });
    } catch (err) {
      if (isPlanFeatureRequiredError(err)) {
        return NextResponse.json(planFeatureRequiredBody(err), { status: 403 });
      }
      throw err;
    }
  }

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () => orch.publish(id),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
