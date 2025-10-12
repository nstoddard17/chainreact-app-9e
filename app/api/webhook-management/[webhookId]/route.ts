import { NextRequest, NextResponse } from "next/server"
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const webhook = await webhookManager.getWebhook(webhookId)
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    if (webhook.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json(webhook)
  } catch (error: any) {
    logger.error(`Error fetching webhook ${webhookId}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify webhook belongs to user
    const webhook = await webhookManager.getWebhook(webhookId)
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    if (webhook.userId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Unregister webhook
    await webhookManager.unregisterWebhook(webhookId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error(`Error deleting webhook ${webhookId}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 