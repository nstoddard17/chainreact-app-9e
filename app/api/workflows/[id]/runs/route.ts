import { NextResponse } from "next/server";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import {
  requireUser,
  toWorkflowRunSummary,
  loadWorkflowForMember,
} from "../../_shared";

/**
 * GET /api/workflows/[id]/runs — list this workflow's recent runs.
 *
 * V2-READY-51: `workflowRuns.listByWorkflow` now reads via service-role (the
 * authenticated SELECT grant on `workflow_runs` was revoked) and is
 * NON-AUTHORIZING. This route therefore authorizes EXPLICITLY:
 * `loadWorkflowForMember` loads the workflow and confirms the caller is a
 * member of its account — a missing / soft-deleted workflow AND a non-member
 * both collapse to the same `WORKFLOW_NOT_FOUND` 404 (no existence leak). Only
 * then do we read the runs. Defaults to 25; ?limit=N caps at 100 (repository).
 *
 * The response maps each record through `toWorkflowRunSummary`, which strips
 * `steps` / `triggerEvent` / `fatalError` — the list view never carries raw
 * payloads.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const authorized = await loadWorkflowForMember(id, auth.userId);
  if (!authorized.ok) return authorized.response;

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : null;
  const limit =
    parsedLimit !== null && Number.isFinite(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : undefined;

  const records = await workflowRunsRepo.listByWorkflow(
    id,
    limit !== undefined ? { limit } : {},
  );
  return NextResponse.json({
    runs: records.map(toWorkflowRunSummary),
  });
}
