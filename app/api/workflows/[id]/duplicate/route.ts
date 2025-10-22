import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

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

    // Create duplicate
    const { data: duplicatedWorkflow, error: createError } = await supabase
      .from('workflows')
      .insert({
        name: `${originalWorkflow.name} (Copy)`,
        description: originalWorkflow.description,
        user_id: user.id,
        nodes: originalWorkflow.nodes,
        connections: originalWorkflow.connections,
        status: 'draft', // Always start as draft
      })
      .select()
      .single()

    if (createError) {
      throw createError
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
