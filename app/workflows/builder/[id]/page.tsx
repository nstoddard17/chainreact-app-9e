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
  // Run username check and params resolution in parallel
  const [_, resolvedParams] = await Promise.all([
    requireUsername(),
    params
  ])

  const flowId = resolvedParams.id

  // Create clients in parallel
  const [supabase, serviceClient] = await Promise.all([
    createSupabaseServerClient(),
    createSupabaseServiceClient()
  ])

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    notFound()
  }

  // Check both workflows table (v1) and flow_v2_definitions table (v2) IN PARALLEL
  const [workflowResult, flowV2Result] = await Promise.all([
    serviceClient
      .from("workflows")
      .select("id, owner_id, workspace_id")
      .eq("id", flowId)
      .maybeSingle(),
    serviceClient
      .from("flow_v2_definitions")
      .select("id, owner_id, workspace_id")
      .eq("id", flowId)
      .maybeSingle()
  ])

  const workflowRow = workflowResult.data
  const flowV2Row = flowV2Result.data

  // Use whichever row exists (v1 or v2)
  const flowRow = workflowRow || flowV2Row

  if (!flowRow) {
    notFound()
  }

  let hasAccess = flowRow.owner_id === user.id

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
  // RLS on workflows_revisions may not allow access for flow_v2_definitions workflows
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
