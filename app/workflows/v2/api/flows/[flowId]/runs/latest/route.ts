import { NextResponse } from "next/server"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { logger } from "@/lib/utils/logger"

export async function GET(_: Request, context: { params: Promise<{ flowId: string }> }) {
  try {
    const { flowId } = await context.params

    const supabase = await getRouteClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.debug("[runs/latest] Unauthorized", { flowId, userError: userError?.message })
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    // Get workflow definition
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("id, user_id")
      .eq("id", flowId)
      .maybeSingle()

    if (workflowError) {
      logger.error("[runs/latest] Definition query error", { flowId, error: workflowError.message })
      return NextResponse.json({ ok: false, error: workflowError.message }, { status: 500 })
    }

    if (!workflow) {
      logger.debug("[runs/latest] Flow not found", { flowId })
      return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
    }

    // Check if user owns the workflow
    if (workflow.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }

    // Query latest execution - use id for ordering (UUIDs are time-sortable in Supabase)
    // Note: started_at may not exist in all deployments, so we query available columns
    const { data: run, error: runError } = await supabase
      .from("workflow_executions")
      .select("id, status, completed_at, execution_time_ms")
      .eq("workflow_id", flowId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (runError) {
      logger.error("[runs/latest] Run query error", { flowId, error: runError.message })
      return NextResponse.json({ ok: false, error: runError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      run: run
        ? {
            id: run.id,
            status: run.status,
            startedAt: null, // Column may not exist in all deployments
            finishedAt: run.completed_at,
            executionTimeMs: run.execution_time_ms,
          }
        : null,
    })
  } catch (error: any) {
    logger.error("[runs/latest] Unexpected error", { error: error?.message })
    return NextResponse.json({ ok: false, error: error?.message ?? "Internal server error" }, { status: 500 })
  }
}
