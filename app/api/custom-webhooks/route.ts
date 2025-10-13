import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const { data: webhooks, error } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching custom webhooks:', error)
      return errorResponse("Failed to fetch webhooks" , 500)
    }

    return jsonResponse({ webhooks: webhooks || [] })

  } catch (error: any) {
    logger.error("Error in GET /api/custom-webhooks:", error)
    return errorResponse("Internal server error" , 500)
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const body = await request.json()
    const { name, description, webhook_url, method, headers, body_template } = body

    if (!name || !webhook_url) {
      return errorResponse("Name and webhook URL are required" , 400)
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
      return errorResponse("Failed to create webhook" , 500)
    }

    return jsonResponse({ webhook })

  } catch (error: any) {
    logger.error("Error in POST /api/custom-webhooks:", error)
    return errorResponse("Internal server error" , 500)
  }
} 