import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { webhookManager } from "@/lib/webhooks/webhookManager"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      logger.debug('Auth error:', authError)
      return errorResponse("Unauthorized" , 401)
    }

    logger.debug('User authenticated:', user.id)

    // Get user's webhooks
    const webhooks = await webhookManager.getUserWebhooks(user.id)
    logger.debug('Webhooks fetched:', webhooks.length)
    
    return jsonResponse(webhooks)
  } catch (error: any) {
    logger.error("Error fetching webhooks:", error)
    return errorResponse("Failed to fetch webhooks", 500, { details: error.message  })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { workflowId, triggerType, providerId, config } = body

    if (!workflowId || !triggerType || !providerId) {
      return errorResponse("Missing required fields" , 400)
    }

    // Verify workflow belongs to user
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("id")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .single()

    if (workflowError || !workflow) {
      return errorResponse("Workflow not found" , 404)
    }

    // Register webhook
    const webhook = await webhookManager.registerWebhook(
      workflowId,
      user.id,
      triggerType,
      providerId,
      config
    )

    return jsonResponse(webhook)
  } catch (error: any) {
    logger.error("Error creating webhook:", error)
    return errorResponse("Failed to create webhook" , 500)
  }
} 