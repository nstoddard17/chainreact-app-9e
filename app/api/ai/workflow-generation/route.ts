import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { generateWorkflowFromPrompt } from "@/lib/ai/workflowGenerator"
import { randomUUID } from "crypto"

import { logger } from '@/lib/utils/logger'

// Helper to save nodes to normalized table
async function saveNodesToNormalizedTable(
  serviceClient: any,
  workflowId: string,
  userId: string,
  nodes: any[],
  connections: any[]
): Promise<void> {
  if (!nodes || nodes.length === 0) return

  // Create ID mapping for nodes (old ID -> new ID for new workflows, or keep existing for updates)
  const nodeIdMap = new Map<string, string>()
  const nodeRecords = nodes.map((node: any, index: number) => {
    const nodeId = node.id || randomUUID()
    nodeIdMap.set(node.id || nodeId, nodeId)
    return {
      id: nodeId,
      workflow_id: workflowId,
      user_id: userId,
      node_type: node.data?.type || node.type || 'unknown',
      label: node.data?.label || node.data?.title || node.data?.type || 'Unnamed Node',
      description: node.data?.description || null,
      config: node.data?.config || node.data || {},
      position_x: node.position?.x ?? 400,
      position_y: node.position?.y ?? (100 + index * 180),
      is_trigger: node.data?.isTrigger ?? false,
      provider_id: (node.data?.type || '').split(':')[0] || null,
      display_order: index,
      in_ports: [],
      out_ports: [],
      metadata: { position: node.position },
      updated_at: new Date().toISOString(),
    }
  })

  // Upsert nodes
  const { error: nodesError } = await serviceClient
    .from('workflow_nodes')
    .upsert(nodeRecords, { onConflict: 'id' })

  if (nodesError) {
    logger.error("Error upserting workflow nodes:", nodesError)
  }

  // Handle edges
  if (connections && connections.length > 0) {
    // First delete existing edges for this workflow
    await serviceClient
      .from('workflow_edges')
      .delete()
      .eq('workflow_id', workflowId)

    const edgeRecords = connections
      .filter((conn: any) => conn && (conn.source || conn.from) && (conn.target || conn.to))
      .map((conn: any) => {
        const sourceId = conn.source || conn.from
        const targetId = conn.target || conn.to
        return {
          id: conn.id || randomUUID(),
          workflow_id: workflowId,
          user_id: userId,
          source_node_id: nodeIdMap.get(sourceId) || sourceId,
          target_node_id: nodeIdMap.get(targetId) || targetId,
          source_port_id: conn.sourceHandle || 'source',
          target_port_id: conn.targetHandle || 'target',
          mappings: [],
          updated_at: new Date().toISOString(),
        }
      })

    if (edgeRecords.length > 0) {
      const { error: edgesError } = await serviceClient
        .from('workflow_edges')
        .insert(edgeRecords)

      if (edgesError) {
        logger.error("Error inserting workflow edges:", edgesError)
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    logger.debug("🔍 Workflow generation API called")
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.debug("❌ Authentication failed:", userError)
      return errorResponse("Unauthorized" , 401)
    }

    logger.debug("✅ User authenticated:", user.id)
    const { prompt, workflowId } = await request.json()

    if (!prompt) {
      logger.debug("❌ No prompt provided")
      return errorResponse("Prompt is required" , 400)
    }

    logger.debug("📝 Generating workflow for prompt:", prompt)

    // Generate workflow using AI
    const result = await generateWorkflowFromPrompt(prompt)

    logger.debug("🤖 AI generation result:", result)

    if (!result.success || !result.workflow) {
      logger.debug("❌ AI generation failed:", result.error)
      return errorResponse(result.error || "Failed to generate workflow" 
      , 500)
    }

    logger.debug("✅ AI generation successful, saving to database")

    // If a workflowId is provided, update the existing workflow
    if (workflowId) {
      const { data: workflow, error: updateError } = await supabase
        .from("workflows")
        .update({
          name: result.workflow.name,
          description: result.workflow.description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId)
        .select()
        .single()

      if (updateError) {
        logger.error("❌ Database update error:", updateError)
        return errorResponse("Failed to update workflow" , 500)
      }

      // Save nodes and edges to normalized tables
      await saveNodesToNormalizedTable(
        serviceClient,
        workflowId,
        user.id,
        result.workflow.nodes,
        result.workflow.connections
      )

      logger.debug("✅ Workflow updated successfully")
      return jsonResponse({
        success: true,
        workflow,
        confidence: result.confidence,
        message: "Workflow updated successfully"
      })
    }

    // Create new workflow (without nodes/connections - they go to normalized tables)
    const newWorkflowId = randomUUID()
    const { data: workflow, error: createError } = await supabase
      .from("workflows")
      .insert({
        id: newWorkflowId,
        name: result.workflow.name,
        description: result.workflow.description,
        user_id: user.id,
        status: "draft",
      })
      .select()
      .single()

    if (createError) {
      logger.error("❌ Database create error:", createError)
      return errorResponse("Failed to create workflow" , 500)
    }

    // Save nodes and edges to normalized tables
    await saveNodesToNormalizedTable(
      serviceClient,
      newWorkflowId,
      user.id,
      result.workflow.nodes,
      result.workflow.connections
    )

    logger.debug("✅ Workflow created successfully:", workflow.id)
    return jsonResponse({ 
      success: true,
      workflow,
      confidence: result.confidence,
      message: "Workflow created successfully"
    })
  } catch (error) {
    logger.error("❌ Workflow generation error:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function GET(request: NextRequest) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Return available workflow templates
    const templates = [
      {
        id: "email-to-slack",
        name: "Email to Slack",
        description: "Send email notifications to Slack",
        category: "Communication",
      },
      {
        id: "calendar-reminder",
        name: "Calendar Reminder",
        description: "Create calendar reminders from form submissions",
        category: "Productivity",
      },
    ]

    return jsonResponse({ templates })
  } catch (error) {
    logger.error("Template fetch error:", error)
    return errorResponse("Internal server error" , 500)
  }
}
