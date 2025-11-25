import { NextResponse } from "next/server"
import { z } from "zod"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { logger } from "@/lib/utils/logger"

const QuerySchema = z.object({
  limit: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => Number.isFinite(value) && value > 0, { message: "limit must be positive" })
    .optional(),
})

export async function GET(request: Request, context: { params: Promise<{ flowId: string }> }) {
  try {
    const { flowId } = await context.params
    const workflowId = flowId

    const { searchParams } = new URL(request.url)
    const parsedQuery = QuerySchema.safeParse(Object.fromEntries(searchParams.entries()))
    const limit = parsedQuery.success ? parsedQuery.data.limit ?? 50 : 50

    const supabase = await getRouteClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.debug("[history] Unauthorized", { flowId, userError: userError?.message })
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    // Get workflow definition to check ownership
    logger.debug("[history] Checking workflow exists", { flowId, userId: user.id })
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("id, user_id, name")
      .eq("id", workflowId)
      .maybeSingle()

    logger.debug("[history] Workflow query result", {
      flowId,
      found: !!workflow,
      workflowUserId: workflow?.user_id,
      currentUserId: user.id,
      error: workflowError?.message
    })

    if (workflowError) {
      logger.error("[history] Workflow query error", { flowId, error: workflowError.message })
      return NextResponse.json({ ok: false, error: workflowError.message }, { status: 500 })
    }

    if (!workflow) {
      logger.warn("[history] Workflow not found", { flowId, userId: user.id })
      return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
    }

    // Check if user owns the workflow
    if (workflow.user_id !== user.id) {
      logger.warn("[history] User does not own workflow", {
        flowId,
        workflowUserId: workflow.user_id,
        currentUserId: user.id
      })
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }

    // Query workflow executions
    logger.debug("[history] Querying executions", { flowId })
    const { data: runs, error: runsError } = await supabase
      .from("workflow_executions")
      .select("id, status, started_at, completed_at, execution_time_ms, error_message")
      .eq("workflow_id", workflowId)
      .order("started_at", { ascending: false })
      .limit(limit)

    if (runsError) {
      logger.error("[history] Runs query error", { flowId, error: runsError.message })
      return NextResponse.json({ ok: false, error: runsError.message }, { status: 500 })
    }

    logger.debug("[history] Found executions", { flowId, count: runs?.length ?? 0 })

    return NextResponse.json({
      ok: true,
      runs: (runs ?? []).map((run: any) => ({
        id: run.id,
        status: run.status,
        startedAt: run.started_at,
        finishedAt: run.completed_at,
        executionTimeMs: run.execution_time_ms,
        errorMessage: run.error_message,
      })),
    })
  } catch (error: any) {
    logger.error("[history] Unexpected error", { flowId: context.params, error: error?.message, stack: error?.stack })
    return NextResponse.json({ ok: false, error: error?.message ?? "Internal server error" }, { status: 500 })
  }
}
