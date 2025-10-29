import { NextResponse } from "next/server"

import { getRouteClient, getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"

export async function GET(_: Request, context: { params: Promise<{ flowId: string; revisionId: string }> }) {
  const { flowId, revisionId } = await context.params

  const supabase = await getRouteClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getFlowRepository(supabase)
  const revision = await repository.loadRevisionById(revisionId)
  if (!revision || revision.flowId !== flowId) {
    return NextResponse.json({ ok: false, error: "Revision not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, revision })
}
