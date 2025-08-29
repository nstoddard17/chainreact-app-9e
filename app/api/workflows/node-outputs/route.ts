import { NextResponse } from "next/server"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const nodeType = searchParams.get('nodeType')
    
    if (nodeType) {
      // Get output schema for a specific node type
      const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
      
      if (!nodeComponent) {
        return NextResponse.json({ error: "Node type not found" }, { status: 404 })
      }
      
      return NextResponse.json({
        success: true,
        nodeType: nodeType,
        title: nodeComponent.title,
        outputSchema: nodeComponent.outputSchema || [],
        testable: nodeComponent.testable || false
      })
    }
    
    // Get all node types with their output schemas
    const nodeOutputs = ALL_NODE_COMPONENTS
      .filter(component => component.outputSchema && component.outputSchema.length > 0)
      .map(component => ({
        type: component.type,
        title: component.title,
        description: component.description,
        category: component.category,
        providerId: component.providerId,
        testable: component.testable || false,
        outputSchema: component.outputSchema,
        outputFields: component.outputSchema?.map(field => ({
          name: field.name,
          label: field.label,
          type: field.type,
          description: field.description,
          example: field.example
        })) || []
      }))
    
    return NextResponse.json({
      success: true,
      nodes: nodeOutputs,
      totalNodes: nodeOutputs.length
    })
    
  } catch (error: any) {
    console.error("Node outputs API error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get node outputs" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { workflowId, nodeIds } = await request.json()
    
    if (!nodeIds || !Array.isArray(nodeIds)) {
      return NextResponse.json({ error: "Node IDs array is required" }, { status: 400 })
    }
    
    // Get output schemas for multiple nodes (useful for workflow context)
    const nodeOutputs = nodeIds.map(nodeId => {
      // In a real implementation, you'd look up the actual node in the workflow
      // For now, we'll return a placeholder structure
      return {
        nodeId,
        available: true,
        outputFields: [
          {
            name: "data",
            label: "Output Data",
            type: "object",
            description: "The data output from this node",
            path: `nodeOutputs.${nodeId}.data`
          }
        ]
      }
    })
    
    return NextResponse.json({
      success: true,
      workflowId,
      nodeOutputs,
      // Common template patterns that are always available
      commonPatterns: [
        {
          pattern: "{{data.fieldName}}",
          description: "Access field from current node's data",
          example: "{{data.email}}"
        },
        {
          pattern: "{{previousNode.output.fieldName}}",
          description: "Access field from the previous node's output",
          example: "{{previousNode.output.messageId}}"
        },
        {
          pattern: "{{nodeOutputs.nodeId.fieldName}}",
          description: "Access field from a specific node's output",
          example: "{{nodeOutputs.read_data_123.data}}"
        },
        {
          pattern: "{{helpers.formatDate(data.timestamp)}}",
          description: "Use helper functions to format data",
          example: "{{helpers.formatDate(data.createdAt)}}"
        }
      ]
    })
    
  } catch (error: any) {
    console.error("Node outputs context API error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get node outputs context" },
      { status: 500 }
    )
  }
} 