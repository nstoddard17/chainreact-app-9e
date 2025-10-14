import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: Request,
  { params }: { params: { webhookId: string } }
) {
  const supabase = await createSupabaseRouteHandlerClient()
  const { webhookId } = params
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Verify the webhook belongs to the user
    const { data: webhook, error: webhookError } = await supabase
      .from('webhook_configs')
      .select('id')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (webhookError || !webhook) {
      return errorResponse("Webhook not found or unauthorized" , 404)
    }

    // Get executions for this webhook
    const { data: executions, error } = await supabase
      .from('webhook_executions')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      logger.error(`Error fetching executions for webhook ${webhookId}:`, error)
      return errorResponse("Failed to fetch executions" , 500)
    }

    return jsonResponse({ executions: executions || [] })

  } catch (error: any) {
    logger.error(`Error in GET /api/custom-webhooks/${webhookId}/executions:`, error)
    return errorResponse("Internal server error" , 500)
  }
} 