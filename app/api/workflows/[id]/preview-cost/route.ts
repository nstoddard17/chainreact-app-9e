import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { FEATURE_FLAGS } from '@/lib/featureFlags'
import { computeCostPreview } from '@/lib/workflows/cost-preview'

/**
 * GET /api/workflows/[id]/preview-cost
 *
 * Returns the authoritative pre-run cost preview for a workflow.
 * Used by the ExecutionCostConfirmDialog before live runs.
 *
 * This is the ONLY source of decision-grade cost numbers.
 * Client-side estimates are for passive display only.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const resolvedParams = await params
    const workflowId = resolvedParams.id

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(workflowId)) {
      return errorResponse("Invalid workflow ID format", 400)
    }

    // Fetch workflow, nodes, edges, and user profile in parallel
    const serviceClient = await createSupabaseServiceClient()
    const [workflowResult, nodesResult, edgesResult, profileResult] = await Promise.all([
      serviceClient
        .from("workflows")
        .select("id, user_id, workspace_type, workspace_id, billing_scope_type, billing_scope_id")
        .eq("id", workflowId)
        .single(),
      serviceClient
        .from("workflow_nodes")
        .select("id, node_type, label, config, is_trigger, provider_id")
        .eq("workflow_id", workflowId),
      serviceClient
        .from("workflow_edges")
        .select("id, source_node_id, target_node_id")
        .eq("workflow_id", workflowId),
      supabase
        .from("user_profiles")
        .select("tasks_used, tasks_limit")
        .eq("id", user.id)
        .single(),
    ])

    if (workflowResult.error || !workflowResult.data) {
      return errorResponse("Workflow not found", 404)
    }

    // Authorization: user must own the workflow or be in its workspace
    const workflow = workflowResult.data
    const { authorizeWorkflowAccess } = await import('@/lib/workflows/authorizeWorkflowAccess')
    const auth = await authorizeWorkflowAccess(user.id, workflow, 'view')
    if (!auth.allowed) {
      return errorResponse("Access denied", 403)
    }

    // Map DB rows to node/edge shape expected by computeCostPreview
    const nodes = (nodesResult.data || []).map((n: any) => ({
      id: n.id,
      type: n.node_type,
      data: {
        type: n.node_type,
        label: n.label,
        config: n.config || {},
        isTrigger: n.is_trigger,
        providerId: n.provider_id,
      },
    }))

    const edges = (edgesResult.data || []).map((e: any) => ({
      source: e.source_node_id,
      target: e.target_node_id,
    }))

    // Compute authoritative cost preview
    const preview = computeCostPreview(nodes, edges)
    const chargedCost = FEATURE_FLAGS.LOOP_COST_EXPANSION
      ? preview.totalCost
      : preview.flatCost

    // Balance
    const profile = profileResult.data
    const tasksUsed = profile?.tasks_used ?? 0
    const tasksLimit = profile?.tasks_limit ?? 100
    const isUnlimited = tasksLimit === -1
    const remaining = isUnlimited ? Infinity : Math.max(0, tasksLimit - tasksUsed)
    const wouldExceedBudget = !isUnlimited && chargedCost > remaining

    return jsonResponse({
      flatCost: preview.flatCost,
      totalCost: preview.totalCost,
      chargedCost,
      loopExpansionEnabled: FEATURE_FLAGS.LOOP_COST_EXPANSION,
      hasLoops: preview.hasLoops,
      breakdown: preview.breakdown,
      loopDetails: preview.loopDetails,
      balance: {
        remaining: isUnlimited ? null : remaining,
        limit: tasksLimit,
        used: tasksUsed,
        unlimited: isUnlimited,
      },
      wouldExceedBudget,
    })
  } catch (error: any) {
    logger.error('[PreviewCost] Unexpected error', {
      error: error.message,
    })
    return errorResponse("Failed to compute cost preview", 500)
  }
}
