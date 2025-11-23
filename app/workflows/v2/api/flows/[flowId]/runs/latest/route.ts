import { NextResponse } from "next/server"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"
import { logger } from "@/lib/utils/logger"

export async function GET(_: Request, context: { params: Promise<{ flowId: string }> }) {
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

  const definition = await supabase
    .from("flow_v2_definitions")
    .select("workspace_id, created_by")
    .eq("id", flowId)
    .maybeSingle()

  if (definition.error) {
    logger.error("[runs/latest] Definition query error", { flowId, error: definition.error.message })
    return NextResponse.json({ ok: false, error: definition.error.message }, { status: 500 })
  }

  if (!definition.data) {
    logger.debug("[runs/latest] Flow not found", { flowId })
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  // Check access: either created_by matches user, or workspace role check passes
  const isCreator = definition.data.created_by === user.id

  // Only check workspace role if workspace_id exists AND user is not the creator
  if (definition.data.workspace_id && !isCreator) {
    try {
      await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "viewer")
    } catch (error: any) {
      // All workspace errors should be treated as 403 (Forbidden)
      // Database errors in getWorkspaceRole now log but don't throw
      logger.debug("[runs/latest] Workspace role check failed, user not authorized", {
        flowId,
        workspaceId: definition.data.workspace_id,
        userId: user.id,
        error: error?.message,
      })
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
    }
  }

  const { data: run, error: runError } = await supabase
    .from("flow_v2_runs")
    .select("id, status, started_at, finished_at, revision_id")
    .eq("flow_id", flowId)
    .order("finished_at", { ascending: false })
    .order("started_at", { ascending: false })
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
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          revisionId: run.revision_id,
        }
      : null,
  })
}
