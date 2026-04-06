import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { logger } from "@/lib/utils/logger"

/**
 * GET /workflows/v2/api/runs/[runId]/nodes
 * Returns execution step details for a specific run, mapped to RunNodeDetails shape.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Verify user owns the execution session
    const { data: session, error: sessionError } = await supabase
      .from("workflow_execution_sessions")
      .select("id, user_id")
      .eq("id", runId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { data: steps, error } = await supabase
      .from("execution_steps")
      .select("id, node_id, node_type, node_name, status, duration_ms, started_at, output_data, error_message, error_details")
      .eq("execution_id", runId)
      .order("step_number", { ascending: true })

    if (error) {
      logger.error("[v2/runs/nodes] Query error:", { error: error.message })
      return NextResponse.json({ nodes: [] })
    }

    // Map to RunNodeDetails shape expected by WorkflowHistoryDialog
    const nodes = (steps || []).map((s) => ({
      id: s.id,
      node_id: s.node_name || s.node_type || s.node_id,
      status: s.status === "completed" ? "success" : s.status,
      duration_ms: s.duration_ms ?? null,
      created_at: s.started_at,
      output: s.output_data ?? null,
      error: s.error_message
        ? { message: s.error_message, ...(s.error_details || {}) }
        : null,
    }))

    return NextResponse.json({ nodes })
  } catch (error) {
    logger.error("[v2/runs/nodes] Unexpected error:", error)
    return NextResponse.json({ nodes: [] })
  }
}
