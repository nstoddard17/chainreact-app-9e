import { NextResponse } from "next/server"

import { createRunStore } from "@/src/lib/workflows/builder/api/helpers"
import { getRouteClient, getServiceClient, getFlowRepository, uuid } from "@/src/lib/workflows/builder/api/helpers"
import { runFromHere } from "@/src/lib/workflows/builder/runner/execute"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

export async function POST(_: Request, context: { params: Promise<{ runId: string; nodeId: string }> }) {
  const { runId, nodeId } = await context.params

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
    .select("flow_id")
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
    await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "editor")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to resume run"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const repository = await getFlowRepository(supabase)
  const serviceClient = await getServiceClient()
  const store = createRunStore(serviceClient)

  try {
    const newRunId = await runFromHere({
      runId,
      startNodeId: nodeId,
      newRunId: uuid(),
      repository,
      store,
    })

    return NextResponse.json({ ok: true, runId: newRunId })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
