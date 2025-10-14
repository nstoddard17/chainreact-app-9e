import { createSupabaseServerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    cookies()
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
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
      console.error("Template fetch error:", templateError)
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Log raw template data to debug
    console.log("Raw template data keys:", Object.keys(template))
    console.log("Nodes type:", typeof template.nodes)
    console.log("Is nodes parsed:", Array.isArray(template.nodes))

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
          console.error("Failed to parse field:", e)
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

    console.log('Template structure:', {
      rawNodesType: typeof template.nodes,
      parsedNodesType: typeof templateNodes,
      parsedNodesLength: templateNodes?.length || 0,
      parsedConnectionsLength: templateConnections?.length || 0,
      hasWorkflowJson: !!templateWorkflowJson,
      workflowJsonNodesLength: templateWorkflowJson?.nodes?.length || 0
    })

    console.log('Copying template:', {
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
      console.error("No nodes found in template to copy")
      return NextResponse.json({
        error: "Template has no nodes to copy",
        debug: {
          templateId: resolvedParams.id,
          templateName: template.name,
          hasNodes: !!template.nodes,
          hasWorkflowJson: !!template.workflow_json
        }
      }, { status: 400 })
    }

    console.log(`Creating workflow with ${nodes.length} nodes and ${connections.length} connections`)

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

    console.log(`Filtered ${nodes.length - filteredNodes.length} placeholder nodes, ${filteredNodes.length} nodes remaining`)

    // Keep ALL remaining nodes in the main workflow (including chain nodes)
    // Chain nodes should be visible on the canvas with their metadata intact
    const processedNodes = filteredNodes.map(node => {
      // Ensure all nodes use type: "custom" for React Flow compatibility
      return {
        ...node,
        type: 'custom'
      };
    });

    console.log('Template processing:', {
      totalNodes: processedNodes.length,
      totalConnections: connections.length,
      chainNodes: processedNodes.filter(n => n.data?.isAIAgentChild).length,
      aiAgentNodes: processedNodes.filter(n => n.data?.type === 'ai_agent').length
    });

    // Find the next available name by checking for existing copies
    const baseName = `${template.name} (Copy)`
    let finalName = baseName
    let copyNumber = 0

    // Fetch all workflows for this user that might match our naming pattern
    // We'll filter in JavaScript for more reliable matching
    const { data: existingWorkflows } = await supabase
      .from("workflows")
      .select("name")
      .eq("user_id", user.id)
      .ilike("name", `${template.name}%`)

    console.log('Checking for existing copies:', {
      templateName: template.name,
      baseName: baseName,
      existingCount: existingWorkflows?.length || 0,
      existingNames: existingWorkflows?.map(w => w.name) || []
    })

    if (existingWorkflows && existingWorkflows.length > 0) {
      // Extract existing copy numbers (0 = base name, 1+ = numbered copies)
      const existingNumbers = new Set<number>()

      existingWorkflows.forEach(workflow => {
        // Check if it's exactly the base name (first copy = 0)
        if (workflow.name === baseName) {
          existingNumbers.add(0)
        }
        // Check if it matches "Template (Copy) (N)" pattern
        else if (workflow.name.startsWith(baseName)) {
          const match = workflow.name.match(/\(Copy\) \((\d+)\)$/)
          if (match) {
            existingNumbers.add(parseInt(match[1], 10))
          }
        }
      })

      console.log('Found existing copy numbers:', Array.from(existingNumbers).sort((a, b) => a - b))

      // Find the next available number starting from 0
      while (existingNumbers.has(copyNumber)) {
        copyNumber++
      }

      // Generate the final name
      if (copyNumber === 0) {
        finalName = baseName  // "Template (Copy)" - no number suffix
      } else {
        finalName = `${baseName} (${copyNumber})`  // "Template (Copy) (1)", "Template (Copy) (2)", etc.
      }
    }

    console.log(`Creating workflow with name: ${finalName}`)

    // Create a new workflow from the template
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .insert({
        name: finalName,
        description: template.description,
        user_id: user.id,
        nodes: processedNodes,
        connections: connections,
        status: "draft",
        source_template_id: resolvedParams.id,
      })
      .select()
      .single()

    if (workflowError) {
      console.error("Error creating workflow from template:", workflowError)
      return NextResponse.json({
        error: "Failed to create workflow",
        details: workflowError.message,
        code: workflowError.code
      }, { status: 500 })
    }

    if (!workflow) {
      console.error("Workflow created but no data returned")
      return NextResponse.json({ error: "Workflow creation succeeded but no data returned" }, { status: 500 })
    }

    console.log(`Successfully created workflow ${workflow.id} from template`)
    return NextResponse.json({ workflow })
  } catch (error) {
    console.error("Unexpected error copying template:", error)
    return NextResponse.json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
