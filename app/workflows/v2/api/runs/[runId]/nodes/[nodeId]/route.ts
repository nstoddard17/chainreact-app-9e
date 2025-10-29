import { NextResponse } from "next/server"

import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"

export async function GET(_: Request, context: { params: Promise<{ runId: string; nodeId: string }> }) {
  const { runId, nodeId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("flow_v2_run_nodes")
    .select("node_id, status, input, output, error, attempts, duration_ms, cost, created_at")
    .eq("run_id", runId)
    .eq("node_id", nodeId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Node snapshot not found" }, { status: 404 })
  }

  const { data: lineage } = await supabase
    .from("flow_v2_lineage")
    .select("edge_id, from_node_id, target_path, expr")
    .eq("run_id", runId)
    .eq("to_node_id", nodeId)

  return NextResponse.json({ ok: true, snapshot: data, lineage: lineage ?? [] })
}
