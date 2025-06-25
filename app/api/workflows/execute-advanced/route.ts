import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { AdvancedExecutionEngine } from "@/lib/execution/advancedExecutionEngine"

export async function POST(request: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workflowId, inputData = {}, options = {}, startNodeId } = await request.json()

    if (!workflowId) {
      return NextResponse.json({ error: "Workflow ID is required" }, { status: 400 })
    }

    // Verify workflow ownership
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("user_id", session.user.id)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    const executionEngine = new AdvancedExecutionEngine()

    // Create execution session
    const executionSession = await executionEngine.createExecutionSession(workflowId, session.user.id, "manual", {
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

    return NextResponse.json({
      success: true,
      sessionId: executionSession.id,
      result,
    })
  } catch (error: any) {
    console.error("Advanced workflow execution error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}
