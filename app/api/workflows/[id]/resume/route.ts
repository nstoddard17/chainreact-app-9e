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
  }

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () => orch.resume(id),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
