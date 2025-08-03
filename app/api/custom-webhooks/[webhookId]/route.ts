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

    const { data: webhook, error } = await supabase
      .from('custom_webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error(`Error fetching custom webhook ${webhookId}:`, error)
      return NextResponse.json({ error: "Webhook not found or unauthorized" }, { status: 404 })
    }

    return NextResponse.json({ webhook })

  } catch (error: any) {
    console.error(`Error in GET /api/custom-webhooks/${webhookId}:`, error)
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

    // Verify the webhook belongs to the user
    const { data: webhook, error: fetchError } = await supabase
      .from('custom_webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !webhook) {
      return NextResponse.json({ error: "Webhook not found or unauthorized" }, { status: 404 })
    }

    // Delete the webhook
    const { error: deleteError } = await supabase
      .from('custom_webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error(`Error deleting custom webhook ${webhookId}:`, deleteError)
      return NextResponse.json({ error: "Failed to delete webhook" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Custom webhook deleted successfully"
    })

  } catch (error: any) {
    console.error(`Error in DELETE /api/custom-webhooks/${webhookId}:`, error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 