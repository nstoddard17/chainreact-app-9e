import { randomUUID } from "crypto"
import { notFound, redirect } from "next/navigation"

import { getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { FlowSchema } from "@/src/lib/workflows/builder/schema"
import { ensureWorkspaceForUser } from "@/src/lib/workflows/builder/workspace"
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { requireUsername } from "@/utils/checkUsername"

export const dynamic = "force-dynamic"

export default async function WorkflowBuilderIndexPage() {
  await requireUsername()

  const supabase = await createSupabaseServerClient()
  const serviceClient = await createSupabaseServiceClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    notFound()
  }

  // Get the user's most recent flow, or create a new one
  const { data: existingFlows } = await supabase
    .from("flow_v2_definitions")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)

  // If there's an existing flow, redirect to it
  if (existingFlows && existingFlows.length > 0) {
    redirect(`/workflows/builder/${existingFlows[0].id}`)
  }

  // Otherwise, create a new flow and redirect
  const membership = await ensureWorkspaceForUser(serviceClient, user.id)
  const repository = await getFlowRepository(serviceClient)

  const definitionId = randomUUID()
  const name = "Untitled Flow"

  await serviceClient
    .from("flow_v2_definitions")
    .insert({
      id: definitionId,
      name,
      workspace_id: membership.workspaceId,
      owner_id: user.id,
    })

  const flow = FlowSchema.parse({
    id: definitionId,
    name,
    version: 1,
    nodes: [],
    edges: [],
    trigger: { type: "manual", enabled: true },
    interface: { inputs: [], outputs: [] },
  })

  await repository.createRevision({ flowId: definitionId, flow, version: 1 })

  redirect(`/workflows/builder/${definitionId}`)
}
