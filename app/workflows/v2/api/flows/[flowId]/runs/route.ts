import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { executeRun } from "@/src/lib/workflows/builder/runner/execute"
import { ensureNodeRegistry, getServiceClient, getRouteClient, getFlowRepository, uuid, createRunStore } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"
import { getLatestPublishedRevision as getLatestPublishedRevisionService } from "@/src/lib/workflows/builder/publish"

const StartRunSchema = z.object({
  inputs: z.any().optional(),
  globals: z.record(z.any()).optional(),
  revisionId: z.string().uuid().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await context.params

  const body = await request.json().catch(() => null)
  if (body === null) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = StartRunSchema.safeParse(body)
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
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to start run"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  // Use service client to bypass RLS on workflows_revisions table
  const serviceClient = await getServiceClient()
  const repository = await getFlowRepository(serviceClient)
  let revision = parsed.data.revisionId
    ? await repository.loadRevisionById(parsed.data.revisionId)
    : null

  if (!revision) {
    const publishedId = await getLatestPublishedRevisionService(flowId, supabase)
    if (publishedId) {
      revision = await repository.loadRevisionById(publishedId)
    }
  }

  if (!revision) {
    revision = await repository.loadRevision({ flowId })
  }

  if (!revision) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  ensureNodeRegistry()

  const runId = uuid()
  const store = createRunStore(serviceClient)

  await executeRun({
    flow: FlowSchema.parse(revision.graph),
    revisionId: revision.id,
    runId,
    inputs: parsed.data.inputs ?? {},
    globals: parsed.data.globals ?? {},
    store,
  })

  return NextResponse.json({ ok: true, runId })
}
