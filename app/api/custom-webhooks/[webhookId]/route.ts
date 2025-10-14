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

    const { data: webhook, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      logger.error(`Error fetching webhook ${webhookId}:`, error)
      return errorResponse("Webhook not found or unauthorized" , 404)
    }

    return jsonResponse(webhook)

  } catch (error: any) {
    logger.error(`Error in GET /api/custom-webhooks/${webhookId}:`, error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function PUT(
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

    const body = await request.json()
    const { name, description, webhook_url, method, headers, body_template, status } = body

    const { data: webhook, error } = await supabase
      .from('webhook_configs')
      .update({
        name,
        description,
        webhook_url,
        method,
        headers,
        body_template,
        status
      })
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      logger.error(`Error updating webhook ${webhookId}:`, error)
      return errorResponse("Failed to update webhook" , 500)
    }

    return jsonResponse(webhook)

  } catch (error: any) {
    logger.error(`Error in PUT /api/custom-webhooks/${webhookId}:`, error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function DELETE(
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

    const { error } = await supabase
      .from('webhook_configs')
      .delete()
      .eq('id', webhookId)
      .eq('user_id', user.id)

    if (error) {
      logger.error(`Error deleting webhook ${webhookId}:`, error)
      return errorResponse("Failed to delete webhook" , 500)
    }

    return jsonResponse({ success: true })

  } catch (error: any) {
    logger.error(`Error in DELETE /api/custom-webhooks/${webhookId}:`, error)
    return errorResponse("Internal server error" , 500)
  }
} 