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

      return NextResponse.json(data)
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

    // Check if workflow status was changed from 'inactive' to 'active' and it has webhook triggers
    if (body.status === 'active' && previousStatus !== 'active' && data) {
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

      // Check if this workflow has any webhook-based triggers
      const triggerNode = nodes.find((node: any) => node.data?.isTrigger)

      console.log(`🔍 Webhook trigger check:`, {
        nodesCount: nodes.length,
        hasTrigger: !!triggerNode,
        triggerType: triggerNode?.data?.type,
        providerId: triggerNode?.data?.providerId
      })

      if (triggerNode) {
        const providerId = triggerNode.data?.providerId
        const triggerType = triggerNode.data?.type

        // List of providers that use webhooks
        const webhookProviders = ['airtable', 'discord', 'gmail', 'slack', 'stripe', 'shopify', 'hubspot']

        if (providerId && webhookProviders.includes(providerId)) {
          const triggerConfig = triggerNode.data?.config || {}

          console.log(`🔗 Workflow activated with ${providerId} webhook trigger - registering webhook`, {
            providerId,
            triggerType,
            config: triggerConfig,
            hasBaseId: !!triggerConfig.baseId,
            hasTableName: !!triggerConfig.tableName,
            tableName: triggerConfig.tableName || 'all tables'
          })

          try {
            // Import the webhook manager
            const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
            const webhookManager = new TriggerWebhookManager()

            // Register the webhook with full config including table filtering
            await webhookManager.registerWebhook({
              workflowId: data.id,
              userId: user.id,
              triggerType: triggerType,
              providerId: providerId,
              config: triggerConfig,
              webhookUrl: '' // Will be generated by the manager
            })

            console.log(`✅ Webhook registered for activated workflow with ${triggerConfig.tableName ? `table: ${triggerConfig.tableName}` : 'entire base'}`)
          } catch (webhookError) {
            // Log but don't fail the workflow update
            console.error('Failed to register webhook on activation:', webhookError)
          }
        }
      }
    }

    // Check if workflow was deactivated - webhooks should be unregistered
    // Only unregister if it was previously active to avoid unnecessary operations
    if (body.status === 'inactive' && previousStatus === 'active' && data) {
      console.log('🔗 Workflow deactivated - unregistering webhooks')

      try {
        const { TriggerWebhookManager } = await import('@/lib/webhooks/triggerWebhookManager')
        const webhookManager = new TriggerWebhookManager()

        // Unregister any webhooks for this workflow
        await webhookManager.unregisterWorkflowWebhooks(data.id)

        console.log('✅ Webhooks unregistered for deactivated workflow')
      } catch (webhookError) {
        console.error('Failed to unregister webhooks on deactivation:', webhookError)
      }
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

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const resolvedParams = await params

    const { error } = await supabase.from("workflows").delete().eq("id", resolvedParams.id).eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
