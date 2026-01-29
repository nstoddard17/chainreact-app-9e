import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { checkWorkflowAccess } from "@/src/lib/workflows/builder/api/helpers"

import { logger } from '@/lib/utils/logger'

// Implementation for shell command execution and result parsing
export async function POST(request: Request, { params }: { params: { id: string; suiteId: string } }) {
  try {
    const { id, suiteId } = params
    const body = await request.json()
    const { commands } = body

    // Get the supabase client
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Check workflow access using service client with explicit authorization
    const accessCheck = await checkWorkflowAccess(id, user.id, 'editor')

    if (!accessCheck.hasAccess) {
      const status = accessCheck.error === "Flow not found" ? 404 : 403
      return errorResponse(accessCheck.error || "Forbidden", status)
    }

    const workflow = accessCheck.workflow!

    const { data: testSuite, error: testSuiteError } = await supabase
      .from("test_suites")
      .select("*")
      .eq("id", suiteId)
      .eq("workflow_id", id)
      .single()

    if (testSuiteError || !testSuite) {
      return errorResponse("Test suite not found" , 404)
    }

    // Process the commands and generate test cases
    const results = commands.map((command: string) => {
      // In a real implementation, we would execute the command in a secure sandbox
      // For now, we'll simulate the execution
      return {
        command,
        output: `Simulated output for: ${command}`,
        exitCode: 0,
      }
    })

    // Store the test results
    const { data: testResults, error: testResultsError } = await supabase
      .from("test_results")
      .insert({
        test_suite_id: suiteId,
        workflow_id: id,
        results: JSON.stringify(results),
        status: "completed",
        executed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (testResultsError) {
      return errorResponse("Failed to store test results" , 500)
    }

    return jsonResponse({
      success: true,
      testResults,
    })
  } catch (error) {
    logger.error("Error generating tests:", error)
    return errorResponse("Failed to generate tests" , 500)
  }
}
