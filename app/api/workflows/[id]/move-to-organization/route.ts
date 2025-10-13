import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params
    const { organizationId } = await request.json()

    if (!organizationId) {
      return errorResponse("Organization ID is required" , 400)
    }

    const supabase = createSupabaseRouteHandlerClient()
    
    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Get the workflow to verify ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .single()

    if (workflowError || !workflow) {
      return errorResponse("Workflow not found or access denied" , 404)
    }

    // Check if workflow is already in an organization
    if (workflow.organization_id) {
      return errorResponse("Workflow is already associated with an organization" , 400)
    }

    // Verify user is a member of the target organization with appropriate permissions
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .single()

    if (membershipError || !membership) {
      return errorResponse("You are not a member of this organization" , 403)
    }

    // Check if user has permission to add workflows to the organization
    if (!["admin", "editor"].includes(membership.role)) {
      return errorResponse("You need admin or editor permissions to add workflows to this organization" , 403)
    }

    // Check if a workflow with the same name already exists in the organization
    const { data: existingWorkflow, error: checkError } = await supabase
      .from("workflows")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", workflow.name)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      return errorResponse("Failed to check for duplicate workflow names" , 500)
    }

    if (existingWorkflow) {
      return jsonResponse(
        { error: `A workflow named "${workflow.name}" already exists in this organization` },
        { status: 409 }
      )
    }

    // Move the workflow to the organization
    const { data: updatedWorkflow, error: updateError } = await supabase
      .from("workflows")
      .update({ organization_id: organizationId })
      .eq("id", workflowId)
      .select()
      .single()

    if (updateError) {
      logger.error("Error updating workflow:", updateError)
      return errorResponse("Failed to move workflow to organization" , 500)
    }

    return jsonResponse(updatedWorkflow)

  } catch (error) {
    logger.error("Error in move-to-organization:", error)
    return errorResponse("Internal server error" , 500)
  }
} 