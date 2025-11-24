import { NextResponse } from "next/server"

import { createRunStore } from "@/src/lib/workflows/builder/api/helpers"
import { getRouteClient, getServiceClient, getFlowRepository, uuid } from "@/src/lib/workflows/builder/api/helpers"
import { runFromHere } from "@/src/lib/workflows/builder/runner/execute"
import { logger } from "@/lib/utils/logger"

export async function POST(_: Request, context: { params: Promise<{ runId: string; nodeId: string }> }) {
  try {
    const { runId, nodeId } = await context.params

    const supabase = await getRouteClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    // Get run from workflow_executions
    const { data: run, error: runError } = await supabase
      .from("workflow_executions")
      .select("workflow_id")
      .eq("id", runId)
      .maybeSingle()

    if (runError) {
      logger.error("[run-from-here] Run query error", { runId, error: runError.message })
      return NextResponse.json({ ok: false, error: runError.message }, { status: 500 })
    }

    if (!run) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 })
    }

    const workflowId = run.workflow_id

    if (!workflowId) {
      return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
    }

    // Get workflow to check ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("user_id")
      .eq("id", workflowId)
      .maybeSingle()

    if (workflowError) {
      logger.error("[run-from-here] Workflow query error", { workflowId, error: workflowError.message })
      return NextResponse.json({ ok: false, error: workflowError.message }, { status: 500 })
    }

    if (!workflow) {
      return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
    }

    // Check if user owns the workflow
    if (workflow.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }

    // Use service client to bypass RLS on workflows_revisions table
    const serviceClient = await getServiceClient()
    const repository = await getFlowRepository(serviceClient)
    const store = createRunStore(serviceClient)

    const newRunId = await runFromHere({
      runId,
      startNodeId: nodeId,
      newRunId: uuid(),
      repository,
      store,
    })

    return NextResponse.json({ ok: true, runId: newRunId })
  } catch (error: any) {
    logger.error("[run-from-here] Unexpected error", { error: error?.message })
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
