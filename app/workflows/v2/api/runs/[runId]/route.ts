import { NextResponse } from "next/server"
import { getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { queryWithTableFallback } from "@/src/lib/workflows/builder/api/tableFallback"

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

  const { data: run, error } = await queryWithTableFallback([
    () =>
      supabase
        .from("workflows_runs")
        .select("id, workflow_id, revision_id, status, inputs, metadata, started_at, finished_at, estimated_cost, actual_cost")
        .eq("id", runId)
        .maybeSingle(),
    () =>
      supabase
        .from("flow_v2_runs")
        .select("id, flow_id, revision_id, status, inputs, metadata, started_at, finished_at, estimated_cost, actual_cost")
        .eq("id", runId)
        .maybeSingle(),
  ])

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 })
  }

  const { data: nodes } = await queryWithTableFallback([
    () =>
      supabase
        .from("workflows_run_nodes")
        .select("node_id, status, input, output, error, attempts, duration_ms, cost, estimated_cost, token_count, created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: true }),
    () =>
      supabase
        .from("flow_v2_run_nodes")
        .select("node_id, status, input, output, error, attempts, duration_ms, cost, estimated_cost, token_count, created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: true }),
  ])

  const { data: logs } = await queryWithTableFallback([
    () =>
      supabase
        .from("workflows_node_logs")
        .select("id, node_id, status, latency_ms, cost, retries, created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: true }),
    () =>
      supabase
        .from("flow_v2_node_logs")
        .select("id, node_id, status, latency_ms, cost, retries, created_at")
        .eq("run_id", runId)
        .order("created_at", { ascending: true }),
  ])

  const nodesList = nodes ?? []
  const successCount = nodesList.filter((row) => row.status === "success").length
  const errorCount = nodesList.filter((row) => row.status === "error").length
  const pendingCount = nodesList.filter((row) => row.status === "pending" || row.status === "running").length
  const totalDurationMs = nodesList.reduce((acc, row) => acc + (row.duration_ms ?? 0), 0)
  const totalCost = nodesList.reduce((acc, row) => acc + (Number(row.cost) || 0), 0)

  return NextResponse.json({
    ok: true,
    run: {
      id: run.id,
      flowId: run.workflow_id ?? run.flow_id,
      revisionId: run.revision_id,
      status: run.status,
      inputs: run.inputs,
      globals: run.metadata?.globals ?? {},
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      estimatedCost: run.estimated_cost ?? 0,
      actualCost: run.actual_cost ?? 0,
      nodes:
        nodesList.map((row) => ({
          node_id: row.node_id,
          status: row.status,
          input: row.input,
          output: row.output,
          error: row.error,
          attempts: row.attempts,
          duration_ms: row.duration_ms,
          cost: row.cost,
          estimated_cost: row.estimated_cost,
          token_count: row.token_count,
          created_at: row.created_at,
        })) ?? [],
      logs:
        (logs ?? []).map((log) => ({
          id: log.id,
          node_id: log.node_id,
          status: log.status,
          latency_ms: log.latency_ms,
          cost: log.cost,
          retries: log.retries,
          created_at: log.created_at,
        })),
      summary: {
        totalDurationMs,
        totalCost,
        successCount,
        errorCount,
        pendingCount,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
      },
    },
  })
}
