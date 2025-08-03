import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: webhooks, error } = await supabase
      .from('integration_webhooks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching integration webhooks:', error)
      return NextResponse.json({ error: "Failed to fetch webhooks" }, { status: 500 })
    }

    return NextResponse.json({ webhooks: webhooks || [] })

  } catch (error: any) {
    console.error("Error in GET /api/integration-webhooks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 