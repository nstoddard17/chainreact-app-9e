import { NextResponse } from "next/server"
import { z } from "zod"

import { getRouteClient, getServiceClient, uuid, checkWorkflowAccess } from "@/src/lib/workflows/builder/api/helpers"

const BodySchema = z.object({
  status: z.enum(["success", "error"]),
  executionTime: z.number().optional(),
  output: z.any().optional(),
  error: z.any().optional(),
  rawResponse: z.any().optional(),
  input: z.any().optional(),
  nodeType: z.string().optional(),
  nodeLabel: z.string().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ flowId: string; nodeId: string }> }) {
  const { flowId, nodeId } = await context.params

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // Check workflow access using service client (bypasses RLS) with explicit authorization
  // Requires 'editor' role for testing nodes
  const accessCheck = await checkWorkflowAccess(flowId, user.id, 'editor')

  if (!accessCheck.hasAccess) {
    const status = accessCheck.error === "Flow not found" ? 404 : 403
    return NextResponse.json({ ok: false, error: accessCheck.error }, { status })
  }

  // Use service client for database operations since we've already verified access
  const serviceClient = await getServiceClient()

  const revision = await serviceClient
    .from("workflows_revisions")
    .select("id")
    .eq("workflow_id", flowId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (revision.error) {
    return NextResponse.json({ ok: false, error: revision.error.message }, { status: 500 })
  }

  const revisionId = revision.data?.id ?? null

  const runId = uuid()
  const now = new Date().toISOString()

  // Note: workflow_executions is a view over 'executions' table
  // Valid status values are: 'pending', 'running', 'completed', 'failed', 'paused'
  const runInsert = await serviceClient.from("workflow_executions").insert({
    id: runId,
    workflow_id: flowId,
    user_id: user.id,
    status: parsed.data.status === "success" ? "completed" : "failed",
    input_data: {},
    output_data: {
      source: "node_test",
      nodeId,
      nodeType: parsed.data.nodeType,
      nodeLabel: parsed.data.nodeLabel,
      triggeredBy: user.id,
      message: parsed.data.message,
    },
    started_at: now,
    completed_at: now,
  })

  if (runInsert.error) {
    return NextResponse.json({ ok: false, error: runInsert.error.message }, { status: 500 })
  }

  const combinedOutput =
    parsed.data.output ??
    (parsed.data.rawResponse ? { raw: parsed.data.rawResponse } : {}) ??
    {}

  if (parsed.data.message && typeof combinedOutput === "object" && combinedOutput !== null) {
    ;(combinedOutput as any).__message = parsed.data.message
  }

  const nodeInsert = await serviceClient.from("workflow_node_executions").insert({
    id: uuid(),
    execution_id: runId,
    node_id: nodeId,
    node_type: parsed.data.nodeType ?? null,
    status: parsed.data.status === "success" ? "success" : "error",
    input_data: parsed.data.input ?? {},
    output_data: combinedOutput,
    error_message: parsed.data.error ? JSON.stringify(parsed.data.error) : null,
    started_at: now,
    completed_at: now,
  })

  if (nodeInsert.error) {
    return NextResponse.json({ ok: false, error: nodeInsert.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, runId })
}
