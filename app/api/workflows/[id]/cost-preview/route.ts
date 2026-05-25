import { NextResponse } from "next/server";
import { getWorkflowCostPreview } from "@/services/billing/workflowCostPreview";
import { requireUser } from "../../_shared";

/**
 * GET /api/workflows/[id]/cost-preview — deterministic, read-only estimate of
 * the workflow's task cost per run (Slice 4.COST-5).
 *
 * Read-only: no workflow mutation, no task deduction, no ledger writes, no
 * provider/AI calls. RLS gates ownership — a workflow the caller doesn't own
 * resolves to `null` in the service and surfaces here as 404 (no existence
 * leak). The response carries only node identity + registry metadata + cost
 * classification; never node config / secrets.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let preview;
  try {
    preview = await getWorkflowCostPreview({ workflowId: id, userId: auth.userId });
  } catch {
    // Sanitized — never leak internals.
    return NextResponse.json(
      { error: "Failed to compute cost preview." },
      { status: 500 },
    );
  }

  if (!preview) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  return NextResponse.json(preview);
}
