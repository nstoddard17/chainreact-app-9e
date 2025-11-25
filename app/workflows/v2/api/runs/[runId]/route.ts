import { NextResponse } from "next/server"
import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { logger } from "@/lib/utils/logger"

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params

    const supabase = await getRouteClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    // Get run from workflow_executions
    const { data: run, error } = await supabase
      .from("workflow_executions")
      .select("id, workflow_id, user_id, status, input_data, output_data, started_at, completed_at, execution_time_ms, error_message")
      .eq("id", runId)
      .maybeSingle()

    if (error) {
      logger.error("[runs/runId] Run query error", { runId, error: error.message })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    if (!run) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 })
    }

    // Get node executions
    const { data: nodes } = await supabase
      .from("workflow_node_executions")
      .select("id, node_id, node_type, status, input_data, output_data, error_message, started_at, completed_at")
      .eq("execution_id", runId)
      .order("started_at", { ascending: true })

    const nodesList = nodes ?? []
    const successCount = nodesList.filter((row) => row.status === "success").length
    const errorCount = nodesList.filter((row) => row.status === "error").length
    const pendingCount = nodesList.filter((row) => row.status === "pending" || row.status === "running").length

    return NextResponse.json({
      ok: true,
      run: {
        id: run.id,
        flowId: run.workflow_id,
        status: run.status,
        inputs: run.input_data,
        outputs: run.output_data,
        startedAt: run.started_at,
        finishedAt: run.completed_at,
        executionTimeMs: run.execution_time_ms,
        errorMessage: run.error_message,
        nodes: nodesList.map((row) => ({
          node_id: row.node_id,
          node_type: row.node_type,
          status: row.status,
          input: row.input_data,
          output: row.output_data,
          error: row.error_message,
          started_at: row.started_at,
          completed_at: row.completed_at,
          duration_ms: row.started_at && row.completed_at
            ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
            : 0,
        })),
        summary: {
          totalDurationMs: run.execution_time_ms ?? 0,
          successCount,
          errorCount,
          pendingCount,
          startedAt: run.started_at,
          finishedAt: run.completed_at,
        },
      },
    })
  } catch (error: any) {
    logger.error("[runs/runId] Unexpected error", { error: error?.message })
    return NextResponse.json({ ok: false, error: error?.message ?? "Internal server error" }, { status: 500 })
  }
}
