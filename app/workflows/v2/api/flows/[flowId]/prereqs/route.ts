import { NextResponse } from "next/server"

import { getFlowRepository, getRouteClient } from "@/src/lib/workflows/builder/api/helpers"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { checkPrerequisites } from "@/src/lib/workflows/builder/agent/planner"

export async function GET(_: Request, context: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getFlowRepository(supabase)

  const definition = await supabase
    .from("flow_v2_definitions")
    .select("id")
    .eq("id", flowId)
    .maybeSingle()

  if (definition.error) {
    return NextResponse.json({ ok: false, error: definition.error.message }, { status: 500 })
  }

  if (!definition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  const revision = await repository.loadRevision({ flowId })
  if (!revision) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  const flow = FlowSchema.parse(revision.graph)
  const prerequisites = checkPrerequisites(flow)

  return NextResponse.json({ ok: true, prerequisites })
}
