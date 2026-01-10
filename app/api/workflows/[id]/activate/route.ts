import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * POST /api/workflows/[id]/activate
 *
 * Activates a workflow:
 * 1. Validates workflow has required configuration
 * 2. Checks graph connectivity (trigger → action)
 * 3. Creates trigger resources (Microsoft Graph subscriptions, Gmail watches, etc.)
 * 4. Registers webhooks
 * 5. Sets workflow status to 'active'
 *
 * If activation fails, workflow status is rolled back.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const resolvedParams = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(resolvedParams.id)) {
      return errorResponse("Invalid workflow ID format", 400)
    }

    // Use service client to fetch full workflow data
    const serviceClient = await createSupabaseServiceClient()

    const { data: workflow, error: fetchError } = await serviceClient
      .from("workflows")
      .select("id, name, user_id, status")
      .eq("id", resolvedParams.id)
      .single()

    if (fetchError || !workflow) {
      return errorResponse("Workflow not found", 404)
    }

    if (workflow.user_id !== user.id) {
      return errorResponse("Not authorized to activate this workflow", 403)
    }

    // Can only activate workflows that are draft or inactive
    if (workflow.status === 'active') {
      logger.warn(`Workflow already active: ${workflow.id}`)
      return jsonResponse(workflow)
    }

    logger.info(`🚀 Activating workflow: ${workflow.name} (${workflow.id})`)

    // Load nodes and edges from normalized tables for validation
    const [nodesResult, edgesResult] = await Promise.all([
      serviceClient
        .from('workflow_nodes')
        .select('id, node_type, is_trigger, config, provider_id')
        .eq('workflow_id', resolvedParams.id),
      serviceClient
        .from('workflow_edges')
        .select('id, source_node_id, target_node_id')
        .eq('workflow_id', resolvedParams.id)
    ])

    // Convert to format expected by validation logic and TriggerLifecycleManager
    const nodes = (nodesResult.data || []).map((n: any) => ({
      id: n.id,
      data: {
        type: n.node_type,
        isTrigger: n.is_trigger,
        config: n.config || {},
        providerId: n.provider_id
      }
    }))
    const connections = (edgesResult.data || []).map((e: any) => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id
    }))

    const triggerNodes = nodes.filter((n: any) => n?.data?.isTrigger)
    const actionNodeIds = new Set<string>(
      nodes.filter((n: any) => !n?.data?.isTrigger && n?.data?.type).map((n: any) => n.id)
    )

    if (triggerNodes.length === 0) {
      return errorResponse('Workflow must have at least one trigger', 400)
    }

    if (actionNodeIds.size === 0) {
      return errorResponse('Workflow must have at least one action', 400)
    }

    // Check if any trigger is connected to an action (BFS from triggers)
    const hasConnectedAction = (() => {
      const nextMap = new Map<string, string[]>()
      const edges = connections.filter((e: any) => e && (e.source || e.from) && (e.target || e.to))

      for (const e of edges) {
        const src = String(e.source || e.from)
        const tgt = String(e.target || e.to)
        if (!nextMap.has(src)) nextMap.set(src, [])
        nextMap.get(src)!.push(tgt)
      }

      const visited = new Set<string>()
      const queue: string[] = triggerNodes.map((t: any) => String(t.id))
      for (const t of queue) visited.add(t)

      while (queue.length > 0) {
        const cur = queue.shift() as string
        if (actionNodeIds.has(cur)) return true
        const neighbors = nextMap.get(cur) || []
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n)
            queue.push(n)
          }
        }
      }
      return false
    })()

    if (!hasConnectedAction) {
      return errorResponse(
        'No action nodes connected to a trigger. Connect at least one action to activate this workflow.',
        400
      )
    }

    // Step 1: Update status to active (optimistic)
    const { data: activatedWorkflow, error: updateError } = await serviceClient
      .from("workflows")
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq("id", workflow.id)
      .select()
      .single()

    if (updateError) {
      logger.error('❌ Failed to update workflow status:', updateError)
      return errorResponse('Failed to update workflow status', 500)
    }

    // Step 2: Activate trigger resources (Microsoft Graph, Gmail, etc.)
    try {
      const { triggerLifecycleManager } = await import('@/lib/triggers')
      const result = await triggerLifecycleManager.activateWorkflowTriggers(
        workflow.id,
        user.id,
        nodes
      )

      if (result.errors.length > 0) {
        logger.error('❌ Trigger activation failed:', result.errors)

        // Rollback workflow status
        const { data: rolledBackWorkflow } = await serviceClient
          .from('workflows')
          .update({
            status: workflow.status, // Restore previous status
            updated_at: new Date().toISOString()
          })
          .eq('id', workflow.id)
          .select()
          .single()

        return errorResponse(
          'Failed to activate workflow triggers',
          500,
          {
            errors: result.errors,
            workflow: rolledBackWorkflow
          }
        )
      }

      logger.debug('✅ All trigger resources activated successfully')
    } catch (triggerError: any) {
      logger.error('❌ Failed to activate triggers:', triggerError)

      // Rollback workflow status
      const { data: rolledBackWorkflow } = await serviceClient
        .from('workflows')
        .update({
          status: workflow.status, // Restore previous status
          updated_at: new Date().toISOString()
        })
        .eq('id', workflow.id)
        .select()
        .single()

      return errorResponse(
        triggerError.message || 'Failed to activate workflow triggers',
        500,
        { workflow: rolledBackWorkflow }
      )
    }

    logger.info(`✅ Workflow activated: ${workflow.name} (${workflow.id})`)

    return jsonResponse({
      ...activatedWorkflow,
      activation: {
        success: true,
        message: 'Workflow activated successfully'
      }
    })

  } catch (error: any) {
    logger.error('❌ Unexpected error during activation:', error)
    return errorResponse(error.message || 'Failed to activate workflow', 500)
  }
}
