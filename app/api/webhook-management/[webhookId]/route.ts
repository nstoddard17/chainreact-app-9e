import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { webhookManager } from "@/lib/webhooks/webhookManager"

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { webhookId: string } }
) {
  const { webhookId } = params

  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const webhook = await webhookManager.getWebhook(webhookId)
    if (!webhook) {
      return errorResponse('Webhook not found' , 404)
    }

    if (webhook.userId !== user.id) {
      return errorResponse('Unauthorized' , 403)
    }

    return jsonResponse(webhook)
  } catch (error: any) {
    logger.error(`Error fetching webhook ${webhookId}:`, error)
    return errorResponse('Internal server error' , 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { webhookId: string } }
) {
  const { webhookId } = params

  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    // Verify webhook belongs to user
    const webhook = await webhookManager.getWebhook(webhookId)
    if (!webhook) {
      return errorResponse('Webhook not found' , 404)
    }

    if (webhook.userId !== user.id) {
      return errorResponse('Unauthorized' , 403)
    }

    // Unregister webhook
    await webhookManager.unregisterWebhook(webhookId)

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error(`Error deleting webhook ${webhookId}:`, error)
    return errorResponse('Internal server error' , 500)
  }
} 