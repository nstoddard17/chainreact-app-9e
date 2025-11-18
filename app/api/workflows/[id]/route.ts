import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { getWebhookUrl } from "@/lib/utils/getBaseUrl"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const resolvedParams = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(resolvedParams.id)) {
      return errorResponse("Invalid workflow ID format" , 400)
    }

    // First try to get the workflow by ID only to see if it exists
    const { data: workflowExists, error: existsError } = await supabase
      .from("workflows")
      .select("id, user_id")
      .eq("id", resolvedParams.id)
      .single()

    if (existsError || !workflowExists) {
      logger.error('Workflow does not exist:', resolvedParams.id, existsError)
      return errorResponse("Workflow not found" , 404)
    }

    // Log for debugging
    logger.debug('🔍 [Workflow API] Checking access:', {
      workflowId: resolvedParams.id,
      workflowOwnerId: workflowExists.user_id,
      currentUserId: user.id,
      isOwner: workflowExists.user_id === user.id
    })

    // Check if user is the owner
    if (workflowExists.user_id === user.id) {
      // User is the owner, fetch full data
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", resolvedParams.id)
        .single()

      if (error) {
        logger.error('Error fetching owned workflow:', error)
        return errorResponse("Failed to fetch workflow" , 500)
      }

      // Sanitize payload: drop UI-only or malformed nodes that can render as "Unnamed Action"
      const sanitizeNodes = (nodes: any[]) =>
        (Array.isArray(nodes) ? nodes : []).filter((n: any) => {
          if (!n) return false
          if (n.type === 'addAction') return false
          const dataType = n?.data?.type
          const isTrigger = Boolean(n?.data?.isTrigger)
          return Boolean(dataType || isTrigger)
        })

      const safeData = {
        ...data,
        nodes: sanitizeNodes(data?.nodes)
      }

      if (Array.isArray(data?.nodes) && safeData.nodes.length !== data.nodes.length) {
        logger.warn('🧹 [Workflow API] Sanitized malformed/UI nodes on GET', {
          workflowId: data.id,
          before: data.nodes.length,
          after: safeData.nodes.length
        })
      }

      return jsonResponse(safeData)
    }

    // Not the owner, check if user has shared access
    const { data: sharedData, error: sharedError } = await supabase
      .from("workflows")
      .select(`
        *,
        workflow_shares!inner(
          permission,
          shared_with
        )
      `)
      .eq("id", resolvedParams.id)
      .eq("workflow_shares.shared_with", user.id)
      .single()

    if (sharedError || !sharedData) {
      logger.error('User does not have access to workflow:', {
        workflowId: resolvedParams.id,
        userId: user.id,
        error: sharedError
      })
      return errorResponse("Access denied" , 403)
    }

    logger.debug('🔍 [Workflow API] Returning shared workflow data:', {
      id: sharedData.id,
      name: sharedData.name,
      nameType: typeof sharedData.name,
      nameIsEmpty: !sharedData.name,
      nameIsNull: sharedData.name === null,
      nameIsUndefined: sharedData.name === undefined,
      nameValue: JSON.stringify(sharedData.name)
    })

    return jsonResponse(sharedData)
  } catch (error) {
    logger.error('Workflow API error:', error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const body = await request.json()
    const resolvedParams = await params

    logger.debug('📝 [Workflow API] Updating workflow with body:', {
      id: resolvedParams.id,
      name: body.name,
      hasName: 'name' in body,
      nameType: typeof body.name,
      bodyKeys: Object.keys(body),
      nodesCount: body.nodes?.length,
      connectionsCount: body.connections?.length
    })

    // CRITICAL SAFETY CHECK: Prevent node erasure
    // If body contains nodes array and it's empty, but workflow had nodes before
    if ('nodes' in body && Array.isArray(body.nodes) && body.nodes.length === 0) {
      // Check if workflow currently has nodes
      const { data: existingWorkflow } = await supabase
        .from("workflows")
        .select("nodes")
        .eq("id", resolvedParams.id)
        .single()

      if (existingWorkflow && existingWorkflow.nodes && existingWorkflow.nodes.length > 0) {
        logger.error('❌ [SAFETY] Preventing node erasure - request contains empty nodes but workflow has', existingWorkflow.nodes.length, 'nodes')
        return errorResponse("Cannot save empty nodes - workflow currently has nodes. This might be a loading issue. Please refresh and try again.", 400, { code: "NODE_ERASURE_PREVENTED"
         })
      }
    }

    // First verify the user owns this workflow and get current status
    const { data: workflow, error: checkError } = await supabase
      .from("workflows")
      .select("id, user_id, status")
      .eq("id", resolvedParams.id)
      .single()

    if (checkError || !workflow) {
      return errorResponse("Workflow not found" , 404)
    }

    if (workflow.user_id !== user.id) {
      return errorResponse("Not authorized to update this workflow" , 403)
    }

    const previousStatus = workflow.status // Store the status before update

    // Use service client to bypass RLS for the actual update
    const serviceClient = await createSupabaseServiceClient()

    // Additional check: if nodes array is provided but empty, exclude it from update
    // unless the workflow was truly meant to be cleared (which should be rare)
    const updateData = { ...body }
    if ('nodes' in updateData && Array.isArray(updateData.nodes) && updateData.nodes.length === 0) {
      // Get current workflow to check if it has nodes
      const { data: currentData } = await serviceClient
        .from("workflows")
        .select("nodes")
        .eq("id", resolvedParams.id)
        .single()

      if (currentData && currentData.nodes && currentData.nodes.length > 0) {
        logger.warn('⚠️ [SAFETY] Removing empty nodes array from update to preserve existing nodes')
        delete updateData.nodes
      }
    }

    const updatedAtIso = new Date().toISOString()
    const includesValidationState = Object.prototype.hasOwnProperty.call(updateData, 'validationState')
    const baseUpdatePayload = {
      ...updateData,
      updated_at: updatedAtIso,
      last_modified_by: user.id
    }

    const performUpdate = async (payload: Record<string, any>) => {
      return serviceClient
        .from("workflows")
        .update(payload)
        .eq("id", resolvedParams.id)
        .select()
        .single()
    }

    let updateResult = await performUpdate(baseUpdatePayload)

    if (updateResult.error?.code === 'PGRST204' && includesValidationState) {
      logger.warn('⚠️ [Workflow API] validationState column missing in schema cache - retrying without it')
      const fallbackPayload = { ...baseUpdatePayload }
      delete fallbackPayload.validationState

      updateResult = await performUpdate(fallbackPayload)

      if (!updateResult.error && updateResult.data) {
        updateResult = {
          ...updateResult,
          data: {
            ...updateResult.data,
            validationState: updateData.validationState
          }
        }
        logger.warn('⚠️ [Workflow API] validationState not persisted to database; returning request value for client state')
      }
    } else if (
      !updateResult.error &&
      includesValidationState &&
      updateResult.data &&
      typeof updateResult.data === 'object' &&
      !Object.prototype.hasOwnProperty.call(updateResult.data, 'validationState')
    ) {
      updateResult = {
        ...updateResult,
        data: {
          ...updateResult.data,
          validationState: updateData.validationState
        }
      }
    }

    if (updateResult.error) {
      logger.error('❌ [Workflow API] Update error:', updateResult.error)
      return errorResponse(updateResult.error.message , 500)
    }

    const data = updateResult.data

    logger.debug('✅ [Workflow API] Successfully updated workflow:', resolvedParams.id)

    // Determine graph connectivity (trigger → action). If broken, force deactivate and skip registration
    let nodes = (Array.isArray(body.nodes) ? body.nodes : (data.nodes || [])) as any[]
    let connections = (Array.isArray((body as any).connections) ? (body as any).connections : ((data as any).connections || [])) as any[]

    if ((nodes.length === 0 || connections.length === 0) && !Array.isArray(body.nodes)) {
      // Fetch full workflow to get nodes + connections when not provided in body
      const { data: full } = await serviceClient
        .from("workflows")
        .select("nodes, connections, status")
        .eq("id", resolvedParams.id)
        .single()
      if (full) {
        nodes = Array.isArray(full.nodes) ? full.nodes : []
        connections = Array.isArray((full as any).connections) ? (full as any).connections : []
      }
    }

    // Sanitize nodes right after update to avoid persisting UI/malformed nodes
    const sanitizeNodes = (list: any[]) =>
      (Array.isArray(list) ? list : []).filter((n: any) => {
        if (!n) return false
        if (n.type === 'addAction') return false
        const dataType = n?.data?.type
        const isTrigger = Boolean(n?.data?.isTrigger)
        return Boolean(dataType || isTrigger)
      })

    const sanitizedNodes = sanitizeNodes(nodes)
    if (sanitizedNodes.length !== nodes.length) {
      logger.warn('🧹 [Workflow API] Sanitized malformed/UI nodes on PUT', {
        workflowId: resolvedParams.id,
        before: nodes.length,
        after: sanitizedNodes.length
      })
      // Persist the sanitized graph - include connections to avoid losing them
      const sanitizePayload: any = {
        nodes: sanitizedNodes,
        updated_at: new Date().toISOString()
      }
      // If connections were provided in the original request, include them
      if (Array.isArray((body as any).connections)) {
        sanitizePayload.connections = (body as any).connections
      }
      await serviceClient
        .from('workflows')
        .update(sanitizePayload)
        .eq('id', resolvedParams.id)
    }

    const triggerNodes = sanitizedNodes.filter((n: any) => n?.data?.isTrigger)
    const actionNodeIds = new Set<string>(sanitizedNodes.filter((n: any) => !n?.data?.isTrigger && n?.data?.type).map((n: any) => n.id))
    const edges = connections.filter((e: any) => e && (e.source || e.from) && (e.target || e.to))

    const hasConnectedAction = (() => {
      if (triggerNodes.length === 0 || actionNodeIds.size === 0) return false
      const nextMap = new Map<string, string[]>()
      for (const e of edges) {
        const src = e.source || e.from
        const tgt = e.target || e.to
        if (!src || !tgt) continue
        if (!nextMap.has(src)) nextMap.set(src, [])
        nextMap.get(src)!.push(String(tgt))
      }
      const visited = new Set<string>()
      const queue: string[] = triggerNodes.map((t: any) => String(t.id))
      for (const t of queue) visited.add(t)
      while (queue.length > 0) {
        const cur = queue.shift() as string
        if (actionNodeIds.has(cur)) return true
        const ns = nextMap.get(cur) || []
        for (const n of ns) {
          if (!visited.has(n)) {
            visited.add(n)
            queue.push(n)
          }
        }
      }
      return false
    })()

    // If exactly one trigger and exactly one action exist with no connection, auto-wire them
    if (!hasConnectedAction && triggerNodes.length === 1 && actionNodeIds.size === 1) {
      const triggerId = String(triggerNodes[0].id)
      const actionId = Array.from(actionNodeIds)[0]
      const newEdge = {
        id: `e-${triggerId}-${actionId}`,
        source: triggerId,
        target: actionId,
        sourceHandle: 'out',
        targetHandle: 'in'
      }

      const updatedConnections = [...edges.map(e => ({
        id: e.id || `e-${e.source || e.from}-${e.target || e.to}`,
        source: String(e.source || e.from),
        target: String(e.target || e.to),
        sourceHandle: e.sourceHandle || e.fromHandle || 'out',
        targetHandle: e.targetHandle || e.toHandle || 'in'
      })), newEdge]

      // Persist connections only (avoid mutating nodes)
      const { data: savedGraph, error: saveErr } = await serviceClient
        .from('workflows')
        .update({ connections: updatedConnections, updated_at: new Date().toISOString() })
        .eq('id', resolvedParams.id)
        .select()
        .single()

      if (saveErr) {
        logger.warn('⚠️ Failed to auto-connect single trigger→action:', saveErr)
      } else {
        logger.debug('🔗 Auto-connected single trigger to single action')
        // Update local copy for subsequent checks
        connections = updatedConnections as any
      }
    }

    // If some triggers are not connected to any action, connect each to the nearest action by position
    if (triggerNodes.length > 0 && actionNodeIds.size > 0) {
      const existingEdges = new Set<string>(edges.map((e: any) => `${e.source || e.from}->${e.target || e.to}`))
      const actions = sanitizedNodes.filter((n: any) => !n?.data?.isTrigger && n?.data?.type)

      const findReachable = (startId: string) => {
        const nextMap = new Map<string, string[]>()
        const graphEdges = (connections || []).filter((e: any) => e && (e.source || e.from) && (e.target || e.to))
        for (const e of graphEdges) {
          const src = String(e.source || e.from)
          const tgt = String(e.target || e.to)
          if (!nextMap.has(src)) nextMap.set(src, [])
          nextMap.get(src)!.push(tgt)
        }
        const visited = new Set<string>()
        const queue: string[] = [startId]
        visited.add(startId)
        while (queue.length) {
          const cur = queue.shift() as string
          const ns = nextMap.get(cur) || []
          for (const n of ns) {
            if (!visited.has(n)) {
              visited.add(n)
              queue.push(n)
            }
          }
        }
        return visited
      }

      let added = false
      for (const trig of triggerNodes) {
        const reachable = findReachable(String(trig.id))
        const isConnectedToAnyAction = actions.some((a: any) => reachable.has(String(a.id)))
        if (isConnectedToAnyAction) continue

        // Find nearest action by Euclidean distance (fallback to first if positions missing)
        let nearest = actions[0]
        let bestDist = Number.POSITIVE_INFINITY
        for (const a of actions) {
          const dx = (trig.position?.x ?? 0) - (a.position?.x ?? 0)
          const dy = (trig.position?.y ?? 0) - (a.position?.y ?? 0)
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < bestDist) {
            bestDist = d
            nearest = a
          }
        }
        const edgeKey = `${trig.id}->${nearest.id}`
        if (!existingEdges.has(edgeKey)) {
          const newEdge = {
            id: `e-${trig.id}-${nearest.id}`,
            source: String(trig.id),
            target: String(nearest.id),
            sourceHandle: 'out',
            targetHandle: 'in'
          }
          connections = [
            ...((connections || []).map((e: any) => ({
              id: e.id || `e-${e.source || e.from}-${e.target || e.to}`,
              source: String(e.source || e.from),
              target: String(e.target || e.to),
              sourceHandle: e.sourceHandle || e.fromHandle || 'out',
              targetHandle: e.targetHandle || e.toHandle || 'in'
            }))),
            newEdge
          ]
          existingEdges.add(edgeKey)
          added = true
        }
      }

      if (added) {
        const { error: saveErr } = await serviceClient
          .from('workflows')
          .update({ connections, updated_at: new Date().toISOString() })
          .eq('id', resolvedParams.id)
        if (saveErr) {
          logger.warn('⚠️ Failed to persist auto-connections for triggers:', saveErr)
        } else {
          logger.debug('🔗 Auto-connected triggers to nearest actions where needed')
        }
      }
    }

    // Recompute connectivity after potential auto-wire
    const recomputeHasConnected = (() => {
      const nextMap = new Map<string, string[]>()
      const edges2 = (connections || []).filter((e: any) => e && (e.source || e.from) && (e.target || e.to))
      for (const e of edges2) {
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
        const ns = nextMap.get(cur) || []
        for (const n of ns) {
          if (!visited.has(n)) {
            visited.add(n)
            queue.push(n)
          }
        }
      }
      return false
    })()

    if (!recomputeHasConnected) {
      // If previously active, ensure webhooks are unregistered
      if (previousStatus === 'active') {
        try {
          const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
          const webhookManager = new TriggerWebhookManager()
          await webhookManager.unregisterWorkflowWebhooks(data.id)
          logger.debug('♻️ Unregistered existing webhooks due to missing action connections')
        } catch (cleanupErr) {
          logger.warn('⚠️ Failed to unregister webhooks after connectivity check:', cleanupErr)
        }
      }

      // Force deactivate in DB to avoid a broken active workflow
      const { data: forced, error: forceErr } = await serviceClient
        .from('workflows')
        // Use 'draft' to satisfy DB status constraint (no 'inactive' for workflows)
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', resolvedParams.id)
        .select()
        .single()
      if (forceErr) {
        logger.warn('⚠️ Failed to force-deactivate workflow lacking action connections:', forceErr)
      }

      const responsePayload = {
        ...(forced || data),
        status: 'draft',
        activationBlocked: true,
        activationReason: 'No action nodes connected to a trigger. Connect at least one action to activate this workflow.'
      }
      return jsonResponse(responsePayload)
    }

    const statusProvided = Object.prototype.hasOwnProperty.call(body, 'status')
    const newStatus = statusProvided ? body.status : previousStatus
    const wasActive = previousStatus === 'active'
    const isActiveNow = newStatus === 'active'

    // Only re-register webhooks if status changed to active OR if trigger nodes changed while active
    const nodesProvided = Object.prototype.hasOwnProperty.call(body, 'nodes')
    const statusChangedToActive = statusProvided && !wasActive && isActiveNow
    const shouldRegisterWebhooks = data && (statusChangedToActive || (nodesProvided && wasActive))
    const shouldUnregisterWebhooks = data && statusProvided && wasActive && !isActiveNow

    if (shouldRegisterWebhooks) {
      // If it was previously active, clean up existing resources first to avoid duplicates
      if (wasActive) {
        try {
          // Clean up legacy webhooks
          const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
          const webhookManager = new TriggerWebhookManager()
          await webhookManager.unregisterWorkflowWebhooks(data.id)
          logger.debug('♻️ Unregistered existing webhooks before re-registering (active workflow save)')

          // Clean up managed trigger resources (Microsoft Graph, etc.)
          const { triggerLifecycleManager } = await import('@/lib/triggers')
          await triggerLifecycleManager.deactivateWorkflowTriggers(data.id, user.id)
          logger.debug('♻️ Deactivated existing trigger resources before re-activating')
        } catch (cleanupErr) {
          logger.warn('⚠️ Failed to cleanup existing resources prior to re-register:', cleanupErr)
        }
      }
      // Get the full workflow data including nodes if not present in the update result
      let nodes = data.nodes || []

      // If nodes are not in the update result (e.g., when only status was updated),
      // fetch the full workflow to get nodes
      if (nodes.length === 0 && !body.nodes) {
        logger.debug('📋 Fetching full workflow data to check for triggers...')
        const { data: fullWorkflow } = await serviceClient
          .from("workflows")
          .select("nodes")
          .eq("id", resolvedParams.id)
          .single()

        if (fullWorkflow) {
          nodes = fullWorkflow.nodes || []
          logger.debug(`📋 Found ${nodes.length} nodes in workflow`)
        }
      }

      // FIRST: Use new TriggerLifecycleManager for providers that support it
      try {
        const { triggerLifecycleManager } = await import('@/lib/triggers')
        const result = await triggerLifecycleManager.activateWorkflowTriggers(
          data.id,
          user.id,
          nodes
        )
        if (result.errors.length > 0) {
          logger.error('❌ Trigger activation failed:', result.errors)
          // Rollback workflow status to previous state
          const { data: rolledBackWorkflow } = await serviceClient
            .from('workflows')
            .update({
              status: 'inactive',
              updated_at: new Date().toISOString()
            })
            .eq('id', data.id)
            .select()
            .single()

          // Return 200 with error details so frontend handles it gracefully
          return jsonResponse({
            ...rolledBackWorkflow,
            triggerActivationError: {
              message: 'Failed to activate workflow triggers',
              details: result.errors
            }
          }, { status: 200 })
        } 
          logger.debug('✅ All lifecycle-managed triggers activated successfully')
        
      } catch (lifecycleErr) {
        logger.error('❌ Failed to activate lifecycle-managed triggers:', lifecycleErr)
        // Rollback workflow status to previous state
        const { data: rolledBackWorkflow } = await serviceClient
          .from('workflows')
          .update({
            status: 'inactive',
            updated_at: new Date().toISOString()
          })
          .eq('id', data.id)
          .select()
          .single()

        // Return 200 with error details so frontend handles it gracefully
        return jsonResponse({
          ...rolledBackWorkflow,
          triggerActivationError: {
            message: 'Failed to activate workflow triggers',
            details: lifecycleErr instanceof Error ? lifecycleErr.message : String(lifecycleErr)
          }
        }, { status: 200 })
      }

      // DEPRECATED: Old webhook registration loop removed
      // All triggers now managed by TriggerLifecycleManager (see above)
      // This ensures proper workflow_id tracking and unified lifecycle management
    }

    if (shouldUnregisterWebhooks) {
      logger.debug('🔗 Workflow deactivated/inactive - unregistering all trigger resources')

      try {
        // Deactivate lifecycle-managed triggers (Microsoft Graph, etc.)
        const { triggerLifecycleManager } = await import('@/lib/triggers')
        await triggerLifecycleManager.deactivateWorkflowTriggers(data.id, user.id)
        logger.debug('✅ Lifecycle-managed triggers deactivated')

        // Unregister legacy webhooks
        const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
        const webhookManager = new TriggerWebhookManager()
        await webhookManager.unregisterWorkflowWebhooks(data.id)
        logger.debug('✅ Legacy webhooks unregistered')

      } catch (webhookError) {
        logger.error('Failed to unregister triggers on deactivation:', webhookError)
      }
    }

    // Only cleanup webhooks if we actually modified nodes or deactivated the workflow
    if (shouldUnregisterWebhooks || (nodesProvided && wasActive)) {
      try {
        const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
        const webhookManager = new TriggerWebhookManager()
        await webhookManager.cleanupUnusedWebhooks(data.id)
        logger.debug('✅ Cleaned up unused webhooks')
      } catch (cleanupErr) {
        logger.warn('⚠️ Failed to cleanup unused webhooks after workflow update:', cleanupErr)
      }
    }

    return jsonResponse(data)
  } catch (error) {
    logger.error('❌ [Workflow API] Error in PUT handler:', error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()
  const serviceClient = await createSupabaseServiceClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const resolvedParams = await params
    const workflowId = resolvedParams.id

    const { data: workflowRecord, error: fetchError } = await serviceClient
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .single()

    if (fetchError || !workflowRecord) {
      return errorResponse("Workflow not found" , 404)
    }

    if (workflowRecord.user_id !== user.id) {
      return errorResponse("Not authorized to delete this workflow" , 403)
    }

    try {
      // Delete lifecycle-managed trigger resources (Microsoft Graph, etc.)
      const { triggerLifecycleManager } = await import('@/lib/triggers')
      await triggerLifecycleManager.deleteWorkflowTriggers(workflowId, user.id)
      logger.debug('♻️ Deleted lifecycle-managed triggers before deleting workflow', { workflowId })

      // Unregister legacy webhooks
      const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
      const webhookManager = new TriggerWebhookManager()
      await webhookManager.unregisterWorkflowWebhooks(workflowId)
      logger.debug('♻️ Unregistered legacy webhooks before deleting workflow', { workflowId })
    } catch (unregisterError) {
      logger.warn('⚠️ Failed to cleanup triggers before deletion:', unregisterError)
    }

    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', workflowId)
      .eq('user_id', user.id)

    if (error) {
      return errorResponse(error.message , 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return errorResponse("Internal server error" , 500)
  }
}
