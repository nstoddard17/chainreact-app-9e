import { randomUUID } from "crypto"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { getFlowRepository } from "@/src/lib/workflows/builder/api/helpers"
import { loadWorkflowNodes, loadWorkflowEdges, nodeToLegacyFormat, edgeToLegacyFormat } from "@/lib/workflows/loadWorkflowGraph"
import { logger } from '@/lib/utils/logger'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Use service client for initial existence check (bypasses RLS)
    // This matches the list endpoint behavior and ensures team/org workflows are accessible
    const serviceClient = await createSupabaseServiceClient()
    const { data: workflowExists, error: existsError } = await serviceClient
      .from("workflows")
      .select("id, user_id, workspace_type, workspace_id")
      .eq("id", resolvedParams.id)
      .single()

    if (existsError || !workflowExists) {
      logger.error('Workflow does not exist:', resolvedParams.id, existsError)
      return errorResponse("Workflow not found", 404)
    }

    // Log for debugging
    logger.info('🔍 [Workflow API] Checking access:', {
      workflowId: resolvedParams.id,
      workflowOwnerId: workflowExists.user_id,
      currentUserId: user.id,
      isOwner: workflowExists.user_id === user.id,
      workspaceType: workflowExists.workspace_type
    })

    // Verify user has access: owner, team/org member, or shared access
    let hasAccess = false

    // Check if user is the owner
    if (workflowExists.user_id === user.id) {
      hasAccess = true
    }

    // Check team/org membership if not owner
    if (!hasAccess && workflowExists.workspace_type === 'team' && workflowExists.workspace_id) {
      const { data: teamMember } = await serviceClient
        .from('team_members')
        .select('team_id')
        .eq('team_id', workflowExists.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (teamMember) hasAccess = true
    }

    if (!hasAccess && workflowExists.workspace_type === 'organization' && workflowExists.workspace_id) {
      const { data: orgMember } = await serviceClient
        .from('organization_members')
        .select('organization_id')
        .eq('organization_id', workflowExists.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (orgMember) hasAccess = true
    }

    // Check shared access via workflow_shares
    if (!hasAccess) {
      const { data: shareRecord } = await serviceClient
        .from('workflow_shares')
        .select('id')
        .eq('workflow_id', resolvedParams.id)
        .eq('shared_with', user.id)
        .maybeSingle()
      if (shareRecord) hasAccess = true
    }

    if (!hasAccess) {
      logger.error('User does not have access to workflow:', {
        workflowId: resolvedParams.id,
        userId: user.id,
        workspaceType: workflowExists.workspace_type
      })
      return errorResponse("Access denied", 403)
    }

    // Fetch full workflow metadata using service client
    const { data: workflow, error } = await serviceClient
      .from("workflows")
      .select("id, name, description, status, user_id, workspace_id, created_at, updated_at, created_by, last_modified_by")
      .eq("id", resolvedParams.id)
      .single()

    if (error) {
      logger.error('Error fetching workflow:', error)
      return errorResponse("Failed to fetch workflow", 500)
    }

    // Load nodes and edges from normalized tables
    const [nodes, edges] = await Promise.all([
      loadWorkflowNodes(serviceClient, resolvedParams.id),
      loadWorkflowEdges(serviceClient, resolvedParams.id)
    ])

    // Convert to legacy format for backward compatibility with frontend
    const legacyNodes = nodes.map(nodeToLegacyFormat)
    const legacyConnections = edges.map(edgeToLegacyFormat)

    // Sanitize nodes: drop UI-only or malformed nodes
    const sanitizeNodes = (nodeList: any[]) =>
      (Array.isArray(nodeList) ? nodeList : []).filter((n: any) => {
        if (!n) return false
        if (n.type === 'addAction') return false
        const dataType = n?.data?.type
        const isTrigger = Boolean(n?.data?.isTrigger)
        return Boolean(dataType || isTrigger)
      })

    const sanitizedNodes = sanitizeNodes(legacyNodes)

    if (legacyNodes.length !== sanitizedNodes.length) {
      logger.warn('🧹 [Workflow API] Sanitized malformed/UI nodes on GET', {
        workflowId: workflow.id,
        before: legacyNodes.length,
        after: sanitizedNodes.length
      })
    }

    const responseData = {
      ...workflow,
      nodes: sanitizedNodes,
      connections: legacyConnections
    }

    return jsonResponse(responseData)
  } catch (error) {
    logger.error('Workflow API error:', error)
    return errorResponse("Internal server error", 500)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const body = await request.json()
    const resolvedParams = await params

    logger.info('📝 [Workflow API] Updating workflow with body:', {
      id: resolvedParams.id,
      name: body.name,
      hasName: 'name' in body,
      nameType: typeof body.name,
      bodyKeys: Object.keys(body),
      nodesCount: body.nodes?.length,
      connectionsCount: body.connections?.length
    })

    // Use service client to verify workflow exists and check access (bypasses RLS)
    const serviceClient = await createSupabaseServiceClient()
    const { data: workflow, error: checkError } = await serviceClient
      .from("workflows")
      .select("id, user_id, status, workspace_type, workspace_id")
      .eq("id", resolvedParams.id)
      .single()

    if (checkError || !workflow) {
      return errorResponse("Workflow not found", 404)
    }

    // Verify user has write access: owner or team/org member
    let hasWriteAccess = workflow.user_id === user.id

    if (!hasWriteAccess && workflow.workspace_type === 'team' && workflow.workspace_id) {
      const { data: teamMember } = await serviceClient
        .from('team_members')
        .select('team_id')
        .eq('team_id', workflow.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (teamMember) hasWriteAccess = true
    }

    if (!hasWriteAccess && workflow.workspace_type === 'organization' && workflow.workspace_id) {
      const { data: orgMember } = await serviceClient
        .from('organization_members')
        .select('organization_id')
        .eq('organization_id', workflow.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (orgMember) hasWriteAccess = true
    }

    if (!hasWriteAccess) {
      return errorResponse("Not authorized to update this workflow", 403)
    }

    const previousStatus = workflow.status

    // Load current nodes/edges from normalized tables for safety checks
    const [currentNodes, currentEdges] = await Promise.all([
      loadWorkflowNodes(serviceClient, resolvedParams.id),
      loadWorkflowEdges(serviceClient, resolvedParams.id)
    ])

    // CRITICAL SAFETY CHECK: Prevent node erasure
    if ('nodes' in body && Array.isArray(body.nodes) && body.nodes.length === 0) {
      if (currentNodes.length > 0) {
        logger.error('❌ [SAFETY] Preventing node erasure - request contains empty nodes but workflow has', currentNodes.length, 'nodes')
        return errorResponse("Cannot save empty nodes - workflow currently has nodes. This might be a loading issue. Please refresh and try again.", 400, { code: "NODE_ERASURE_PREVENTED" })
      }
    }

    // Normalize nodes using registry
    const nodeRegistry = new Map(ALL_NODE_COMPONENTS.map(node => [node.type, node]))
    const normalizeNodes = (list: any[]) =>
      (Array.isArray(list) ? list : []).map((node: any) => {
        if (!node) return node
        const nodeType = node?.data?.type || node?.type
        if (!nodeType) return node
        const registryNode = nodeRegistry.get(nodeType)
        if (!registryNode) return node
        const isTrigger = Boolean(registryNode.isTrigger)
        return {
          ...node,
          isTrigger: node?.isTrigger ?? isTrigger,
          data: {
            ...(node.data || {}),
            type: node.data?.type || nodeType,
            isTrigger: node.data?.isTrigger ?? isTrigger,
            nodeKind: node.data?.nodeKind || (isTrigger ? 'trigger' : 'action')
          }
        }
      })

    // Prepare workflow metadata update (excludes nodes/connections)
    const { nodes: bodyNodes, connections: bodyConnections, ...metadataUpdate } = body
    const updatedAtIso = new Date().toISOString()

    const workflowUpdatePayload: Record<string, any> = {
      ...metadataUpdate,
      updated_at: updatedAtIso,
      last_modified_by: user.id
    }

    // Remove validationState if not supported
    const includesValidationState = Object.prototype.hasOwnProperty.call(workflowUpdatePayload, 'validationState')

    const performUpdate = async (payload: Record<string, any>) => {
      return serviceClient
        .from("workflows")
        .update(payload)
        .eq("id", resolvedParams.id)
        .select("id, name, description, status, user_id, workspace_id, created_at, updated_at, created_by, last_modified_by")
        .single()
    }

    let updateResult = await performUpdate(workflowUpdatePayload)

    if (updateResult.error?.code === 'PGRST204' && includesValidationState) {
      logger.warn('⚠️ [Workflow API] validationState column missing - retrying without it')
      const fallbackPayload = { ...workflowUpdatePayload }
      delete fallbackPayload.validationState
      updateResult = await performUpdate(fallbackPayload)
    }

    if (updateResult.error) {
      logger.error('❌ [Workflow API] Update error:', updateResult.error)
      return errorResponse(updateResult.error.message, 500)
    }

    const data = updateResult.data

    // Save nodes and edges to normalized tables
    let nodes: any[] = []
    let connections: any[] = []

    if (Array.isArray(bodyNodes)) {
      const normalizedBodyNodes = normalizeNodes(bodyNodes)

      // Sanitize nodes: drop UI-only or malformed nodes
      const sanitizeNodes = (list: any[]) =>
        (Array.isArray(list) ? list : []).filter((n: any) => {
          if (!n) return false
          if (n.type === 'addAction') return false
          const dataType = n?.data?.type
          const isTrigger = Boolean(n?.data?.isTrigger)
          return Boolean(dataType || isTrigger)
        })

      nodes = sanitizeNodes(normalizedBodyNodes)

      if (normalizedBodyNodes.length !== nodes.length) {
        logger.warn('🧹 [Workflow API] Sanitized malformed/UI nodes on PUT', {
          workflowId: resolvedParams.id,
          before: normalizedBodyNodes.length,
          after: nodes.length
        })
      }

      // Save to normalized table
      const repository = await getFlowRepository(serviceClient)

      const flowNodes = nodes.map((node: any, index: number) => ({
        id: node.id,
        type: node.data?.type || node.type || 'unknown',
        label: node.data?.label || node.data?.type || 'Unnamed Node',
        description: node.data?.description,
        config: node.data?.config || {},
        inPorts: [],
        outPorts: [],
        io: { inputSchema: undefined, outputSchema: undefined },
        policy: { timeoutMs: 60000, retries: 0 },
        costHint: 0,
        metadata: {
          position: node.position || { x: 400, y: 100 + index * 180 },
          isTrigger: Boolean(node.data?.isTrigger),
          providerId: node.data?.providerId,
        },
      }))

      await repository.saveNodes(resolvedParams.id, flowNodes, user.id)
      logger.info(`[Workflow API] Saved ${flowNodes.length} nodes to workflow_nodes table`)
    } else {
      // Use current nodes from normalized table
      nodes = currentNodes.map(nodeToLegacyFormat)
    }

    if (Array.isArray(bodyConnections)) {
      connections = bodyConnections

      // Save to normalized table
      const repository = await getFlowRepository(serviceClient)

      // Helper to check if a string is a valid UUID
      const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

      const flowEdges = connections
        .filter((conn: any) => conn && (conn.source || conn.from) && (conn.target || conn.to))
        .map((conn: any) => ({
          // Use existing ID only if it's a valid UUID, otherwise generate a new one
          id: (conn.id && isValidUUID(conn.id)) ? conn.id : randomUUID(),
          from: {
            nodeId: String(conn.source || conn.from),
            portId: conn.sourceHandle || 'source',
          },
          to: {
            nodeId: String(conn.target || conn.to),
            portId: conn.targetHandle || 'target',
          },
          mappings: [],
        }))

      if (flowEdges.length > 0) {
        await repository.saveEdges(resolvedParams.id, flowEdges, user.id)
        logger.info(`[Workflow API] Saved ${flowEdges.length} edges to workflow_edges table`)
      }
    } else {
      // Use current edges from normalized table
      connections = currentEdges.map(edgeToLegacyFormat)
    }

    logger.info('✅ [Workflow API] Successfully updated workflow:', resolvedParams.id)

    // Determine graph connectivity (trigger → action)
    const triggerNodes = nodes.filter((n: any) => n?.data?.isTrigger)
    const actionNodeIds = new Set<string>(nodes.filter((n: any) => !n?.data?.isTrigger && n?.data?.type).map((n: any) => n.id))
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

    // Auto-wire single trigger to single action if not connected
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

      connections = [...connections, newEdge]

      // Save to normalized table
      const repository = await getFlowRepository(serviceClient)
      await repository.saveEdges(resolvedParams.id, [{
        id: newEdge.id,
        from: { nodeId: triggerId, portId: 'out' },
        to: { nodeId: actionId, portId: 'in' },
        mappings: []
      }], user.id)

      logger.info('🔗 Auto-connected single trigger to single action')
    }

    // Auto-wire disconnected triggers to nearest actions
    if (triggerNodes.length > 0 && actionNodeIds.size > 0) {
      const existingEdges = new Set<string>(edges.map((e: any) => `${e.source || e.from}->${e.target || e.to}`))
      const actions = nodes.filter((n: any) => !n?.data?.isTrigger && n?.data?.type)

      const findReachable = (startId: string) => {
        const nextMap = new Map<string, string[]>()
        for (const e of connections) {
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

      const newEdgesToAdd: any[] = []
      for (const trig of triggerNodes) {
        const reachable = findReachable(String(trig.id))
        const isConnectedToAnyAction = actions.some((a: any) => reachable.has(String(a.id)))
        if (isConnectedToAnyAction) continue

        // Find nearest action
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
          connections.push(newEdge)
          newEdgesToAdd.push({
            id: newEdge.id,
            from: { nodeId: newEdge.source, portId: 'out' },
            to: { nodeId: newEdge.target, portId: 'in' },
            mappings: []
          })
          existingEdges.add(edgeKey)
        }
      }

      if (newEdgesToAdd.length > 0) {
        const repository = await getFlowRepository(serviceClient)
        await repository.saveEdges(resolvedParams.id, newEdgesToAdd, user.id)
        logger.info('🔗 Auto-connected triggers to nearest actions where needed')
      }
    }

    // Recompute connectivity after auto-wire
    const recomputeHasConnected = (() => {
      const nextMap = new Map<string, string[]>()
      for (const e of connections) {
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
      // If previously active, unregister webhooks
      if (previousStatus === 'active') {
        try {
          const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
          const webhookManager = new TriggerWebhookManager()
          await webhookManager.unregisterWorkflowWebhooks(data.id)
          logger.info('♻️ Unregistered existing webhooks due to missing action connections')
        } catch (cleanupErr) {
          logger.warn('⚠️ Failed to unregister webhooks after connectivity check:', cleanupErr)
        }
      }

      // Force deactivate
      const { data: forced, error: forceErr } = await serviceClient
        .from('workflows')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', resolvedParams.id)
        .select()
        .single()

      if (forceErr) {
        logger.warn('⚠️ Failed to force-deactivate workflow lacking action connections:', forceErr)
      }

      const responsePayload = {
        ...(forced || data),
        nodes,
        connections,
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

    const nodesProvided = Object.prototype.hasOwnProperty.call(body, 'nodes')
    const statusChangedToActive = statusProvided && !wasActive && isActiveNow
    const shouldRegisterWebhooks = data && (statusChangedToActive || (nodesProvided && wasActive))
    const shouldUnregisterWebhooks = data && statusProvided && wasActive && !isActiveNow

    if (shouldRegisterWebhooks) {
      const { triggerLifecycleManager } = await import('@/lib/triggers')

      // Smart update: preserve polling state when appropriate
      if (wasActive && nodesProvided) {
        logger.info('🔄 Workflow is active and nodes provided - using smart trigger update')
        try {
          const result = await triggerLifecycleManager.updateWorkflowTriggers(
            data.id,
            user.id,
            nodes
          )

          if (!result.success) {
            logger.error('❌ Trigger update had errors:', result.errors)
            // Roll back to inactive - trigger is broken
            const { data: rolledBackWorkflow } = await serviceClient
              .from('workflows')
              .update({ status: 'inactive', updated_at: new Date().toISOString() })
              .eq('id', data.id)
              .select()
              .single()

            return jsonResponse({
              ...rolledBackWorkflow,
              nodes,
              connections,
              triggerActivationError: {
                message: 'Failed to update workflow triggers',
                details: result.errors
              }
            }, { status: 200 })
          } else {
            logger.info('✅ All triggers updated successfully')
          }
        } catch (updateErr) {
          logger.error('❌ Failed to update triggers:', updateErr)
          // Roll back to inactive - trigger is broken
          const { data: rolledBackWorkflow } = await serviceClient
            .from('workflows')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', data.id)
            .select()
            .single()

          return jsonResponse({
            ...rolledBackWorkflow,
            nodes,
            connections,
            triggerActivationError: {
              message: 'Failed to update workflow triggers',
              details: updateErr instanceof Error ? updateErr.message : String(updateErr)
            }
          }, { status: 200 })
        }
      } else if (statusChangedToActive && !wasActive) {
        // Fresh activation
        logger.info('🚀 Workflow being freshly activated - activating all triggers')
        try {
          const result = await triggerLifecycleManager.activateWorkflowTriggers(
            data.id,
            user.id,
            nodes
          )

          if (result.errors.length > 0) {
            logger.error('❌ Trigger activation failed:', result.errors)
            const { data: rolledBackWorkflow } = await serviceClient
              .from('workflows')
              .update({ status: 'inactive', updated_at: new Date().toISOString() })
              .eq('id', data.id)
              .select()
              .single()

            return jsonResponse({
              ...rolledBackWorkflow,
              nodes,
              connections,
              triggerActivationError: {
                message: 'Failed to activate workflow triggers',
                details: result.errors
              }
            }, { status: 200 })
          }
          logger.info('✅ All lifecycle-managed triggers activated successfully')
        } catch (lifecycleErr) {
          logger.error('❌ Failed to activate lifecycle-managed triggers:', lifecycleErr)
          const { data: rolledBackWorkflow } = await serviceClient
            .from('workflows')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', data.id)
            .select()
            .single()

          return jsonResponse({
            ...rolledBackWorkflow,
            nodes,
            connections,
            triggerActivationError: {
              message: 'Failed to activate workflow triggers',
              details: lifecycleErr instanceof Error ? lifecycleErr.message : String(lifecycleErr)
            }
          }, { status: 200 })
        }
      }
      // else: wasActive && !nodesProvided → no trigger changes, skip
    }

    if (shouldUnregisterWebhooks) {
      logger.info('🔗 Workflow deactivated - unregistering all trigger resources')

      try {
        const { triggerLifecycleManager } = await import('@/lib/triggers')
        await triggerLifecycleManager.deactivateWorkflowTriggers(data.id, user.id)
        logger.info('✅ Lifecycle-managed triggers deactivated')

        const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
        const webhookManager = new TriggerWebhookManager()
        await webhookManager.unregisterWorkflowWebhooks(data.id)
        logger.info('✅ Legacy webhooks unregistered')
      } catch (webhookError) {
        logger.error('Failed to unregister triggers on deactivation:', webhookError)
      }
    }

    // Cleanup unused webhooks
    if (shouldUnregisterWebhooks || (nodesProvided && wasActive)) {
      try {
        const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
        const webhookManager = new TriggerWebhookManager()
        await webhookManager.cleanupUnusedWebhooks(data.id)
        logger.info('✅ Cleaned up unused webhooks')
      } catch (cleanupErr) {
        logger.warn('⚠️ Failed to cleanup unused webhooks after workflow update:', cleanupErr)
      }
    }

    return jsonResponse({
      ...data,
      nodes,
      connections
    })
  } catch (error) {
    logger.error('❌ [Workflow API] Error in PUT handler:', error)
    return errorResponse("Internal server error", 500)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseRouteHandlerClient()
  const serviceClient = await createSupabaseServiceClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const resolvedParams = await params
    const workflowId = resolvedParams.id

    const { data: workflowRecord, error: fetchError } = await serviceClient
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .single()

    if (fetchError || !workflowRecord) {
      return errorResponse("Workflow not found", 404)
    }

    if (workflowRecord.user_id !== user.id) {
      return errorResponse("Not authorized to delete this workflow", 403)
    }

    try {
      const { triggerLifecycleManager } = await import('@/lib/triggers')
      await triggerLifecycleManager.deleteWorkflowTriggers(workflowId, user.id)
      logger.info('♻️ Deleted lifecycle-managed triggers before deleting workflow', { workflowId })

      const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
      const webhookManager = new TriggerWebhookManager()
      await webhookManager.unregisterWorkflowWebhooks(workflowId)
      logger.info('♻️ Unregistered legacy webhooks before deleting workflow', { workflowId })
    } catch (unregisterError) {
      logger.warn('⚠️ Failed to cleanup triggers before deletion:', unregisterError)
    }

    // Delete workflow (CASCADE will delete nodes and edges)
    const { error } = await serviceClient
      .from('workflows')
      .delete()
      .eq('id', workflowId)
      .eq('user_id', user.id)

    if (error) {
      return errorResponse(error.message, 500)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return errorResponse("Internal server error", 500)
  }
}
