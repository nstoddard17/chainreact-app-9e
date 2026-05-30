import { NextResponse } from "next/server";
import { CreateWorkflowRequestSchema } from "@/contracts/workflow";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunStatsRepo from "@/repositories/workflowRunStats";
import {
  parseJsonBody,
  requireUser,
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
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, CreateWorkflowRequestSchema);
  if (!parsed.ok) return parsed.response;

  const record = await workflowsRepo.create({
    userId: auth.userId,
    name: parsed.data.name,
  });
  return NextResponse.json(toWorkflowSummary(record), { status: 201 });
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Slice 4.WORKFLOWS-PAGE-1 — enrich the list with provider chips (derived
  // from each draft definition) + lifetime run stats (one view query). Both
  // reads are user-scoped (workflows by user_id; run stats via the
  // security_invoker view's RLS) and run in parallel — no client N+1.
  const [records, runStats] = await Promise.all([
    workflowsRepo.listByUser(auth.userId),
    workflowRunStatsRepo.getStatsForUser(auth.userId),
  ]);
  return NextResponse.json({
    workflows: records.map((r) => toWorkflowListItem(r, runStats)),
  });
}
