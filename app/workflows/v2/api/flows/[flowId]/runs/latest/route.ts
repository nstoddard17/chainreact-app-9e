import { NextResponse } from "next/server"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

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

  // Check both workflows table (v1) and flow_v2_definitions table (v2)
  const { data: workflowRow } = await supabase
    .from("workflows")
    .select("id, user_id, workspace_id")
    .eq("id", flowId)
    .maybeSingle()

  const { data: flowV2Row } = await supabase
    .from("flow_v2_definitions")
    .select("id, owner_id, workspace_id")
    .eq("id", flowId)
    .maybeSingle()

  // Use whichever row exists (v1 or v2), normalize user_id/owner_id
  const flowRow = workflowRow
    ? { ...workflowRow, owner_id: workflowRow.user_id }
    : flowV2Row
      ? { ...flowV2Row, user_id: flowV2Row.owner_id }
      : null

  if (!flowRow) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  // Check access - user owns it or has workspace access
  let hasAccess = flowRow.user_id === user.id

  if (!hasAccess && flowRow.workspace_id) {
    try {
      await ensureWorkspaceRole(supabase, flowRow.workspace_id, user.id, "viewer")
      hasAccess = true
    } catch {
      // User doesn't have workspace access
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 })
  }

  // For v1 workflows (from workflows table), there are no v2 runs
  // Only query flow_v2_runs if this is a v2 flow
  if (!flowV2Row) {
    // This is a v1 workflow - no v2 runs exist
    return NextResponse.json({ ok: true, run: null })
  }

  const { data: run, error: runError } = await supabase
    .from("flow_v2_runs")
    .select("id, status, started_at, finished_at, revision_id")
    .eq("flow_id", flowId)
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runError) {
    console.error("[runs/latest] Query error:", runError.message, runError.code, runError.details)
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
