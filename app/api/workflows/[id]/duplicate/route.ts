import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { randomUUID } from "crypto"

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const serviceClient = await createSupabaseServiceClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const workflowId = params.id

    // Get the original workflow
    const { data: originalWorkflow, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !originalWorkflow) {
      return errorResponse("Workflow not found", 404)
    }

    // Generate new workflow ID
    const newWorkflowId = randomUUID()

    // Create duplicate workflow (without nodes/connections - they're in normalized tables)
    const { data: duplicatedWorkflow, error: createError } = await supabase
      .from('workflows')
      .insert({
        id: newWorkflowId,
        name: `${originalWorkflow.name} (Copy)`,
        description: originalWorkflow.description,
        user_id: user.id,
        status: 'draft', // Always start as draft
      })
      .select()
      .single()

    if (createError) {
      throw createError
    }

    // Copy nodes from normalized table
    const { data: originalNodes } = await serviceClient
      .from('workflow_nodes')
      .select('*')
      .eq('workflow_id', workflowId)

    if (originalNodes && originalNodes.length > 0) {
      // Create ID mapping for nodes (old ID -> new ID)
      const nodeIdMap = new Map<string, string>()
      const newNodes = originalNodes.map(node => {
        const newNodeId = randomUUID()
        nodeIdMap.set(node.id, newNodeId)
        return {
          ...node,
          id: newNodeId,
          workflow_id: newWorkflowId,
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      })

      await serviceClient.from('workflow_nodes').insert(newNodes)

      // Copy edges from normalized table, updating node references
      const { data: originalEdges } = await serviceClient
        .from('workflow_edges')
        .select('*')
        .eq('workflow_id', workflowId)

      if (originalEdges && originalEdges.length > 0) {
        const newEdges = originalEdges.map(edge => ({
          ...edge,
          id: randomUUID(),
          workflow_id: newWorkflowId,
          user_id: user.id,
          source_node_id: nodeIdMap.get(edge.source_node_id) || edge.source_node_id,
          target_node_id: nodeIdMap.get(edge.target_node_id) || edge.target_node_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

        await serviceClient.from('workflow_edges').insert(newEdges)
      }
    }

    // Log the duplication
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "workflow_duplicated",
      resource_type: "workflow",
      resource_id: duplicatedWorkflow.id,
      details: {
        original_workflow_id: workflowId,
        original_workflow_name: originalWorkflow.name,
        new_workflow_id: duplicatedWorkflow.id,
        new_workflow_name: duplicatedWorkflow.name
      },
      created_at: new Date().toISOString()
    })

    return jsonResponse({ workflow: duplicatedWorkflow })
  } catch (error: any) {
    console.error('Error duplicating workflow:', error)
    return errorResponse(error.message || "Failed to duplicate workflow", 500)
  }
}
