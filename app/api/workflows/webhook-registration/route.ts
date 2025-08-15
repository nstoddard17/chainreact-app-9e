import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { TriggerWebhookManager } from "@/lib/webhooks/triggerWebhookManager"

const webhookManager = new TriggerWebhookManager()

export async function POST(request: Request) {
  console.log('🚨🚨🚨 WEBHOOK REGISTRATION API CALLED! 🚨🚨🚨')
  
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { workflowId, triggerType, providerId, config } = await request.json()

    if (!workflowId || !triggerType || !providerId) {
      return NextResponse.json({ 
        error: "Missing required fields: workflowId, triggerType, providerId" 
      }, { status: 400 })
    }

    // Check if trigger supports webhooks
    const supportedTriggers = webhookManager.getWebhookSupportedTriggers()
    const isSupported = supportedTriggers.some(trigger => trigger.type === triggerType)

    if (!isSupported) {
      return NextResponse.json({ 
        error: "This trigger type does not support webhooks",
        supportedTriggers: supportedTriggers.map(t => t.type)
      }, { status: 400 })
    }

    // Get webhook URL for this workflow
    const webhookUrl = webhookManager.getWebhookUrl(workflowId, providerId)

    // Register the webhook
    console.log('🔧 About to call webhookManager.registerWebhook with:', {
      workflowId,
      userId: user.id,
      triggerType,
      providerId,
      config: config || {},
      webhookUrl
    })
    
    let webhookId
    try {
      webhookId = await webhookManager.registerWebhook({
        workflowId,
        userId: user.id,
        triggerType,
        providerId,
        config: config || {},
        webhookUrl
      })
      console.log('🎉 webhookManager.registerWebhook completed, webhookId:', webhookId)
    } catch (error) {
      console.error('❌ Error in webhookManager.registerWebhook:', error)
      throw error
    }

    console.log(`✅ Webhook registered successfully:`, {
      workflowId,
      triggerType,
      providerId,
      webhookUrl,
      webhookId
    })

    return NextResponse.json({
      success: true,
      webhookId,
      webhookUrl,
      message: "🚨 DISCORD GATEWAY SHOULD BE CONNECTED NOW! 🚨",
      debugInfo: {
        apiCalled: true,
        serverReceived: true,
        discordProcessed: true
      }
    })

  } catch (error: any) {
    console.error("Error registering webhook:", error)
    return NextResponse.json({ 
      error: "Failed to register webhook",
      details: error.message 
    }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('webhookId')

    if (!webhookId) {
      return NextResponse.json({ error: "Missing webhookId parameter" }, { status: 400 })
    }

    // Verify the webhook belongs to the user
    const { data: webhookConfig } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single()

    if (!webhookConfig) {
      return NextResponse.json({ error: "Webhook not found or unauthorized" }, { status: 404 })
    }

    // Unregister the webhook
    await webhookManager.unregisterWebhook(webhookId)

    return NextResponse.json({
      success: true,
      message: "Webhook unregistered successfully"
    })

  } catch (error: any) {
    console.error("Error unregistering webhook:", error)
    return NextResponse.json({ 
      error: "Failed to unregister webhook",
      details: error.message 
    }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('webhookId')

    if (webhookId) {
      // Get specific webhook details
      const { data: webhookConfig } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('id', webhookId)
        .eq('user_id', user.id)
        .single()

      if (!webhookConfig) {
        return NextResponse.json({ error: "Webhook not found" }, { status: 404 })
      }

      // Get recent executions
      const executions = await webhookManager.getWebhookExecutions(webhookId, 10)

      return NextResponse.json({
        webhook: webhookConfig,
        executions
      })
    } else {
      // Get all user's webhooks
      const webhooks = await webhookManager.getUserWebhooks(user.id)
      
      return NextResponse.json({
        webhooks,
        supportedTriggers: webhookManager.getWebhookSupportedTriggers().map(t => ({
          type: t.type,
          title: t.title,
          description: t.description,
          providerId: t.providerId
        }))
      })
    }

  } catch (error: any) {
    console.error("Error fetching webhooks:", error)
    return NextResponse.json({ 
      error: "Failed to fetch webhooks",
      details: error.message 
    }, { status: 500 })
  }
} 