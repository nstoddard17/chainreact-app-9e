import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { RealTimeCollaboration } from "@/lib/collaboration/realTimeCollaboration"

import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    const { workflowId } = await request.json()

    if (!workflowId) {
      return errorResponse("Workflow ID is required" , 400)
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(workflowId)) {
      return errorResponse("Invalid workflow ID format" , 400)
    }

    // Verify workflow access - first try as owner
    let { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .single()

    let hasEditAccess = true // Owner has edit access

    // If not found as owner, check shared access
    if (workflowError && (workflowError.code === 'PGRST116' || workflowError.message.includes('No rows'))) {
      const { data: sharedWorkflow, error: sharedError } = await supabase
        .from("workflows")
        .select(`
          *,
          workflow_shares!inner(
            permission,
            shared_with
          )
        `)
        .eq("id", workflowId)
        .eq("workflow_shares.shared_with", user.id)
        .single()

      workflow = sharedWorkflow
      workflowError = sharedError
      hasEditAccess = sharedWorkflow?.workflow_shares?.[0]?.permission === 'edit'
    }

    if (workflowError || !workflow) {
      return errorResponse("Workflow not found or access denied" , 404)
    }

    // Check if collaboration tables exist by testing a simple query
    try {
      await supabase
        .from("collaboration_sessions")
        .select("id")
        .limit(1)
    } catch (tableError: any) {
      logger.error("Collaboration tables not found:", tableError)
      return errorResponse("Collaboration feature not available. Please contact support." 
      , 503)
    }

    const collaboration = new RealTimeCollaboration()
    const collaborationSession = await collaboration.joinCollaborationSession(workflowId, user.id)

    return jsonResponse({
      success: true,
      session: {
        ...collaborationSession,
        hasEditAccess
      },
    })
  } catch (error: any) {
    logger.error("Collaboration join error:", error)
    
    // Provide more specific error messages
    if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      return errorResponse("Collaboration feature not available. Database tables missing." 
      , 503)
    }
    
    return errorResponse(error.message || "Internal server error" , 500)
  }
}
