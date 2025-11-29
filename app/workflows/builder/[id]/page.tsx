import { notFound } from "next/navigation"
import { ReactFlowProvider } from "@xyflow/react"

import { WorkflowBuilderV2 } from "@/components/workflows/builder/WorkflowBuilderV2"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { requireUsername } from "@/utils/checkUsername"
import { ensureWorkspaceRole } from "@/src/lib/workflows/builder/workspace"

export const dynamic = "force-dynamic"

interface BuilderPageProps {
  params: Promise<{ id: string }>
}

export default async function FlowBuilderV2Page({ params }: BuilderPageProps) {
  await requireUsername()

  const { id: flowId } = await params
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    notFound()
  }

  const serviceClient = await createSupabaseServiceClient()

  // Check both workflows table (v1) and flow_v2_definitions table (v2)
  const { data: workflowRow } = await serviceClient
    .from("workflows")
    .select("id, user_id, workspace_id")
    .eq("id", flowId)
    .maybeSingle()

  const { data: flowV2Row } = await serviceClient
    .from("flow_v2_definitions")
    .select("id, owner_id, workspace_id")
    .eq("id", flowId)
    .maybeSingle()

  // Use whichever row exists (v1 or v2), normalize user_id/owner_id
  const flowRow = workflowRow
    ? workflowRow
    : flowV2Row
      ? { ...flowV2Row, user_id: flowV2Row.owner_id }
      : null

  if (!flowRow) {
    notFound()
  }

  let hasAccess = flowRow.user_id === user.id

  if (!hasAccess && flowRow.workspace_id) {
    try {
      await ensureWorkspaceRole(serviceClient, flowRow.workspace_id, user.id, "viewer")
      hasAccess = true
    } catch {
      // User doesn't have workspace access
    }
  }

  if (!hasAccess) {
    const { data: sharedAccess } = await serviceClient
      .from("workflow_permissions")
      .select("permission")
      .eq("workflow_id", flowId)
      .eq("user_id", user.id)
      .maybeSingle()
    hasAccess = Boolean(sharedAccess)
  }

  if (!hasAccess) {
    notFound()
  }

  // Use service client directly for loading revisions to bypass RLS
  const repository = await getFlowRepository(serviceClient)

  let revision
  try {
    revision = await repository.loadRevision({ flowId })
  } catch {
    // Error loading revision
  }

  if (!revision) {
    notFound()
  }

  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <WorkflowBuilderV2 flowId={flowId} initialRevision={revision} />
      </ReactFlowProvider>
    </TooltipProvider>
  )
}
