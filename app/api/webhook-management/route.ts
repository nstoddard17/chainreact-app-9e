import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { webhookManager } from "@/lib/webhooks/webhookManager"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('Auth error:', authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log('User authenticated:', user.id)

    // Get user's webhooks
    const webhooks = await webhookManager.getUserWebhooks(user.id)
    console.log('Webhooks fetched:', webhooks.length)
    
    return NextResponse.json(webhooks)
  } catch (error: any) {
    console.error("Error fetching webhooks:", error)
    return NextResponse.json(
      { error: "Failed to fetch webhooks", details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { workflowId, triggerType, providerId, config } = body

    if (!workflowId || !triggerType || !providerId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Verify workflow belongs to user
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("id")
      .eq("id", workflowId)
      .eq("user_id", user.id)
      .single()

    if (workflowError || !workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      )
    }

    // Register webhook
    const webhook = await webhookManager.registerWebhook(
      workflowId,
      user.id,
      triggerType,
      providerId,
      config
    )

    return NextResponse.json(webhook)
  } catch (error: any) {
    console.error("Error creating webhook:", error)
    return NextResponse.json(
      { error: "Failed to create webhook" },
      { status: 500 }
    )
  }
} 