import { NextResponse } from "next/server"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const run = await supabase
    .from("flow_v2_runs")
    .select("id, flow_id, revision_id, status, started_at, finished_at, metadata")
    .eq("id", runId)
    .maybeSingle()

  if (run.error) {
    return NextResponse.json({ ok: false, error: run.error.message }, { status: 500 })
  }

  if (!run.data) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 })
  }

  const definition = await supabase
    .from("flow_v2_definitions")
    .select("workspace_id")
    .eq("id", run.data.flow_id)
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
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to fetch nodes"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const { data: nodes, error: nodesError } = await supabase
    .from("flow_v2_run_nodes")
    .select("id, node_id, status, input, output, error, duration_ms, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true })

  if (nodesError) {
    return NextResponse.json({ ok: false, error: nodesError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    run: {
      id: run.data.id,
      status: run.data.status,
      startedAt: run.data.started_at,
      finishedAt: run.data.finished_at,
      metadata: run.data.metadata ?? {},
      revisionId: run.data.revision_id,
      flowId: run.data.flow_id,
    },
    nodes: nodes ?? [],
  })
}
