import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function GET(request: Request) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized", 401, { details: authError?.message  })
    }

    // Check environment variables
    const envCheck = {
      ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY,
      SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE: !!process.env.SUPABASE_SECRET_KEY,
    }

    // Check database connectivity
    const { data: workflows, error: dbError } = await supabase
      .from("workflows")
      .select("id, name")
      .eq("user_id", user.id)
      .limit(5)

    // Check integrations
    const { data: integrations, error: intError } = await supabase
      .from("integrations")
      .select("id, provider, status")
      .eq("user_id", user.id)
      .limit(5)

    return jsonResponse({
      success: true,
      user: { id: user.id, email: user.email },
      environment: envCheck,
      database: {
        connected: !dbError,
        error: dbError?.message || null,
        workflows: workflows?.length || 0,
        integrations: integrations?.length || 0,
      },
      workflows: workflows || [],
      integrations: integrations || [],
    })
  } catch (error: any) {
    logger.error("Debug endpoint error:", error)
    return errorResponse("Debug check failed", 500, {
        details: error.message,
        stack: error.stack
      })
  }
}

export async function POST(request: Request) {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { workflowId } = await request.json()

    // Get specific workflow data
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .single()

    if (workflowError || !workflow) {
      return errorResponse("Workflow not found", 404, { details: workflowError?.message  })
    }

    // Test execution context setup
    const executionContext = {
      data: { test: true },
      variables: {},
      results: {},
      testMode: true,
      userId: user.id,
      workflowId: workflow.id,
    }

    // Check for Gmail integrations if workflow uses Gmail
    let gmailIntegration = null
    if (workflow.nodes && workflow.nodes.some((node: any) => node.data.type === "gmail_action_send_email")) {
      const { data: integration, error: gmailError } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider", "gmail")
        .eq("status", "connected")
        .single()

      gmailIntegration = { 
        found: !!integration, 
        error: gmailError?.message || null,
        hasAccessToken: !!integration?.access_token,
        hasRefreshToken: !!integration?.refresh_token,
        expiresAt: integration?.expires_at || null
      }
    }

    return jsonResponse({
      success: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        nodesCount: workflow.nodes?.length || 0,
        connectionsCount: workflow.connections?.length || 0,
        hasNodes: !!(workflow.nodes && workflow.nodes.length > 0),
      },
      executionContext,
      gmailIntegration,
      nodes: workflow.nodes || [],
    })
  } catch (error: any) {
    logger.error("Debug workflow check error:", error)
    return errorResponse("Debug workflow check failed", 500, {
        details: error.message,
        stack: error.stack
      })
  }
} 