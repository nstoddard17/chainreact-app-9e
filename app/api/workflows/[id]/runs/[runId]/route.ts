import { NextResponse } from "next/server";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import * as workflowsRepo from "@/repositories/workflows";
import { requireUser, toWorkflowRunDetail } from "../../../_shared";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

/**
 * GET /api/workflows/[id]/runs/[runId] — fetch a single run's detail.
 *
 * Slice 3.8: the existing summary endpoint at `../route.ts` strips
 * `steps[]`, `triggerEvent`, and `fatalError` to keep the list view
 * light. This detail endpoint adds them back so the builder's
 * RunResultsPanel can show per-step output for the most-recent test
 * run — without bloating the list payload.
 *
 * Slice 3.SEC-7: the route also fetches the workflow record so
 * `toWorkflowRunDetail` can look up each step's action meta and apply
 * `OutputMeta.sensitive` redaction before serializing. The added query
 * is a single RLS-scoped SELECT through `workflowsRepo.getById` —
 * cheap and necessary for the redaction lookup. If the workflow no
 * longer exists (deleted post-run), the record was already null and we
 * return 404 before we'd need its nodes.
 *
 * RLS gates per-user access via the SSR-cookie client inside both
 * repository calls. A runId that belongs to another user returns
 * `null` from the repo and surfaces as a 404 here — never a leak.
 * The path's `[id]` is cross-validated against the run's stored
 * `workflowId` so a malformed deep-link doesn't return the wrong run.
 *
 * The route is deliberately a thin couple of SELECTs — no
 * orchestration, no enqueue logic, no side effects. Polling cost stays
 * predictable even when the builder hits it once per second.
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

  // Slice 3.SEC-7 — load the workflow so the serializer can resolve
  // per-step (provider, type) for sensitive-output redaction. RLS-
  // scoped through `workflowsRepo.getById`. If the lookup throws OR
  // the workflow row is missing (deleted post-run, transient DB
  // error), we degrade gracefully and call the serializer with
  // undefined nodes — redaction is skipped for this response but the
  // run detail still returns. The redactor's missing-meta path is
  // documented in `core/security/redactOutput.ts` JSDoc.
  let workflowNodes: WorkflowDefinition["nodes"] | undefined;
  try {
    const workflow = await workflowsRepo.getById(id);
    workflowNodes = workflow?.draftDefinition.nodes;
  } catch {
    workflowNodes = undefined;
  }

  return NextResponse.json(toWorkflowRunDetail(record, workflowNodes));
}
