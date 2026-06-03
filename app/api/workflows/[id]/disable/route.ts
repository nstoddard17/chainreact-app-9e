import { NextResponse } from "next/server";
import { DisableWorkflowRequestSchema } from "@/contracts/workflow";
import { createLifecycleOrchestrator } from "@/services/workflows/orchestratorFactory";
import {
  authorizeWorkflowLifecycleAccess,
  parseJsonBody,
  requireUser,
  runLifecycle,
  toWorkflowSummary,
} from "../../_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, DisableWorkflowRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  // 4.TEAM-WORKFLOWS-1 (TW-1): explicit account-membership authorization.
  const authorized = await authorizeWorkflowLifecycleAccess(id, auth.userId);
  if (!authorized.ok) return authorized.response;

  const orch = createLifecycleOrchestrator();
  return runLifecycle(
    () =>
      orch.disable({
        workflowId: id,
        reason: parsed.data.reason,
        ...(parsed.data.context !== undefined ? { context: parsed.data.context } : {}),
      }),
    (record) => NextResponse.json(toWorkflowSummary(record)),
  );
}
