import { NextResponse } from "next/server";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import { requireUser, toWorkflowRunDetail } from "../../../_shared";

/**
 * GET /api/workflows/[id]/runs/[runId] — fetch a single run's detail.
 *
 * Slice 3.8: the existing summary endpoint at `../route.ts` strips
 * `steps[]`, `triggerEvent`, and `fatalError` to keep the list view
 * light. This detail endpoint adds them back so the builder's
 * RunResultsPanel can show per-step output for the most-recent test
 * run — without bloating the list payload.
 *
 * RLS gates per-user access via the SSR-cookie client inside
 * `workflowRunsRepo.getById`. A runId that belongs to another user
 * returns `null` from the repo and surfaces as a 404 here — never a
 * leak. The path's `[id]` is cross-validated against the run's stored
 * `workflowId` so a malformed deep-link doesn't return the wrong run.
 *
 * The route is deliberately a single thin SELECT — no orchestration,
 * no enqueue logic, no side effects. Polling cost stays predictable
 * even when the builder hits it once per second.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id, runId } = await params;

  const record = await workflowRunsRepo.getById(runId);
  if (!record || record.workflowId !== id) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  return NextResponse.json(toWorkflowRunDetail(record));
}
