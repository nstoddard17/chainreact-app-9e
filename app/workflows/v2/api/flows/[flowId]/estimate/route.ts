import { NextResponse } from "next/server"

import { getRouteClient, getFlowRepository, getServiceClient, checkWorkflowAccess } from "@/src/lib/workflows/builder/api/helpers"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { estimateFlowCost } from "@/src/lib/workflows/builder/costing"

export async function GET(_: Request, context: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // Check workflow access using service client (bypasses RLS) with explicit authorization
  // Requires 'viewer' role for viewing estimates
  const accessCheck = await checkWorkflowAccess(flowId, user.id, 'viewer')

  if (!accessCheck.hasAccess) {
    const status = accessCheck.error === "Flow not found" ? 404 : 403
    return NextResponse.json({ ok: false, error: accessCheck.error }, { status })
  }

  // Use service client to bypass RLS on workflows_revisions table
  const serviceClient = await getServiceClient()
  const repository = await getFlowRepository(serviceClient)
  const revision = await repository.loadRevision({ flowId })
  if (!revision) {
    return NextResponse.json({ ok: false, error: "Revision not found" }, { status: 404 })
  }

  const flow = FlowSchema.parse(revision.graph)
  const summary = estimateFlowCost(flow)

  return NextResponse.json({
    ok: true,
    flowId,
    revisionId: revision.id,
    estimatedCost: summary.estimated,
    breakdown: summary.breakdown,
  })
}
