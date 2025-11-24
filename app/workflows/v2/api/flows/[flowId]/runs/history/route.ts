import { NextResponse } from "next/server"
import { z } from "zod"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"
import { queryWithTableFallback } from "@/src/lib/workflows/builder/api/tableFallback"

const QuerySchema = z.object({
  limit: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => Number.isFinite(value) && value > 0, { message: "limit must be positive" })
    .optional(),
})

export async function GET(request: Request, context: { params: Promise<{ flowId: string }> }) {
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

  const definition = await queryWithTableFallback([
    () =>
      supabase
        .from("workflows")
        .select("workspace_id")
        .eq("id", workflowId)
        .maybeSingle(),
    () =>
      supabase
        .from("flow_v2_definitions")
        .select("workspace_id")
        .eq("id", workflowId)
        .maybeSingle(),
  ])

  if (definition.error) {
    return NextResponse.json({ ok: false, error: definition.error.message }, { status: 500 })
  }

  if (!definition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  // Only check workspace role if workspace_id exists (older flows may not have one)
  if (definition.data.workspace_id) {
    try {
      await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "viewer")
    } catch (error: any) {
      const status = error?.status === 403 ? 403 : 500
      const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to fetch runs"
      return NextResponse.json({ ok: false, error: message }, { status })
    }
  }

  const runsResult = await queryWithTableFallback([
    () =>
      supabase
        .from("workflow_executions")
        .select("id, status, started_at, completed_at")
        .eq("workflow_id", workflowId)
        .order("started_at", { ascending: false })
        .limit(limit),
    () =>
      supabase
        .from("flow_v2_runs")
        .select("id, status, started_at, finished_at, revision_id, metadata")
        .eq("flow_id", workflowId)
        .order("started_at", { ascending: false })
        .limit(limit),
  ])

  if (runsResult.error) {
    return NextResponse.json({ ok: false, error: runsResult.error.message }, { status: 500 })
  }

  const runs = runsResult.data

  return NextResponse.json({
    ok: true,
    runs: (runs ?? []).map((run: any) => ({
      id: run.id,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.completed_at ?? run.finished_at,
      revisionId: run.revision_id ?? null,
      metadata: run.metadata ?? {},
    })),
  })
}
