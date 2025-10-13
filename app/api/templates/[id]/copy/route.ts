import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    // Await params before using
    const resolvedParams = await params

    // Get the template from database
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", resolvedParams.id)
      .eq("is_public", true)
      .single()

    if (templateError || !template) {
      logger.error("Template fetch error:", templateError)
      return errorResponse("Template not found" , 404)
    }

    // Log raw template data to debug
    logger.debug("Raw template data keys:", Object.keys(template))
    logger.debug("Nodes type:", typeof template.nodes)
    logger.debug("Is nodes parsed:", Array.isArray(template.nodes))

    // Extract nodes and connections from the appropriate fields
    // Handle potential string JSONB fields that need parsing
    let nodes = []
    let connections = []

    // Parse JSONB fields if they come as strings
    const parseField = (field) => {
      if (typeof field === 'string') {
        try {
          return JSON.parse(field)
        } catch (e) {
          logger.error("Failed to parse field:", e)
          return null
        }
      }
      return field
    }

    const templateNodes = parseField(template.nodes)
    const templateConnections = parseField(template.connections)
    const templateWorkflowJson = parseField(template.workflow_json)

    // First try direct fields (these are what we're actually storing)
    if (templateNodes && Array.isArray(templateNodes) && templateNodes.length > 0) {
      nodes = templateNodes
      connections = templateConnections || []
    }
    // Fall back to workflow_json if direct fields are empty
    else if (templateWorkflowJson && templateWorkflowJson.nodes && templateWorkflowJson.nodes.length > 0) {
      nodes = templateWorkflowJson.nodes || []
      connections = templateWorkflowJson.edges || templateWorkflowJson.connections || []
    }
    // Final fallback - try any available data
    else {
      nodes = templateNodes || templateWorkflowJson?.nodes || []
      connections = templateConnections || templateWorkflowJson?.edges || templateWorkflowJson?.connections || []
    }

    logger.debug('Template structure:', {
      rawNodesType: typeof template.nodes,
      parsedNodesType: typeof templateNodes,
      parsedNodesLength: templateNodes?.length || 0,
      parsedConnectionsLength: templateConnections?.length || 0,
      hasWorkflowJson: !!templateWorkflowJson,
      workflowJsonNodesLength: templateWorkflowJson?.nodes?.length || 0
    })

    logger.debug('Copying template:', {
      templateName: template.name,
      nodeCount: nodes.length,
      connectionCount: connections.length,
      firstNode: nodes[0] ? {
        id: nodes[0].id,
        type: nodes[0].type,
        hasData: !!nodes[0].data,
        dataType: nodes[0].data?.type,
        title: nodes[0].data?.title
      } : null
    })

    // Validate we have nodes to copy
    if (!nodes || nodes.length === 0) {
      logger.error("No nodes found in template to copy")
      return jsonResponse({
        error: "Template has no nodes to copy",
        debug: {
          templateId: resolvedParams.id,
          templateName: template.name,
          hasNodes: !!template.nodes,
          hasWorkflowJson: !!template.workflow_json
        }
      }, { status: 400 })
    }

    logger.debug(`Creating workflow with ${nodes.length} nodes and ${connections.length} connections`)

    // Filter out UI-only placeholder nodes (Add Action buttons, etc.)
    const filteredNodes = nodes.filter(node => {
      const nodeType = node.data?.type || node.type
      const hasAddButton = node.data?.hasAddButton
      const isPlaceholder = node.data?.isPlaceholder

      // Remove addAction, insertAction, and chain placeholder nodes
      return nodeType !== 'addAction'
        && nodeType !== 'insertAction'
        && nodeType !== 'chain_placeholder'
        && !hasAddButton
        && !isPlaceholder
    })

    logger.debug(`Filtered ${nodes.length - filteredNodes.length} placeholder nodes, ${filteredNodes.length} nodes remaining`)

    // Keep ALL remaining nodes in the main workflow (including chain nodes)
    // Chain nodes should be visible on the canvas with their metadata intact
    const processedNodes = filteredNodes.map(node => {
      // Ensure all nodes use type: "custom" for React Flow compatibility
      return {
        ...node,
        type: 'custom'
      };
    });

    logger.debug('Template processing:', {
      totalNodes: processedNodes.length,
      totalConnections: connections.length,
      chainNodes: processedNodes.filter(n => n.data?.isAIAgentChild).length,
      aiAgentNodes: processedNodes.filter(n => n.data?.type === 'ai_agent').length
    });

    // Create a new workflow from the template
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .insert({
        name: `${template.name} (Copy)`,
        description: template.description,
        user_id: user.id,
        nodes: processedNodes,
        connections: connections,
        status: "draft",
      })
      .select()
      .single()

    if (workflowError) {
      logger.error("Error creating workflow from template:", workflowError)
      return errorResponse("Failed to create workflow", 500, {
        details: workflowError.message,
        code: workflowError.code
      })
    }

    if (!workflow) {
      logger.error("Workflow created but no data returned")
      return errorResponse("Workflow creation succeeded but no data returned" , 500)
    }

    logger.debug(`Successfully created workflow ${workflow.id} from template`)
    return jsonResponse({ workflow })
  } catch (error) {
    logger.error("Unexpected error copying template:", error)
    return errorResponse("Internal server error", 500, { details: error instanceof Error ? error.message : "Unknown error"
     })
  }
}
