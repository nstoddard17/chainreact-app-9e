import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { getRouteClient, getFlowRepository, uuid, getServiceClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceForUser } from "@/src/lib/workflows/builder/workspace"

const CreateFlowSchema = z
  .object({
    name: z.string().min(1).default("Untitled Flow"),
    description: z.string().optional(),
  })
  .partial()

export async function POST(request: Request) {
  const supabase = await getRouteClient()
  const serviceClient = await getServiceClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = CreateFlowSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  const name = parsed.data.name ?? "Untitled Flow"
  const description = parsed.data.description ?? null

  const repository = await getFlowRepository(serviceClient)

  const flowId = uuid()

  let workspace
  try {
    workspace = await ensureWorkspaceForUser(supabase, user.id)
  } catch (workspaceError: any) {
    console.error('[v2/api/flows] Failed to ensure workspace:', workspaceError)
    return NextResponse.json({
      ok: false,
      error: 'Failed to ensure workspace: ' + (workspaceError.message || workspaceError.toString())
    }, { status: 500 })
  }

  // Insert into workflows table (unified table for all workflows)
  // Note: nodes and edges are stored in workflow_nodes and workflow_edges tables
  const { error: definitionError } = await serviceClient
    .from("workflows")
    .insert({
      id: flowId,
      name,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      workspace_id: workspace.workspaceId,
      user_id: user.id,
      created_by: user.id,
      last_modified_by: user.id,
      status: 'draft',
    })

  if (definitionError) {
    console.error('[v2/api/flows] Failed to insert workflow:', definitionError)
    return NextResponse.json({ ok: false, error: definitionError.message }, { status: 500 })
  }

  const flow = FlowSchema.parse({
    id: flowId,
    name,
    description: description ?? undefined,
    version: 1,
    nodes: [],
    edges: [],
    trigger: { type: "manual", enabled: true },
    interface: { inputs: [], outputs: [] },
    metadata: description ? { description } : {},
  })

  try {
    const revision = await repository.createRevision({ flowId, flow, version: 1 })
    return NextResponse.json({ ok: true, flowId, revisionId: revision.id, version: revision.version })
  } catch (error: any) {
    console.error('[v2/api/flows] Failed to create revision:', error)
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to create revision',
      details: error.toString()
    }, { status: 500 })
  }
}
