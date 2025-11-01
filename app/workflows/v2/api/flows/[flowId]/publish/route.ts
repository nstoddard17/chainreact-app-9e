import { NextResponse } from "next/server"
import { z } from "zod"

import { getFlowRepository, getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { publishRevision } from "@/src/lib/workflows/builder/publish"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

const PublishSchema = z.object({
  revisionId: z.string().uuid().optional(),
  notes: z.string().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ flowId: string }> }) {
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
    await ensureWorkspaceRole(supabase, definition.data.workspace_id, user.id, "editor")
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : 500
    const message = status === 403 ? "Forbidden" : error?.message ?? "Unable to publish"
    return NextResponse.json({ ok: false, error: message }, { status })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = PublishSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  const repository = await getFlowRepository(supabase)

  let revision = parsed.data.revisionId
    ? await repository.loadRevisionById(parsed.data.revisionId)
    : await repository.loadRevision({ flowId })

  if (!revision || revision.flowId !== flowId) {
    return NextResponse.json({ ok: false, error: "Revision not found" }, { status: 404 })
  }

  await publishRevision({
    flowId,
    revisionId: revision.id,
    notes: parsed.data.notes,
    publishedBy: user.id,
    client: supabase,
  })

  return NextResponse.json({ ok: true, revisionId: revision.id })
}
