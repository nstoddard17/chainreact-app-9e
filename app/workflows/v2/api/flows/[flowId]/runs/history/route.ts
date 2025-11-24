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
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    // Get workflow definition to check ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("user_id")
      .eq("id", workflowId)
      .maybeSingle()

    if (workflowError) {
      logger.error("[history] Workflow query error", { error: workflowError.message })
      return NextResponse.json({ ok: false, error: workflowError.message }, { status: 500 })
    }

    if (!workflow) {
      return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
    }

    // Check if user owns the workflow
    if (workflow.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }

    // Query workflow executions
    const { data: runs, error: runsError } = await supabase
      .from("workflow_executions")
      .select("id, status, started_at, completed_at")
      .eq("workflow_id", workflowId)
      .order("started_at", { ascending: false })
      .limit(limit)

    if (runsError) {
      logger.error("[history] Runs query error", { error: runsError.message })
      return NextResponse.json({ ok: false, error: runsError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      runs: (runs ?? []).map((run: any) => ({
        id: run.id,
        status: run.status,
        startedAt: run.started_at,
        finishedAt: run.completed_at,
        revisionId: null,
        metadata: {},
      })),
    })
  } catch (error: any) {
    logger.error("[history] Unexpected error", { error: error?.message })
    return NextResponse.json({ ok: false, error: error?.message ?? "Internal server error" }, { status: 500 })
  }
}
