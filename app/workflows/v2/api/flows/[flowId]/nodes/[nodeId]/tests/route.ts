import { NextResponse } from "next/server"
import { z } from "zod"

import { getRouteClient, uuid } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

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
    await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "editor")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to persist test result"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const revision = await supabase
    .from("flow_v2_revisions")
    .select("id")
    .eq("flow_id", flowId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (revision.error) {
    return NextResponse.json({ ok: false, error: revision.error.message }, { status: 500 })
  }

  const revisionId = revision.data?.id ?? null

  const runId = uuid()
  const now = new Date().toISOString()

  const runInsert = await supabase.from("flow_v2_runs").insert({
    id: runId,
    flow_id: flowId,
    revision_id: revisionId,
    status: parsed.data.status === "success" ? "success" : "error",
    inputs: {},
    metadata: {
      source: "node_test",
      nodeId,
      nodeType: parsed.data.nodeType,
      nodeLabel: parsed.data.nodeLabel,
      triggeredBy: user.id,
      message: parsed.data.message,
    },
    started_at: now,
    finished_at: now,
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

  const nodeInsert = await supabase.from("flow_v2_run_nodes").insert({
    id: uuid(),
    run_id: runId,
    node_id: nodeId,
    status: parsed.data.status === "success" ? "success" : "error",
    input: parsed.data.input ?? {},
    output: combinedOutput,
    error: parsed.data.error ?? null,
    duration_ms: parsed.data.executionTime ?? null,
    created_at: now,
  })

  if (nodeInsert.error) {
    return NextResponse.json({ ok: false, error: nodeInsert.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, runId })
}
