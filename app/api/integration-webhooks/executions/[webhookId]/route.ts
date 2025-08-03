import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  const supabase = await createSupabaseRouteHandlerClient()
  const { webhookId } = await params
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // For sample webhooks, return empty executions
    if (webhookId.includes('sample')) {
      return NextResponse.json({ executions: [] })
    }

    // Verify the webhook belongs to the user
    const { data: webhook, error: webhookError } = await supabase
      .from('integration_webhooks')
      .select('id')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (webhookError || !webhook) {
      return NextResponse.json({ error: "Webhook not found or unauthorized" }, { status: 404 })
    }

    // Get executions for this webhook
    const { data: executions, error } = await supabase
      .from('webhook_executions')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error(`Error fetching executions for webhook ${webhookId}:`, error)
      return NextResponse.json({ error: "Failed to fetch executions" }, { status: 500 })
    }

    return NextResponse.json({ executions: executions || [] })

  } catch (error: any) {
    console.error(`Error in GET /api/integration-webhooks/executions/${webhookId}:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 