import { NextResponse } from "next/server"

import { getRouteClient, getFlowRepository, getServiceClient } from "@/src/lib/workflows/builder/api/helpers"

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

  // Use service client to bypass RLS on workflows_revisions table
  const serviceClient = await getServiceClient()
  const repository = await getFlowRepository(serviceClient)

  const definition = await supabase
    .from("workflows")
    .select("id")
    .eq("id", flowId)
    .maybeSingle()

  if (definition.error) {
    return NextResponse.json({ ok: false, error: definition.error.message }, { status: 500 })
  }

  if (!definition.data) {
    return NextResponse.json({ ok: false, error: "Flow not found" }, { status: 404 })
  }

  const revisions = await repository.listRevisions(flowId)
  return NextResponse.json({ ok: true, revisions })
}
