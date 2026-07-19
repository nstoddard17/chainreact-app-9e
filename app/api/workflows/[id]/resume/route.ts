import { NextResponse } from "next/server";
import * as workflowsRepo from "@/repositories/workflows";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
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

  // WF-RUNPERM — resuming re-arms the workflow to fire under the creator's
  // identity. Only the creator may resume a private-credential workflow.
  const record = await workflowsRepo.getById(id);
  if (record && record.state !== "deleted") {
    const runEditDenied = await assertWorkflowRunEditAllowed(record, auth.userId);
    if (runEditDenied) return runEditDenied;

    // BRANCH-ENT-1 C5 — plan-feature preflight: resuming re-arms live
    // execution, so a draft that uses advanced branching cannot be resumed by
    // a non-entitled account (typed 403 + upgrade CTA). Remove the branching
    // step (the builder stays fully editable) or upgrade, then resume.
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
    () => orch.resume(id),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
