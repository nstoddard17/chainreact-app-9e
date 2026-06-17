import { NextResponse } from "next/server";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import * as workflowsRepo from "@/repositories/workflows";
import {
  requireUser,
  toWorkflowRunDetail,
  requireWorkflowAccountMember,
} from "../../../_shared";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

/**
 * GET /api/workflows/[id]/runs/[runId] — fetch a single run's detail.
 *
 * Slice 3.8: the summary endpoint at `../route.ts` keeps the list view light;
 * this detail endpoint feeds the builder's RunResultsPanel.
 *
 * V2-READY-51 (payload lockdown): `workflowRuns.getById` now reads via
 * service-role (the authenticated SELECT grant was revoked) and is
 * NON-AUTHORIZING, so this route authorizes EXPLICITLY:
 *   1. Fetch the run by id (service-role, no RLS).
 *   2. Cross-validate `record.workflowId === id` so a malformed deep-link can't
 *      return the wrong run; a mismatch / missing run → 404.
 *   3. `requireWorkflowAccountMember` confirms the caller is a member of the
 *      run's account — a non-member gets the SAME 404 (no existence leak).
 * `toWorkflowRunDetail` then emits the sanitized DTO: NO raw `triggerEvent`, NO
 * raw `fatalError` (the humanized `errorClassification` is the error surface),
 * step names/statuses + sanitized step errors always, and SEC-7-redacted
 * per-step OUTPUT ONLY when the caller is the run's own author viewing a TEST
 * run. The caller id is threaded so the mapper can apply that gate.
 *
 * Slice 3.SEC-7: when output IS exposed, the route loads the workflow so the
 * serializer can resolve per-step (provider, type) for `OutputMeta.sensitive`
 * redaction. If the lookup throws OR the workflow row is missing (deleted
 * post-run), we degrade gracefully (no per-field redaction; the author-test
 * gate still bounds whether any output is shown at all).
 *
 * The route is deliberately a thin couple of SELECTs — no orchestration, no
 * side effects. Polling cost stays predictable even at once-per-second.
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

  // V2-READY-51 — explicit membership gate (the repo read bypasses RLS). A
  // non-member of the run's account collapses to the standard WORKFLOW_NOT_FOUND
  // 404 (no existence leak), matching the missing-run shape above.
  const authorized = await requireWorkflowAccountMember(
    auth.userId,
    record.accountId,
  );
  if (!authorized.ok) return authorized.response;

  let workflowNodes: WorkflowDefinition["nodes"] | undefined;
  try {
    const workflow = await workflowsRepo.getById(id);
    workflowNodes = workflow?.draftDefinition.nodes;
  } catch {
    workflowNodes = undefined;
  }

  return NextResponse.json(toWorkflowRunDetail(record, auth.userId, workflowNodes));
}
