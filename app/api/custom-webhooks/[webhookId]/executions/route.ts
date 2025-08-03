import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

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

    // Verify the webhook belongs to the user
    const { data: webhook, error: webhookError } = await supabase
      .from('custom_webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (webhookError || !webhook) {
      return NextResponse.json({ error: "Webhook not found or unauthorized" }, { status: 404 })
    }

    // Get executions for this webhook
    const { data: executions, error } = await supabase
      .from('custom_webhook_executions')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('triggered_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error(`Error fetching executions for webhook ${webhookId}:`, error)
      return NextResponse.json({ error: "Failed to fetch executions" }, { status: 500 })
    }

    return NextResponse.json({ executions: executions || [] })

  } catch (error: any) {
    console.error(`Error in GET /api/custom-webhooks/${webhookId}/executions:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 