import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { AdvancedExecutionEngine } from "@/lib/execution/advancedExecutionEngine"

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

    const { workflowId, inputData = {}, options = {}, startNodeId } = await request.json()

    if (!workflowId) {
      return errorResponse("Workflow ID is required" , 400)
    }

    // Verify workflow ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .single()

    if (workflowError || !workflow) {
      return errorResponse("Workflow not found" , 404)
    }

    const executionEngine = new AdvancedExecutionEngine()

    // Create execution session
    const executionSession = await executionEngine.createExecutionSession(workflowId, user.id, "manual", {
      inputData,
      options,
    })

    // Execute workflow with advanced features
    const result = await executionEngine.executeWorkflowAdvanced(executionSession.id, inputData, {
      enableParallel: options.enableParallel ?? true,
      maxConcurrency: options.maxConcurrency ?? 3,
      enableSubWorkflows: options.enableSubWorkflows ?? true,
      startNodeId,
    })

    return jsonResponse({
      success: true,
      sessionId: executionSession.id,
      result,
    })
  } catch (error: any) {
    logger.error("Advanced workflow execution error:", error)
    return errorResponse(error.message || "Internal server error" , 500)
  }
}
