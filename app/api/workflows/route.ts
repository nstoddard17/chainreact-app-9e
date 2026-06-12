import { NextResponse } from "next/server";
import { CreateWorkflowRequestSchema } from "@/contracts/workflow";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunStatsRepo from "@/repositories/workflowRunStats";
import {
  parseJsonBody,
  requireUserWithAccount,
  toWorkflowListItem,
  toWorkflowSummary,
} from "./_shared";

/**
 * POST /api/workflows — create a new draft workflow.
 * GET  /api/workflows — list the authenticated user's workflows (deleted hidden).
 *
 * Thin handler per project-structure-and-module-boundaries.md §5.
 */

export async function POST(request: Request) {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, CreateWorkflowRequestSchema);
  if (!parsed.ok) return parsed.response;

  // 4.ACCOUNT-MODEL-7: the workflow is owned by the caller's account; the
  // user is recorded as provenance (created_by_user_id), not as authority.
  const record = await workflowsRepo.create({
    accountId: auth.accountId,
    createdByUserId: auth.userId,
    name: parsed.data.name,
  });
  return NextResponse.json(toWorkflowSummary(record), { status: 201 });
}

export async function GET() {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  // Slice 4.WORKFLOWS-PAGE-1 — enrich the list with provider chips (derived
  // from each draft definition) + lifetime run stats (one view query).
  // 4.ACCOUNT-MODEL-7: workflows are listed by account; run stats stay
  // user-scoped (workflow_runs is slice -8 / billing is Phase C). For a
  // single-user personal account the two key off the same workflows. Both
  // reads run in parallel — no client N+1.
  const [records, runStats] = await Promise.all([
    workflowsRepo.listByAccount(auth.accountId),
    // 4.ACCOUNT-SWITCHER-1: run stats scoped to the SAME active account the
    // list is scoped to (not user-wide), so refreshed stats match the rows.
    workflowRunStatsRepo.getStatsForAccount(auth.accountId),
  ]);
  return NextResponse.json({
    workflows: records.map((r) => toWorkflowListItem(r, runStats, auth.userId)),
  });
}
