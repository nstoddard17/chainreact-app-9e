import { NextResponse } from "next/server"
import { z } from "zod"

import { getFlowRepository, getRouteClient, getServiceClient, checkWorkflowAccess } from "@/src/lib/workflows/builder/api/helpers"
import { publishRevision } from "@/src/lib/workflows/builder/publish"

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

  // Check workflow access using service client (bypasses RLS) with explicit authorization
  // Requires 'editor' role for publishing
  const accessCheck = await checkWorkflowAccess(flowId, user.id, 'editor')

  if (!accessCheck.hasAccess) {
    const status = accessCheck.error === "Flow not found" ? 404 : 403
    return NextResponse.json({ ok: false, error: accessCheck.error }, { status })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = PublishSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 })
  }

  // Use service client to bypass RLS on workflows_revisions table
  const serviceClient = await getServiceClient()
  const repository = await getFlowRepository(serviceClient)

  let revision = parsed.data.revisionId
    ? await repository.loadRevisionById(parsed.data.revisionId)
    : await repository.loadRevision({ flowId })

  if (!revision || revision.flowId !== flowId) {
    return NextResponse.json({ ok: false, error: "Revision not found" }, { status: 404 })
  }

  // Use service client since we've already verified access
  await publishRevision({
    flowId,
    revisionId: revision.id,
    notes: parsed.data.notes,
    publishedBy: user.id,
    client: serviceClient,
  })

  return NextResponse.json({ ok: true, revisionId: revision.id })
}
