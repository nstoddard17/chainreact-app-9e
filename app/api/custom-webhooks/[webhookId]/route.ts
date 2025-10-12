import { NextResponse } from "next/server"
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: webhook, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      logger.error(`Error fetching webhook ${webhookId}:`, error)
      return NextResponse.json({ error: "Webhook not found or unauthorized" }, { status: 404 })
    }

    return NextResponse.json(webhook)

  } catch (error: any) {
    logger.error(`Error in GET /api/custom-webhooks/${webhookId}:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      return NextResponse.json({ error: "Failed to update webhook" }, { status: 500 })
    }

    return NextResponse.json(webhook)

  } catch (error: any) {
    logger.error(`Error in PUT /api/custom-webhooks/${webhookId}:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from('webhook_configs')
      .delete()
      .eq('id', webhookId)
      .eq('user_id', user.id)

    if (error) {
      logger.error(`Error deleting webhook ${webhookId}:`, error)
      return NextResponse.json({ error: "Failed to delete webhook" }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    logger.error(`Error in DELETE /api/custom-webhooks/${webhookId}:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 