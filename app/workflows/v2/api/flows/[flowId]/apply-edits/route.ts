import { NextResponse } from "next/server"
import { z } from "zod"

import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { getRouteClient, getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"

const ApplyEditsSchema = z.object({
  flow: FlowSchema,
  version: z.number().int().optional(),
})

export async function POST(request: Request, context: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await context.params

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = ApplyEditsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  const { version } = parsed.data
  const flow = FlowSchema.parse({ ...parsed.data.flow, id: flowId })

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const existingDefinition = await supabase
    .from("flow_v2_definitions")
    .select("id")
    .eq("id", flowId)
    .maybeSingle()

  if (existingDefinition.error) {
    return NextResponse.json({ ok: false, error: existingDefinition.error.message }, { status: 500 })
  }

  if (!existingDefinition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  const repository = await getFlowRepository(supabase)

  const { error: definitionError } = await supabase
    .from("flow_v2_definitions")
    .update({ name: flow.name })
    .eq("id", flowId)

  if (definitionError) {
    return NextResponse.json({ ok: false, error: definitionError.message }, { status: 500 })
  }

  const revision = await repository.createRevision({
    flowId,
    flow,
    version,
  })

  return NextResponse.json({
    ok: true,
    flow: revision.graph,
    revisionId: revision.id,
    version: revision.version,
  })
}
