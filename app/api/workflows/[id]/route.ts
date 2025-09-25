import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const resolvedParams = await params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(resolvedParams.id)) {
      return NextResponse.json({ error: "Invalid workflow ID format" }, { status: 400 })
    }

    // First try to get the workflow by ID only to see if it exists
    const { data: workflowExists, error: existsError } = await supabase
      .from("workflows")
      .select("id, user_id")
      .eq("id", resolvedParams.id)
      .single()

    if (existsError || !workflowExists) {
      console.error('Workflow does not exist:', resolvedParams.id, existsError)
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Log for debugging
    console.log('🔍 [Workflow API] Checking access:', {
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
        console.error('Error fetching owned workflow:', error)
        return NextResponse.json({ error: "Failed to fetch workflow" }, { status: 500 })
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
        console.warn('🧹 [Workflow API] Sanitized malformed/UI nodes on GET', {
          workflowId: data.id,
          before: data.nodes.length,
          after: safeData.nodes.length
        })
      }

      return NextResponse.json(safeData)
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
      console.error('User does not have access to workflow:', {
        workflowId: resolvedParams.id,
        userId: user.id,
        error: sharedError
      })
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    console.log('🔍 [Workflow API] Returning shared workflow data:', {
      id: sharedData.id,
      name: sharedData.name,
      nameType: typeof sharedData.name,
      nameIsEmpty: !sharedData.name,
      nameIsNull: sharedData.name === null,
      nameIsUndefined: sharedData.name === undefined,
      nameValue: JSON.stringify(sharedData.name)
    })

    return NextResponse.json(sharedData)
  } catch (error) {
    console.error('Workflow API error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const resolvedParams = await params

    console.log('📝 [Workflow API] Updating workflow with body:', {
      id: resolvedParams.id,
      name: body.name,
      hasName: 'name' in body,
      nameType: typeof body.name,
      bodyKeys: Object.keys(body),
      nodesCount: body.nodes?.length,
      connectionsCount: body.connections?.length
    })

    // First verify the user owns this workflow and get current status
    const { data: workflow, error: checkError } = await supabase
      .from("workflows")
      .select("id, user_id, status")
      .eq("id", resolvedParams.id)
      .single()

    if (checkError || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    if (workflow.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized to update this workflow" }, { status: 403 })
    }

    const previousStatus = workflow.status // Store the status before update

    // Use service client to bypass RLS for the actual update
    const serviceClient = await createSupabaseServiceClient()

    const { data, error } = await serviceClient
      .from("workflows")
      .update({
        ...body,
        updated_at: new Date().toISOString() // Ensure updated_at is set
      })
      .eq("id", resolvedParams.id)
      .select()
      .single()

    if (error) {
      console.error('❌ [Workflow API] Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ [Workflow API] Successfully updated workflow:', resolvedParams.id)

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
      console.warn('🧹 [Workflow API] Sanitized malformed/UI nodes on PUT', {
        workflowId: resolvedParams.id,
        before: nodes.length,
        after: sanitizedNodes.length
      })
      // Persist the sanitized graph
      await serviceClient
        .from('workflows')
        .update({ nodes: sanitizedNodes, updated_at: new Date().toISOString() })
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
        console.warn('⚠️ Failed to auto-connect single trigger→action:', saveErr)
      } else {
        console.log('🔗 Auto-connected single trigger to single action')
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
          console.warn('⚠️ Failed to persist auto-connections for triggers:', saveErr)
        } else {
          console.log('🔗 Auto-connected triggers to nearest actions where needed')
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
          console.log('♻️ Unregistered existing webhooks due to missing action connections')
        } catch (cleanupErr) {
          console.warn('⚠️ Failed to unregister webhooks after connectivity check:', cleanupErr)
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
        console.warn('⚠️ Failed to force-deactivate workflow lacking action connections:', forceErr)
      }

      const responsePayload = {
        ...(forced || data),
        status: 'draft',
        activationBlocked: true,
        activationReason: 'No action nodes connected to a trigger. Connect at least one action to activate this workflow.'
      }
      return NextResponse.json(responsePayload)
    }

    const statusProvided = Object.prototype.hasOwnProperty.call(body, 'status')
    const newStatus = statusProvided ? body.status : previousStatus
    const wasActive = previousStatus === 'active'
    const isActiveNow = newStatus === 'active'
    const shouldRegisterWebhooks = data && (isActiveNow || (!statusProvided && wasActive))
    const shouldUnregisterWebhooks = data && statusProvided && wasActive && !isActiveNow

    if (shouldRegisterWebhooks) {
      // If it was previously active, clean up existing webhooks first to avoid duplicates
      if (wasActive) {
        try {
          const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
          const webhookManager = new TriggerWebhookManager()
          await webhookManager.unregisterWorkflowWebhooks(data.id)
          console.log('♻️ Unregistered existing webhooks before re-registering (active workflow save)')
        } catch (cleanupErr) {
          console.warn('⚠️ Failed to unregister existing webhooks prior to re-register:', cleanupErr)
        }
      }
      // Get the full workflow data including nodes if not present in the update result
      let nodes = data.nodes || []

      // If nodes are not in the update result (e.g., when only status was updated),
      // fetch the full workflow to get nodes
      if (nodes.length === 0 && !body.nodes) {
        console.log('📋 Fetching full workflow data to check for webhook triggers...')
        const { data: fullWorkflow } = await serviceClient
          .from("workflows")
          .select("nodes")
          .eq("id", resolvedParams.id)
          .single()

        if (fullWorkflow) {
          nodes = fullWorkflow.nodes || []
          console.log(`📋 Found ${nodes.length} nodes in workflow`)
        }
      }

      // Check all webhook-based triggers in this workflow
      const triggerNodes = nodes.filter((node: any) => node.data?.isTrigger)

      console.log(`🔍 Webhook trigger check:`, {
        nodesCount: nodes.length,
        triggerCount: triggerNodes.length,
        triggers: triggerNodes.map((n: any) => ({ type: n?.data?.type, providerId: n?.data?.providerId }))
      })

      // List of providers that use webhooks
      const webhookProviders = [
        'airtable',
        'discord',
        'gmail',
        'google-calendar',
        'google-drive',
        'google-docs',
        'google-sheets',
        'google_sheets',
        'slack',
        'stripe',
        'shopify',
        'hubspot'
      ]

      for (const node of triggerNodes) {
        const providerId = node?.data?.providerId
        const triggerType = node?.data?.type
        if (!providerId || !webhookProviders.includes(providerId)) continue

        const triggerConfig = node?.data?.config || {}

      console.log(`🔗 Registering ${providerId} webhook trigger for workflow save`, {
          providerId,
          triggerType,
          config: triggerConfig,
          hasBaseId: !!triggerConfig.baseId,
          hasTableName: !!triggerConfig.tableName,
          tableName: triggerConfig.tableName || 'all tables'
        })

        try {
          const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
          const webhookManager = new TriggerWebhookManager()

          await webhookManager.registerWebhook({
            workflowId: data.id,
            userId: user.id,
            triggerType: triggerType,
            providerId: providerId,
            config: triggerConfig,
            webhookUrl: ''
          })

          console.log(`✅ Webhook registered for ${providerId} trigger: ${triggerType}`)
        } catch (webhookError) {
          console.error('Failed to register webhook on activation:', webhookError)
        }
      }
    }

    if (shouldUnregisterWebhooks) {
      console.log('🔗 Workflow deactivated/paused - unregistering webhooks')

      try {
        const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
        const webhookManager = new TriggerWebhookManager()

        // Unregister any webhooks for this workflow
        await webhookManager.unregisterWorkflowWebhooks(data.id)

        console.log('✅ Webhooks unregistered for non-active workflow state')
      } catch (webhookError) {
        console.error('Failed to unregister webhooks on deactivation:', webhookError)
      }
    }

    try {
      const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
      const webhookManager = new TriggerWebhookManager()
      await webhookManager.cleanupUnusedWebhooks(data.id)
    } catch (cleanupErr) {
      console.warn('⚠️ Failed to cleanup unused webhooks after workflow update:', cleanupErr)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('❌ [Workflow API] Error in PUT handler:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const resolvedParams = await params
    const workflowId = resolvedParams.id

    const { data: workflowRecord, error: fetchError } = await serviceClient
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .single()

    if (fetchError || !workflowRecord) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    if (workflowRecord.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized to delete this workflow" }, { status: 403 })
    }

    try {
      const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
      const webhookManager = new TriggerWebhookManager()
      await webhookManager.unregisterWorkflowWebhooks(workflowId)
      console.log('♻️ Unregistered webhooks before deleting workflow', { workflowId })
    } catch (unregisterError) {
      console.warn('⚠️ Failed to unregister webhooks before deletion:', unregisterError)
    }

    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', workflowId)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
