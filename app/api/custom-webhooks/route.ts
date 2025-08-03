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
      .from('custom_webhooks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching custom webhooks:', error)
      return NextResponse.json({ error: "Failed to fetch webhooks" }, { status: 500 })
    }

    return NextResponse.json({ webhooks: webhooks || [] })

  } catch (error: any) {
    console.error("Error in GET /api/custom-webhooks:", error)
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

    const { name, description, webhook_url, method, headers, body_template } = await request.json()

    if (!name || !webhook_url || !method) {
      return NextResponse.json({ 
        error: "Missing required fields: name, webhook_url, method" 
      }, { status: 400 })
    }

    // Validate URL
    try {
      new URL(webhook_url)
    } catch {
      return NextResponse.json({ error: "Invalid webhook URL" }, { status: 400 })
    }

    // Validate method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH']
    if (!validMethods.includes(method)) {
      return NextResponse.json({ error: "Invalid HTTP method" }, { status: 400 })
    }

    const { data: webhook, error } = await supabase
      .from('custom_webhooks')
      .insert({
        user_id: user.id,
        name,
        description: description || '',
        webhook_url,
        method,
        headers: headers || {},
        body_template: body_template || '',
        status: 'active',
        trigger_count: 0,
        error_count: 0
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating custom webhook:', error)
      return NextResponse.json({ error: "Failed to create webhook" }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      webhook,
      message: "Custom webhook created successfully" 
    })

  } catch (error: any) {
    console.error("Error in POST /api/custom-webhooks:", error)
    return NextResponse.json({ 
      error: "Internal server error",
      details: error.message 
    }, { status: 500 })
  }
} 