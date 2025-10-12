import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: webhooks, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching custom webhooks:', error)
      return NextResponse.json({ error: "Failed to fetch webhooks" }, { status: 500 })
    }

    return NextResponse.json({ webhooks: webhooks || [] })

  } catch (error: any) {
    logger.error("Error in GET /api/custom-webhooks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, webhook_url, method, headers, body_template } = body

    if (!name || !webhook_url) {
      return NextResponse.json({ error: "Name and webhook URL are required" }, { status: 400 })
    }

    const { data: webhook, error } = await supabase
      .from('webhook_configs')
      .insert({
        user_id: user.id,
        name,
        description,
        webhook_url,
        method: method || 'POST',
        headers: headers || {},
        body_template: body_template || '',
        trigger_type: 'custom',
        provider_id: 'custom',
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating custom webhook:', error)
      return NextResponse.json({ error: "Failed to create webhook" }, { status: 500 })
    }

    return NextResponse.json({ webhook })

  } catch (error: any) {
    logger.error("Error in POST /api/custom-webhooks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 