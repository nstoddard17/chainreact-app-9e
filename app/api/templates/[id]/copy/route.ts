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

    // Separate AI Agent chain nodes from main workflow nodes
    // The workflow builder expects chain nodes to be in chainsLayout, not as main workflow nodes
    const mainNodes = [];
    const aiAgentNodes = [];

    nodes.forEach(node => {
      if (node.data?.isAIAgentChild) {
        // This is a chain node, should not be in main workflow
        return;
      } else if (node.data?.type === 'ai_agent') {
        // This is an AI Agent node, need to populate its chainsLayout
        aiAgentNodes.push(node);
      }
      mainNodes.push(node);
    });

    // Process AI Agent nodes to populate chainsLayout with child nodes
    const processedNodes = mainNodes.map(node => {
      if (node.data?.type === 'ai_agent' && node.data?.config?.chainsLayout) {
        // Find all child nodes that belong to this AI Agent
        const childNodes = nodes.filter(n =>
          n.data?.parentAIAgentId === node.id && n.data?.isAIAgentChild
        );

        // Find all connections between child nodes
        const childNodeIds = new Set(childNodes.map(n => n.id));
        const childConnections = connections.filter(c =>
          childNodeIds.has(c.source) && childNodeIds.has(c.target)
        );

        // Update the chainsLayout with actual nodes and edges
        return {
          ...node,
          data: {
            ...node.data,
            config: {
              ...node.data.config,
              chainsLayout: {
                ...node.data.config.chainsLayout,
                nodes: childNodes.map(cn => ({
                  id: cn.id,
                  type: cn.type || 'custom',
                  position: cn.position,
                  data: cn.data
                })),
                edges: childConnections.map(ce => ({
                  id: ce.id,
                  source: ce.source,
                  target: ce.target
                }))
              }
            }
          }
        };
      }
      return node;
    });

    // Filter connections to only include those between main nodes
    const mainNodeIds = new Set(mainNodes.map(n => n.id));
    const mainConnections = connections.filter(c =>
      mainNodeIds.has(c.source) && mainNodeIds.has(c.target)
    );

    console.log('Template processing:', {
      originalNodes: nodes.length,
      mainNodes: mainNodes.length,
      chainNodes: nodes.length - mainNodes.length,
      originalConnections: connections.length,
      mainConnections: mainConnections.length,
      aiAgentCount: aiAgentNodes.length,
      processedNodesCount: processedNodes.length
    });

    // Create a new workflow from the template
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .insert({
        name: `${template.name} (Copy)`,
        description: template.description,
        user_id: user.id,
        nodes: processedNodes,
        connections: mainConnections,
        status: "draft",
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
