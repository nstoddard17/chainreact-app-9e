import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { listTemplates, saveTemplate } from "@/src/lib/workflows/builder/templates"
import { getFlowRepository, getRouteClient, getServiceClient } from "@/src/lib/workflows/builder/api/helpers"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

const CreateTemplateSchema = z.object({
  flowId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  thumbnailUrl: z.string().url().optional(),
})

async function requireUser() {
  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { supabase, user: null as const }
  }

  return { supabase, user }
}

async function fetchFlowWorkspaceId(client: Awaited<ReturnType<typeof getRouteClient>>, flowId: string) {
  const { data, error } = await client
    .from("workflows")
    .select("workspace_id")
    .eq("id", flowId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    const notFound = new Error("Flow not found")
    ;(notFound as any).status = 404
    throw notFound
  }

  return data.workspace_id as string | null
}

export async function GET() {
  const flag = guardFlowV2Enabled()
  if (flag) {
    return flag
  }

  const { supabase, user } = await requireUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const templates = await listTemplates(undefined, supabase)
  return NextResponse.json({ ok: true, templates })
}

export async function POST(request: Request) {
  const flag = guardFlowV2Enabled()
  if (flag) {
    return flag
  }

  const { supabase, user } = await requireUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = CreateTemplateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  let workspaceId: string | null
  try {
    workspaceId = await fetchFlowWorkspaceId(supabase, parsed.data.flowId)
  } catch (error: any) {
    const status = error?.status === 404 ? 404 : 500
    const message = status === 404 ? "Flow not found" : error?.message ?? "Unable to load flow"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  try {
    await ensureWorkspaceRole(supabase, workspaceId, user.id, "editor")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to save template"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  // Use service client to bypass RLS on workflows_revisions table
  const serviceClient = await getServiceClient()
  const repository = await getFlowRepository(serviceClient)
  const revision = await repository.loadRevision({ flowId: parsed.data.flowId })
  if (!revision) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  const flow = FlowSchema.parse(revision.graph)

  await saveTemplate({
    flowId: parsed.data.flowId,
    revisionId: revision.id,
    graph: flow,
    metadata: {
      name: parsed.data.name,
      description: parsed.data.description,
      tags: parsed.data.tags,
      thumbnailUrl: parsed.data.thumbnailUrl,
      workspaceId,
      createdBy: user.id,
    },
    client: supabase,
  })

  return NextResponse.json({ ok: true })
}
