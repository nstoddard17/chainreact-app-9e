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
    const { data: run, error: runError } = await supabase
      .from("workflow_executions")
      .select("id, workflow_id, status, started_at, completed_at")
      .eq("id", runId)
      .maybeSingle()

    if (runError) {
      logger.error("[runs/nodes] Run query error", { runId, error: runError.message })
      return NextResponse.json({ ok: false, error: runError.message }, { status: 500 })
    }

    if (!run) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 })
    }

    // Get node executions
    const { data: nodes, error: nodesError } = await supabase
      .from("workflow_node_executions")
      .select("id, node_id, node_type, status, input_data, output_data, error_message, started_at, completed_at")
      .eq("execution_id", runId)
      .order("started_at", { ascending: true })

    if (nodesError) {
      logger.error("[runs/nodes] Nodes query error", { runId, error: nodesError.message })
      return NextResponse.json({ ok: false, error: nodesError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      run: {
        id: run.id,
        status: run.status,
        startedAt: run.started_at,
        finishedAt: run.completed_at,
        flowId: run.workflow_id,
      },
      nodes: (nodes ?? []).map((node) => ({
        id: node.id,
        node_id: node.node_id,
        node_type: node.node_type,
        status: node.status,
        input: node.input_data,
        output: node.output_data,
        error: node.error_message,
        started_at: node.started_at,
        completed_at: node.completed_at,
      })),
    })
  } catch (error: any) {
    logger.error("[runs/nodes] Unexpected error", { error: error?.message })
    return NextResponse.json({ ok: false, error: error?.message ?? "Internal server error" }, { status: 500 })
  }
}
