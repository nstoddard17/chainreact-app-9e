import { NextResponse } from "next/server";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import {
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

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () => orch.pause(id),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
