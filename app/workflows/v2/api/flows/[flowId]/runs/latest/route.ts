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

  const definition = await supabase
    .from("flow_v2_definitions")
    .select("workspace_id")
    .eq("id", flowId)
    .maybeSingle()

  if (definition.error) {
    return NextResponse.json({ ok: false, error: definition.error.message }, { status: 500 })
  }

  if (!definition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  try {
    await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "viewer")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to fetch run"
    return NextResponse.json({ ok: false, error: message }, { status })
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
